import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api';

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ensurePdfJsPolyfills } from './polyfills';

ensurePdfJsPolyfills();
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type PdfOutlineNode = {
  title: string;
  dest: string | Array<unknown> | null;
  items: PdfOutlineNode[];
};

export type OutlineItem = {
  title: string;
  pageNumber: number | null;
  items: OutlineItem[];
};

export async function loadPdfFromData(
  data: ArrayBuffer,
): Promise<PDFDocumentProxy> {
  const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
  return loadingTask.promise;
}

export async function loadPdfFromFile(file: File): Promise<{
  pdf: PDFDocumentProxy;
  bytes: ArrayBuffer;
}> {
  const bytes = await file.arrayBuffer();
  const pdf = await loadPdfFromData(bytes);
  return { pdf, bytes };
}

async function resolveOutlineDest(
  pdf: PDFDocumentProxy,
  dest: PdfOutlineNode['dest'],
): Promise<number | null> {
  try {
    let explicitDest = dest;
    if (typeof dest === 'string') {
      explicitDest = await pdf.getDestination(dest);
    }
    if (!explicitDest || !Array.isArray(explicitDest) || !explicitDest[0]) {
      return null;
    }
    const pageIndex = await pdf.getPageIndex(explicitDest[0] as never);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

async function mapOutline(
  pdf: PDFDocumentProxy,
  nodes: PdfOutlineNode[] | null,
): Promise<OutlineItem[]> {
  if (!nodes?.length) return [];
  const result: OutlineItem[] = [];
  for (const node of nodes) {
    const pageNumber = await resolveOutlineDest(pdf, node.dest);
    result.push({
      title: node.title || '（無標題）',
      pageNumber,
      items: await mapOutline(pdf, node.items ?? null),
    });
  }
  return result;
}

export async function getOutline(
  pdf: PDFDocumentProxy,
): Promise<OutlineItem[]> {
  const outline = (await pdf.getOutline()) as PdfOutlineNode[] | null;
  return mapOutline(pdf, outline);
}

export function startPageRender(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): {
  promise: Promise<{
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }>;
  cancel: () => void;
} {
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  // pdfjs v5+：優先傳 canvas；勿同時傳 canvasContext
  const task = page.render({
    canvas,
    viewport,
    transform,
    background: '#ffffff',
  });

  const base = page.getViewport({ scale: 1 });
  return {
    cancel: () => {
      try {
        task.cancel();
      } catch {
        /* ignore */
      }
    },
    promise: task.promise.then(() => ({
      width: viewport.width,
      height: viewport.height,
      pageWidth: base.width,
      pageHeight: base.height,
    })),
  };
}

export type { PDFDocumentProxy, PDFPageProxy };
