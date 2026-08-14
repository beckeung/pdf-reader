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

export type Annotation =
  | HighlightAnnotation
  | LineAnnotation
  | InkAnnotation
  | NoteAnnotation;

export type ToolMode =
  | 'pan'
  | 'highlight'
  | 'line'
  | 'ink'
  | 'note';

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
    }
  }

  return doc.save();
}
