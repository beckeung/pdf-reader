import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type Point = { x: number; y: number };

export type HighlightAnnotation = {
  id: string;
  type: 'highlight';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type LineAnnotation = {
  id: string;
  type: 'line';
  pageIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
};

export type InkAnnotation = {
  id: string;
  type: 'ink';
  pageIndex: number;
  points: Point[];
  color: string;
  strokeWidth: number;
};

export type NoteAnnotation = {
  id: string;
  type: 'note';
  pageIndex: number;
  x: number;
  y: number;
  text: string;
  color: string;
};

/** Free text box; x/y are PDF bottom-left of the box. */
export type TextAnnotation = {
  id: string;
  type: 'text';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
};

export type Annotation =
  | HighlightAnnotation
  | LineAnnotation
  | InkAnnotation
  | NoteAnnotation
  | TextAnnotation;

export type ToolMode =
  | 'pan'
  | 'highlight'
  | 'line'
  | 'ink'
  | 'note'
  | 'text';

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const num = Number.parseInt(full, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

const PRINT_FONT =
  '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", sans-serif';

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    let line = '';
    for (const ch of paragraph) {
      const trial = line + ch;
      if (ctx.measureText(trial).width > maxWidth && line) {
        result.push(line);
        line = ch;
      } else {
        line = trial;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

/** Rasterize text box so CJK / any glyphs print correctly in the PDF. */
async function embedPrintableTextBox(
  doc: PDFDocument,
  ann: TextAnnotation,
): Promise<void> {
  const page = doc.getPages()[ann.pageIndex];
  if (!page || !ann.text.trim()) return;

  const dpr = 2;
  const cssW = Math.max(8, ann.width);
  const cssH = Math.max(8, ann.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const fontSize = Math.max(8, Math.min(72, ann.fontSize));
  ctx.fillStyle = ann.color;
  ctx.font = `${fontSize}px ${PRINT_FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const pad = 4;
  const lines = wrapCanvasLines(ctx, ann.text, cssW - pad * 2);
  const lineHeight = fontSize * 1.25;
  let y = pad;
  for (const line of lines) {
    if (y + fontSize > cssH - pad) break;
    ctx.fillText(line, pad, y);
    y += lineHeight;
  }

  const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('無法產生可列印文字圖層'));
          return;
        }
        void blob.arrayBuffer().then((buf) => {
          resolve(new Uint8Array(buf));
        }, reject);
      },
      'image/png',
    );
  });

  const image = await doc.embedPng(pngBytes);
  page.drawImage(image, {
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
  });
}

export async function exportPdfWithAnnotations(
  sourceBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBytes.slice(0), {
    ignoreEncryption: true,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const ann of annotations) {
    const page = pages[ann.pageIndex];
    if (!page) continue;
    const color = hexToRgb(ann.color);

    if (ann.type === 'highlight') {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.35,
        borderWidth: 0,
      });
    } else if (ann.type === 'line') {
      page.drawLine({
        start: { x: ann.x1, y: ann.y1 },
        end: { x: ann.x2, y: ann.y2 },
        thickness: ann.strokeWidth,
        color: rgb(color.r, color.g, color.b),
      });
    } else if (ann.type === 'ink') {
      for (let i = 1; i < ann.points.length; i += 1) {
        const a = ann.points[i - 1];
        const b = ann.points[i];
        page.drawLine({
          start: { x: a.x, y: a.y },
          end: { x: b.x, y: b.y },
          thickness: ann.strokeWidth,
          color: rgb(color.r, color.g, color.b),
        });
      }
    } else if (ann.type === 'note') {
      const size = 12;
      page.drawRectangle({
        x: ann.x,
        y: ann.y - 2,
        width: 12,
        height: 12,
        color: rgb(color.r, color.g, color.b),
      });
      // Helvetica 僅支援 WinAnsi；中文等字元改以「?」佔位，色塊仍保留
      const safe = ann.text
        .slice(0, 200)
        .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
      if (safe.trim()) {
        page.drawText(safe, {
          x: ann.x + 16,
          y: ann.y,
          size,
          font,
          color: rgb(0.15, 0.15, 0.15),
          maxWidth: 200,
        });
      }
    } else if (ann.type === 'text') {
      // 可列印文字：以系統字型點陣嵌入，支援中文等字元
      await embedPrintableTextBox(doc, ann);
    }
  }

  return doc.save();
}
