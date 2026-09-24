import { create } from 'zustand';
import type { PDFDocumentProxy } from '../lib/pdfjs';
import type { Annotation, TextAnnotation, ToolMode } from '../lib/annotations';
import type { OutlineItem } from '../lib/pdfjs';
import { getOutline, loadPdfFromData, loadPdfFromFile } from '../lib/pdfjs';
import { createId } from '../lib/annotations';
import {
  clampZoomPercent,
  nextZoomStep,
} from '../lib/zoom';
import { deletePages, remapPageAfterDelete, rotatePages, savePdfAs, writeBytesToHandle } from '../lib/pdfOps';
import { exportPdfWithAnnotations } from '../lib/annotations';

export type ZoomMode = 'percent' | 'fit-width' | 'fit-page';
export type DisplayMode = 'one-page' | 'fit-width' | 'multi-page';

type TextClipboard = Omit<TextAnnotation, 'id'>;

function clampPage(page: number, pageCount: number): number | null {
  if (pageCount < 1) return null;
  return Math.min(Math.max(1, Math.round(page)), pageCount);
}

function remapAnnotations(
  annotations: Annotation[],
  deletedPages: number[],
): Annotation[] {
  const deleted = new Set(deletedPages);
  const next: Annotation[] = [];
  for (const ann of annotations) {
    const oldPage = ann.pageIndex + 1;
    if (deleted.has(oldPage)) continue;
    const mapped = remapPageAfterDelete(oldPage, deletedPages);
    if (mapped == null) continue;
    next.push({ ...ann, pageIndex: mapped - 1 });
  }
  return next;
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
  selectedPages: number[];
  selectionAnchor: number | null;
  fileHandle: FileSystemFileHandle | null;
  selectedTextId: string | null;
  textClipboard: TextClipboard | null;

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
  setSelectedTextId: (id: string | null) => void;
  copySelectedTextBox: (id?: string) => boolean;
  pasteTextBox: () => boolean;
  selectOnlyPage: (page: number) => void;
  togglePageSelected: (page: number) => void;
  selectPageRange: (page: number) => void;
  clearPageSelection: () => void;
  deleteSelectedPages: () => Promise<void>;
  rotateSelectedOrCurrent: (deltaDegrees?: 90 | -90 | 180) => Promise<void>;
  saveDocument: () => Promise<void>;
  saveDocumentAs: () => Promise<void>;
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
  selectedPages: [],
  selectionAnchor: null,
  fileHandle: null,
  selectedTextId: null,
  textClipboard: null,

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
        selectedPages: [],
        selectionAnchor: null,
        fileHandle: null,
        selectedTextId: null,
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
      selectedTextId:
        state.selectedTextId === id ? null : state.selectedTextId,
    })),

  clearAnnotations: () => set({ annotations: [], selectedTextId: null }),

  setSelectedTextId: (selectedTextId) => set({ selectedTextId }),

  copySelectedTextBox: (id) => {
    const { selectedTextId, annotations } = get();
    const targetId = id ?? selectedTextId;
    if (!targetId) return false;
    const ann = annotations.find((a) => a.id === targetId);
    if (!ann || ann.type !== 'text') return false;
    const { id: _id, ...rest } = ann;
    set({ textClipboard: rest, selectedTextId: targetId });
    void navigator.clipboard?.writeText(ann.text).catch(() => {
      /* ignore clipboard permission errors */
    });
    return true;
  },

  pasteTextBox: () => {
    const { textClipboard, currentPage, annotations } = get();
    if (!textClipboard) return false;
    const offset = 18;
    const id = createId();
    const pageIndex = currentPage - 1;
    const pasted: TextAnnotation = {
      ...textClipboard,
      id,
      type: 'text',
      pageIndex,
      x: textClipboard.x + offset,
      y: Math.max(0, textClipboard.y - offset),
    };
    set({
      annotations: [...annotations, pasted],
      selectedTextId: id,
    });
    return true;
  },

  selectOnlyPage: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    set({ selectedPages: [next], selectionAnchor: next });
  },

  togglePageSelected: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    const { selectedPages } = get();
    const setPages = new Set(selectedPages);
    if (setPages.has(next)) setPages.delete(next);
    else setPages.add(next);
    set({
      selectedPages: [...setPages].sort((a, b) => a - b),
      selectionAnchor: next,
    });
  },

  selectPageRange: (page) => {
    const next = clampPage(page, get().pageCount);
    if (next == null) return;
    const { selectionAnchor, selectedPages, pageCount } = get();
    const anchor = selectionAnchor ?? selectedPages[0] ?? next;
    const start = Math.min(anchor, next);
    const end = Math.max(anchor, next);
    const range: number[] = [];
    for (let p = start; p <= end && p <= pageCount; p += 1) {
      range.push(p);
    }
    set({ selectedPages: range, selectionAnchor: anchor });
  },

  clearPageSelection: () => set({ selectedPages: [], selectionAnchor: null }),

  deleteSelectedPages: async () => {
    const {
      fileBytes,
      selectedPages,
      pageCount,
      currentPage,
      annotations,
      fileName,
      pdf: prevPdf,
    } = get();
    if (!fileBytes || selectedPages.length === 0) return;
    if (selectedPages.length >= pageCount) {
      set({ error: '至少需保留一頁' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const saved = await deletePages(fileBytes, selectedPages);
      const bytes = saved.buffer.slice(
        saved.byteOffset,
        saved.byteOffset + saved.byteLength,
      ) as ArrayBuffer;
      if (prevPdf) {
        await prevPdf.cleanup();
      }
      const pdf = await loadPdfFromData(bytes);
      const outline = await getOutline(pdf);
      const remappedAnns = remapAnnotations(annotations, selectedPages);
      let nextCurrent =
        remapPageAfterDelete(currentPage, selectedPages) ?? 1;
      nextCurrent = clampPage(nextCurrent, pdf.numPages) ?? 1;
      set({
        pdf,
        fileBytes: bytes,
        fileName,
        pageCount: pdf.numPages,
        currentPage: nextCurrent,
        outline,
        annotations: remappedAnns,
        selectedPages: [],
        selectionAnchor: null,
        scrollRequestPage: nextCurrent,
        selectedTextId: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '刪除頁面失敗';
      set({ loading: false, error: message });
    }
  },

  rotateSelectedOrCurrent: async (deltaDegrees = 90) => {
    const {
      fileBytes,
      selectedPages,
      currentPage,
      annotations,
      fileName,
      pdf: prevPdf,
    } = get();
    if (!fileBytes) {
      set({ error: '請先開啟 PDF' });
      return;
    }
    const targets =
      selectedPages.length > 0 ? selectedPages : [currentPage];
    set({ loading: true, error: null });
    try {
      const saved = await rotatePages(fileBytes, targets, deltaDegrees);
      const bytes = saved.buffer.slice(
        saved.byteOffset,
        saved.byteOffset + saved.byteLength,
      ) as ArrayBuffer;
      if (prevPdf) {
        await prevPdf.cleanup();
      }
      const pdf = await loadPdfFromData(bytes);
      const outline = await getOutline(pdf);
      const rotated = new Set(targets);
      // 旋轉後座標會錯位，清除受影響頁的標注
      const keptAnns = annotations.filter(
        (a) => !rotated.has(a.pageIndex + 1),
      );
      set({
        pdf,
        fileBytes: bytes,
        fileName,
        pageCount: pdf.numPages,
        outline,
        annotations: keptAnns,
        selectedTextId: null,
        scrollRequestPage: currentPage,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '旋轉失敗';
      set({ loading: false, error: message });
    }
  },

  saveDocument: async () => {
    const { fileBytes, fileHandle, annotations } = get();
    if (!fileBytes) {
      set({ error: '請先開啟 PDF' });
      return;
    }
    if (!fileHandle) {
      await get().saveDocumentAs();
      return;
    }
    try {
      const bytes =
        annotations.length > 0
          ? await exportPdfWithAnnotations(fileBytes, annotations)
          : new Uint8Array(fileBytes);
      await writeBytesToHandle(fileHandle, bytes);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '儲存失敗',
      });
    }
  },

  saveDocumentAs: async () => {
    const { fileBytes, fileName, annotations } = get();
    if (!fileBytes) {
      set({ error: '請先開啟 PDF' });
      return;
    }
    try {
      const bytes =
        annotations.length > 0
          ? await exportPdfWithAnnotations(fileBytes, annotations)
          : new Uint8Array(fileBytes);
      const suggested = fileName || 'document.pdf';
      const handle = await savePdfAs(bytes, suggested);
      if (handle) {
        set({ fileHandle: handle, fileName: handle.name || suggested });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '另存新檔失敗',
      });
    }
  },
}));

export { createId };
