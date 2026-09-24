import { PDFDocument, rgb } from 'pdf-lib';
import {
  getGridCells,
  getPageCount,
  getPhotoCaptionBox,
  getReportPageDims,
  type PhotoReportItem,
  type PhotoReportPhoto,
  type PhotoReportText,
  type ReportPageOrientation,
  type ReportPageSize,
} from '../store/usePhotoReportStore';
import { downloadBytes } from './pdfOps';

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

async function urlToBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function embedImageFromUrl(doc: PDFDocument, url: string) {
  if (url.startsWith('data:image/png')) {
    return doc.embedPng(await urlToBytes(url));
  }
  if (
    url.startsWith('data:image/jpeg') ||
    url.startsWith('data:image/jpg')
  ) {
    return doc.embedJpg(await urlToBytes(url));
  }

  const bytes = await urlToBytes(url);
  // Prepared report photos are JPEG blobs; try jpg then png.
  try {
    return await doc.embedJpg(bytes);
  } catch {
    /* fall through */
  }
  try {
    return await doc.embedPng(bytes);
  } catch {
    /* fall through */
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('無法載入圖片'));
    el.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 1;
  canvas.height = img.naturalHeight || 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法轉換圖片');
  ctx.drawImage(img, 0, 0);
  const png = await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('無法轉換圖片'));
      void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/png');
  });
  canvas.width = 0;
  canvas.height = 0;
  return doc.embedPng(png);
}

/** Bake clockwise rotation into a PNG so layout box stays axis-aligned. */
async function embedRotatedPhoto(doc: PDFDocument, photo: PhotoReportPhoto) {
  const rot = ((photo.rotation ?? 0) % 360 + 360) % 360;
  if (rot === 0) {
    return embedImageFromUrl(doc, photo.src);
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('無法載入圖片'));
    el.src = photo.src;
  });
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const canvas = document.createElement('canvas');
  if (rot === 90 || rot === 270) {
    canvas.width = nh;
    canvas.height = nw;
  } else {
    canvas.width = nw;
    canvas.height = nh;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法旋轉圖片');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -nw / 2, -nh / 2);
  const png = await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('無法旋轉圖片'));
      void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/png');
  });
  canvas.width = 0;
  canvas.height = 0;
  return doc.embedPng(png);
}

async function rasterizeTextBlock(item: PhotoReportText) {
  const dpr = 2;
  const cssW = Math.max(8, item.width);
  const cssH = Math.max(8, item.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法繪製文字');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const fontSize = Math.max(8, Math.min(72, item.fontSize));
  ctx.fillStyle = item.color;
  ctx.font = `${fontSize}px ${PRINT_FONT}`;
  ctx.textBaseline = 'top';
  const pad = 4;
  const lines = wrapCanvasLines(ctx, item.text || ' ', cssW - pad * 2);
  const lineHeight = fontSize * 1.25;
  let y = pad;
  for (const line of lines) {
    if (y + fontSize > cssH - pad) break;
    ctx.fillText(line, pad, y);
    y += lineHeight;
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('無法產生文字圖層'));
        return;
      }
      void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/png');
  });
}

async function drawPageHeader(
  doc: PDFDocument,
  page: ReturnType<PDFDocument['addPage']>,
  title: string,
  pageNote: string,
  pageWidth: number,
  pageHeight: number,
) {
  const titleCanvas = document.createElement('canvas');
  const tDpr = 2;
  const headerH = 52;
  titleCanvas.width = Math.ceil((pageWidth - 80) * tDpr);
  titleCanvas.height = Math.ceil(headerH * tDpr);
  const tctx = titleCanvas.getContext('2d');
  if (!tctx) return;
  tctx.setTransform(tDpr, 0, 0, tDpr, 0, 0);
  tctx.clearRect(0, 0, pageWidth - 80, headerH);
  tctx.fillStyle = '#1a1f1c';
  tctx.font = `bold 18px ${PRINT_FONT}`;
  tctx.textBaseline = 'top';
  tctx.fillText(title.trim() || '（報告標題）', 0, 2);
  tctx.font = `13px ${PRINT_FONT}`;
  tctx.fillStyle = '#3d4740';
  const note = pageNote.trim();
  if (note) tctx.fillText(note, 0, 26);
  const titlePng = await new Promise<Uint8Array>((resolve, reject) => {
    titleCanvas.toBlob((blob) => {
      if (!blob) return reject(new Error('標題失敗'));
      void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/png');
  });
  const titleImg = await doc.embedPng(titlePng);
  page.drawImage(titleImg, {
    x: 40,
    y: pageHeight - 18 - headerH,
    width: pageWidth - 80,
    height: headerH,
  });
  page.drawLine({
    start: { x: 40, y: pageHeight - 78 },
    end: { x: pageWidth - 40, y: pageHeight - 78 },
    thickness: 0.75,
    color: rgb(0.75, 0.72, 0.68),
  });
}

export async function generatePhotoReportPdf(
  title: string,
  items: PhotoReportItem[],
  pageNotes: Record<number, string> = {},
  gridCols = 2,
  gridRows = 2,
  pageSize: ReportPageSize = 'A4',
  pageOrientation: ReportPageOrientation = 'portrait',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageCount = getPageCount(items);
  const { width: pageW, height: pageH } = getReportPageDims(
    pageSize,
    pageOrientation,
  );
  const cells = getGridCells(gridCols, gridRows, pageSize, pageOrientation);

  for (let p = 0; p < pageCount; p += 1) {
    const page = doc.addPage([pageW, pageH]);
    const pageItems = items.filter((i) => i.pageIndex === p);
    await drawPageHeader(
      doc,
      page,
      title,
      pageNotes[p] ?? '',
      pageW,
      pageH,
    );

    for (const item of pageItems) {
      if (item.type === 'photo') {
        const image = await embedRotatedPhoto(doc, item);
        page.drawImage(image, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
        const caption = (item.caption ?? '').trim();
        if (caption) {
          const box = getPhotoCaptionBox(item, cells);
          const png = await rasterizeTextBlock({
            id: item.id,
            type: 'text',
            pageIndex: item.pageIndex,
            text: caption,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            fontSize: 10,
            color: '#1a1f1c',
          });
          const captionImg = await doc.embedPng(png);
          page.drawImage(captionImg, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          });
        }
      } else if (item.type === 'text' && item.text.trim()) {
        const png = await rasterizeTextBlock(item);
        const image = await doc.embedPng(png);
        page.drawImage(image, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
      }
    }
  }

  if (pageCount === 0) {
    const page = doc.addPage([pageW, pageH]);
    await drawPageHeader(doc, page, title, '', pageW, pageH);
  }

  return doc.save();
}

export async function downloadPhotoReportPdf(
  title: string,
  items: PhotoReportItem[],
  pageNotes: Record<number, string> = {},
  gridCols = 2,
  gridRows = 2,
  pageSize: ReportPageSize = 'A4',
  pageOrientation: ReportPageOrientation = 'portrait',
) {
  const bytes = await generatePhotoReportPdf(
    title,
    items,
    pageNotes,
    gridCols,
    gridRows,
    pageSize,
    pageOrientation,
  );
  const safe = (title || '相片報告').replace(/[\\/:*?"<>|]+/g, '_');
  downloadBytes(bytes, `${safe}.pdf`);
}
