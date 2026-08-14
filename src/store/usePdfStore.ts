import { create } from 'zustand';
import type { PDFDocumentProxy } from '../lib/pdfjs';
import type { Annotation, ToolMode } from '../lib/annotations';
import type { OutlineItem } from '../lib/pdfjs';
import { getOutline, loadPdfFromFile } from '../lib/pdfjs';
import { createId } from '../lib/annotations';
import {
  clampZoomPercent,
  nextZoomStep,
} from '../lib/zoom';

export type ZoomMode = 'percent' | 'fit-width' | 'fit-page';
export type DisplayMode = 'one-page' | 'fit-width' | 'multi-page';

function clampPage(page: number, pageCount: number): number | null {
  if (pageCount < 1) return null;
  return Math.min(Math.max(1, Math.round(page)), pageCount);
}

type PdfState = {
  fileName: string | null;
  fileBytes: ArrayBuffer | null;
  pdf: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  scale: number;
  zoomMode: ZoomMode;
  zoomPercent: number;
  displayMode: DisplayMode;
  scrollRequestPage: number | null;
  outline: OutlineItem[];
  tool: ToolMode;
  annotations: Annotation[];
  annotationColor: string;
  error: string | null;
  loading: boolean;
  mergeOpen: boolean;
  splitOpen: boolean;
  sidebarOpen: boolean;

  setError: (error: string | null) => void;
  setTool: (tool: ToolMode) => void;
  setAnnotationColor: (color: string) => void;
  setMergeOpen: (open: boolean) => void;
  setSplitOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentPage: (page: number) => void;
  goToPage: (page: number) => void;
  syncCurrentPage: (page: number) => void;
  clearScrollRequest: () => void;
  setZoomPercent: (percent: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomByFactor: (factor: number) => void;
  resetZoom: () => void;
  setZoomMode: (mode: ZoomMode) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setScale: (scale: number) => void;
  openFile: (file: File) => Promise<void>;
  openFromUrl: (url: string, fileName: string) => Promise<void>;
  addAnnotation: (ann: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
};

export const usePdfStore = create<PdfState>((set, get) => ({
  fileName: null,
  fileBytes: null,
  pdf: null,
  pageCount: 0,
  currentPage: 1,
  scale: 1,
  zoomMode: 'fit-width',
  zoomPercent: 100,
  displayMode: 'fit-width',
  scrollRequestPage: null,
  outline: [],
  tool: 'pan',
  annotations: [],
  annotationColor: '#f4d03f',
  error: null,
  loading: false,
  mergeOpen: false,
  splitOpen: false,
  sidebarOpen: true,

  setError: (error) => set({ error }),
  setTool: (tool) => set({ tool }),
  setAnnotationColor: (annotationColor) => set({ annotationColor }),
  setMergeOpen: (mergeOpen) => set({ mergeOpen }),
  setSplitOpen: (splitOpen) => set({ splitOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  setCurrentPage: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    set({ currentPage: next });
  },

  goToPage: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    set({ currentPage: next, scrollRequestPage: next });
  },

  syncCurrentPage: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    if (get().currentPage === next) return;
    set({ currentPage: next });
  },

  clearScrollRequest: () => set({ scrollRequestPage: null }),

  setZoomPercent: (percent) => {
    const clamped = clampZoomPercent(percent);
    set({
      zoomMode: 'percent',
      zoomPercent: clamped,
      scale: clamped / 100,
    });
  },

  zoomIn: () => {
    const { zoomPercent, setZoomPercent } = get();
    setZoomPercent(nextZoomStep(zoomPercent, 1));
  },

  zoomOut: () => {
    const { zoomPercent, setZoomPercent } = get();
    setZoomPercent(nextZoomStep(zoomPercent, -1));
  },

  zoomByFactor: (factor) => {
    const { scale, setZoomPercent } = get();
    setZoomPercent(scale * factor * 100);
  },

  resetZoom: () => {
    get().setZoomPercent(100);
  },

  setZoomMode: (zoomMode) => set({ zoomMode }),
  setDisplayMode: (displayMode) => {
    if (displayMode === 'one-page') {
      set({ displayMode, zoomMode: 'fit-page', scrollRequestPage: null });
    } else if (displayMode === 'fit-width') {
      set({ displayMode, zoomMode: 'fit-width', scrollRequestPage: null });
    } else {
      set({ displayMode, zoomMode: 'fit-width', scrollRequestPage: null });
    }
  },
  setScale: (scale) => set({ scale }),

  openFile: async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      set({ error: '請選擇 PDF 檔案' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const prev = get().pdf;
      if (prev) {
        await prev.cleanup();
      }
      const { pdf, bytes } = await loadPdfFromFile(file);
      const outline = await getOutline(pdf);
      set({
        pdf,
        fileBytes: bytes,
        fileName: file.name,
        pageCount: pdf.numPages,
        currentPage: 1,
        outline,
        annotations: [],
        loading: false,
        error: null,
        zoomMode: 'fit-width',
        displayMode: 'fit-width',
        scrollRequestPage: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '無法開啟 PDF 檔案';
      set({ loading: false, error: message });
    }
  },

  openFromUrl: async (url, fileName) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`無法載入測試檔（${res.status}）`);
      }
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await get().openFile(file);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '無法載入測試檔';
      set({ loading: false, error: message });
    }
  },

  addAnnotation: (ann) =>
    set((state) => ({ annotations: [...state.annotations, ann] })),

  updateAnnotation: (id, patch) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    })),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    })),

  clearAnnotations: () => set({ annotations: [] }),
}));

export { createId };
