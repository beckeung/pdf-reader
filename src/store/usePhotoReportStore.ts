import { create } from 'zustand';
import { createId } from '../lib/annotations';
import {
  DEFAULT_FILENAME_PAGE_RULE,
  groupFilesByRoom,
  parseRoomPhotoName,
  type FilenamePageRule,
  type PhotoInsertMode,
  type PhotoSortDirection,
} from '../lib/photoNamePaging';

export type PhotoRotation = 0 | 90 | 180 | 270;

export type PhotoReportPhoto = {
  id: string;
  type: 'photo';
  src: string;
  name: string;
  /** 0-based report page */
  pageIndex: number;
  /** 0-based cell index, row-major top-left */
  slot: number;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise degrees from original */
  rotation: PhotoRotation;
  /** Description shown under the photo */
  caption: string;
};

export function normalizePhotoRotation(deg: number): PhotoRotation {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return n as PhotoRotation;
}

/** Natural size after applying rotation (for layout fit). */
export function rotatedNaturalSize(
  naturalWidth: number,
  naturalHeight: number,
  rotation: number = 0,
): { w: number; h: number } {
  const rot = normalizePhotoRotation(rotation);
  if (rot === 90 || rot === 270) {
    return { w: Math.max(1, naturalHeight), h: Math.max(1, naturalWidth) };
  }
  return { w: Math.max(1, naturalWidth), h: Math.max(1, naturalHeight) };
}

export type PhotoReportText = {
  id: string;
  type: 'text';
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
};

export type PhotoReportItem = PhotoReportPhoto | PhotoReportText;

/** Paper size in PDF points (72pt = 1in). Portrait base dims. */
export type ReportPageSize = 'A4' | 'A3';
export type ReportPageOrientation = 'portrait' | 'landscape';

export const REPORT_PAGE_SIZES: Record<
  ReportPageSize,
  { width: number; height: number; label: string }
> = {
  A4: { width: 595, height: 842, label: 'A4' },
  A3: { width: 842, height: 1191, label: 'A3' },
};

export function getReportPageDims(
  pageSize: ReportPageSize = 'A4',
  orientation: ReportPageOrientation = 'portrait',
): {
  width: number;
  height: number;
} {
  const base = REPORT_PAGE_SIZES[pageSize] ?? REPORT_PAGE_SIZES.A4;
  if (orientation === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

/** @deprecated A4 portrait defaults — prefer getReportPageDims(...) */
export const REPORT_PAGE_WIDTH = REPORT_PAGE_SIZES.A4.width;
export const REPORT_PAGE_HEIGHT = REPORT_PAGE_SIZES.A4.height;

export type QuadCell = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GridPreset = {
  cols: number;
  rows: number;
  label: string;
};

/** Available page layouts (cols × rows). */
export const GRID_PRESETS: readonly GridPreset[] = [
  { cols: 2, rows: 2, label: '2×2' },
  { cols: 2, rows: 3, label: '2×3' },
  { cols: 3, rows: 3, label: '3×3' },
  { cols: 4, rows: 3, label: '4×3' },
  { cols: 4, rows: 4, label: '4×4' },
] as const;

export function slotsPerPage(cols: number, rows: number): number {
  return Math.max(1, cols) * Math.max(1, rows);
}

/** Caption band under each photo; shrinks on denser grids. */
export function captionHeightForCell(cellH: number): number {
  return Math.min(28, Math.max(12, Math.round(cellH * 0.22)));
}

/** Content area split into cols×rows (PDF bottom-left origin). */
export function getGridCells(
  cols: number,
  rows: number,
  pageSize: ReportPageSize = 'A4',
  orientation: ReportPageOrientation = 'portrait',
): QuadCell[] {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  const { width: pageW, height: pageH } = getReportPageDims(
    pageSize,
    orientation,
  );
  const isLarge = pageSize === 'A3' || orientation === 'landscape';
  const marginX = isLarge ? 42 : 36;
  const marginBottom = isLarge ? 42 : 36;
  const gap = c >= 4 || r >= 4 ? 8 : 14;
  const headerBand = isLarge ? 110 : 100;
  const contentTopY = pageH - headerBand;
  const contentLeft = marginX;
  const contentRight = pageW - marginX;
  const cellW = (contentRight - contentLeft - gap * (c - 1)) / c;
  const cellH = (contentTopY - marginBottom - gap * (r - 1)) / r;

  const cells: QuadCell[] = [];
  for (let row = 0; row < r; row += 1) {
    for (let col = 0; col < c; col += 1) {
      cells.push({
        x: contentLeft + col * (cellW + gap),
        y: marginBottom + (r - 1 - row) * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }
  return cells;
}

/** @deprecated use getGridCells — kept as 2×2 A4 portrait default */
export function getQuadCells(): QuadCell[] {
  return getGridCells(2, 2, 'A4', 'portrait');
}

export function fitPhotoInCell(
  naturalWidth: number,
  naturalHeight: number,
  cell: QuadCell,
  pad = 8,
  rotation: number = 0,
): { x: number; y: number; width: number; height: number } {
  const captionH = captionHeightForCell(cell.h);
  const imageBand = {
    x: cell.x,
    y: cell.y + captionH,
    w: cell.w,
    h: Math.max(24, cell.h - captionH),
  };
  const maxW = Math.max(16, imageBand.w - pad * 2);
  const maxH = Math.max(16, imageBand.h - pad * 2);
  const { w: nw, h: nh } = rotatedNaturalSize(
    naturalWidth,
    naturalHeight,
    rotation,
  );
  const scale = Math.min(maxW / nw, maxH / nh);
  const width = nw * scale;
  const height = nh * scale;
  return {
    x: imageBand.x + (imageBand.w - width) / 2,
    y: imageBand.y + (imageBand.h - height) / 2,
    width,
    height,
  };
}

export function getPhotoCaptionBox(
  photo: PhotoReportPhoto,
  cells?: QuadCell[],
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const grid = cells ?? getGridCells(2, 2, 'A4', 'portrait');
  const cell = grid[photo.slot] ?? grid[0];
  const captionH = captionHeightForCell(cell.h);
  return {
    x: cell.x + 4,
    y: cell.y + 2,
    width: cell.w - 8,
    height: Math.max(10, captionH - 4),
  };
}

/** Nearest grid slot for a PDF-space point (e.g. photo center). */
export function nearestSlotFromPoint(
  x: number,
  y: number,
  cells: QuadCell[],
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function getPageCount(items: PhotoReportItem[]): number {
  if (!items.length) return 1;
  let max = 0;
  for (const item of items) {
    max = Math.max(max, item.pageIndex ?? 0);
  }
  return max + 1;
}

export function findNextPhotoPlacement(
  items: PhotoReportItem[],
  perPage: number,
): { pageIndex: number; slot: number } {
  return findNextPhotoPlacementFrom(items, 0, perPage);
}

/** Next empty slot starting from `startPage` (does not fill earlier pages). */
export function findNextPhotoPlacementFrom(
  items: PhotoReportItem[],
  startPage: number,
  perPage: number,
): { pageIndex: number; slot: number } {
  const photos = items.filter((i): i is PhotoReportPhoto => i.type === 'photo');
  const from = Math.max(0, startPage);
  const pageCount = Math.max(from + 1, getPageCount(items));
  const n = Math.max(1, perPage);
  for (let p = from; p < pageCount; p += 1) {
    const used = new Set(
      photos.filter((ph) => ph.pageIndex === p).map((ph) => ph.slot),
    );
    for (let s = 0; s < n; s += 1) {
      if (!used.has(s)) return { pageIndex: p, slot: s };
    }
  }
  return { pageIndex: pageCount, slot: 0 };
}

/** First vacant slot on a page, optionally ignoring one photo (the one being moved). */
export function findEmptySlotOnPage(
  items: PhotoReportItem[],
  pageIndex: number,
  perPage: number,
  excludeId?: string,
): number | null {
  const used = new Set(
    items
      .filter(
        (i): i is PhotoReportPhoto =>
          i.type === 'photo' &&
          i.pageIndex === pageIndex &&
          i.id !== excludeId,
      )
      .map((ph) => ph.slot),
  );
  const n = Math.max(1, perPage);
  for (let s = 0; s < n; s += 1) {
    if (!used.has(s)) return s;
  }
  return null;
}

export function groupPhotosByPage(
  items: PhotoReportItem[],
): { pageIndex: number; photos: PhotoReportPhoto[]; texts: PhotoReportText[] }[] {
  const pageCount = getPageCount(items);
  const groups: {
    pageIndex: number;
    photos: PhotoReportPhoto[];
    texts: PhotoReportText[];
  }[] = [];
  for (let p = 0; p < pageCount; p += 1) {
    const photos = items
      .filter((i): i is PhotoReportPhoto => i.type === 'photo' && i.pageIndex === p)
      .sort((a, b) => a.slot - b.slot);
    const texts = items.filter(
      (i): i is PhotoReportText => i.type === 'text' && i.pageIndex === p,
    );
    groups.push({ pageIndex: p, photos, texts });
  }
  // Always show at least page 1
  if (!groups.length) {
    groups.push({ pageIndex: 0, photos: [], texts: [] });
  }
  return groups;
}

type PhotoReportState = {
  open: boolean;
  title: string;
  items: PhotoReportItem[];
  pageNotes: Record<number, string>;
  selectedIds: string[];
  currentPage: number;
  collapsedPages: Record<number, boolean>;
  /** Photos per page grid */
  gridCols: number;
  gridRows: number;
  /** Paper size — default A4 */
  pageSize: ReportPageSize;
  /** Portrait / landscape — default portrait */
  pageOrientation: ReportPageOrientation;
  busy: boolean;
  error: string | null;

  openReport: () => void;
  closeReport: () => void;
  setTitle: (title: string) => void;
  setPageNote: (pageIndex: number, note: string) => void;
  /** Replace selection with one id, or clear when null. */
  setSelectedId: (id: string | null) => void;
  /** Ctrl/⌘ click: toggle; plain click: replace. */
  selectItem: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  setCurrentPage: (page: number) => void;
  togglePageCollapsed: (pageIndex: number) => void;
  setError: (error: string | null) => void;
  /** Change page grid and reflow all photos. */
  setGridLayout: (cols: number, rows: number) => void;
  /** Change paper size (A4/A3) and reflow. */
  setPageSize: (pageSize: ReportPageSize) => void;
  /** Change portrait/landscape and reflow. */
  setPageOrientation: (orientation: ReportPageOrientation) => void;
  addPhotosFromFiles: (
    files: FileList | File[],
    mode?: PhotoInsertMode,
    rule?: FilenamePageRule,
  ) => Promise<void>;
  addTextBlock: () => void;
  updateItem: (id: string, patch: Partial<PhotoReportItem>) => void;
  removeItem: (id: string) => void;
  removeSelected: () => void;
  clearReport: () => void;
  relayoutPhotosToGrid: () => void;
  /** Snap photo to a slot on the same page; swap if occupied. */
  placePhotoInSlot: (id: string, slot: number) => void;
  /**
   * Move photo to a page/slot. Source page keeps a vacant slot
   * (does not pull photos forward from later pages). Occupied target → swap.
   */
  movePhotoTo: (
    photoId: string,
    targetPageIndex: number,
    targetSlot: number,
  ) => void;
  /** Rotate selected photos by ±90° (clockwise positive). */
  rotateSelectedPhotos: (deltaDegrees: 90 | -90) => void;
  /**
   * Reorder pages by room code (first digits in filename).
   * Photos stay on their page; only pageIndex order changes.
   */
  sortPagesByRoom: (
    direction: PhotoSortDirection | 'custom',
    options?: { rule?: FilenamePageRule; roomOrder?: string[] },
  ) => void;
  /**
   * Sort photos within each page by sequence digits.
   * Does not change which page a photo is on.
   */
  sortPhotosWithinPages: (
    direction: PhotoSortDirection,
    options?: { rule?: FilenamePageRule },
  ) => void;
  /** Swap photo with previous/next on the same page only. */
  nudgePhotoOnPage: (photoId: string, delta: -1 | 1) => void;
  /** Replace current report (used by load .prpt). Revokes old blob URLs. */
  loadReportSnapshot: (snapshot: {
    title: string;
    gridCols: number;
    gridRows: number;
    pageSize?: ReportPageSize;
    pageOrientation?: ReportPageOrientation;
    pageNotes: Record<number, string>;
    items: PhotoReportItem[];
  }) => void;
};

function revokePhotoSrc(src: string) {
  if (src.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(src);
    } catch {
      /* ignore */
    }
  }
}

function revokePhotoSrcs(items: PhotoReportItem[]) {
  for (const item of items) {
    if (item.type === 'photo') revokePhotoSrc(item.src);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法載入圖片'));
    img.src = src;
  });
}

/** Downscale to report-sized JPEG blob URL — avoids Base64 OOM with many photos. */
async function preparePhotoFromFile(
  file: File,
  maxEdge = 1600,
): Promise<{ src: string; w: number; h: number }> {
  const tempUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(tempUrl);
    const nw = Math.max(1, img.naturalWidth || 1);
    const nh = Math.max(1, img.naturalHeight || 1);
    const scale = Math.min(1, maxEdge / Math.max(nw, nh));
    const tw = Math.max(1, Math.round(nw * scale));
    const th = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法處理圖片');
    ctx.drawImage(img, 0, 0, tw, th);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('無法壓縮圖片'))),
        'image/jpeg',
        0.82,
      );
    });
    // Drop canvas pixels ASAP
    canvas.width = 0;
    canvas.height = 0;
    return { src: URL.createObjectURL(blob), w: tw, h: th };
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}

function sortPhotos(photos: PhotoReportPhoto[]): PhotoReportPhoto[] {
  return [...photos].sort((a, b) =>
    a.pageIndex === b.pageIndex ? a.slot - b.slot : a.pageIndex - b.pageIndex,
  );
}

function layoutPhotosInOrder(
  photos: PhotoReportPhoto[],
  cols: number,
  rows: number,
  pageSize: ReportPageSize = 'A4',
  orientation: ReportPageOrientation = 'portrait',
): PhotoReportPhoto[] {
  const cells = getGridCells(cols, rows, pageSize, orientation);
  const perPage = cells.length;
  return photos.map((photo, index) => {
    const pageIndex = Math.floor(index / perPage);
    const slot = index % perPage;
    const rotation = normalizePhotoRotation(photo.rotation ?? 0);
    const fitted = fitPhotoInCell(
      photo.naturalWidth || photo.width,
      photo.naturalHeight || photo.height,
      cells[slot],
      8,
      rotation,
    );
    return {
      ...photo,
      caption: photo.caption ?? '',
      rotation,
      pageIndex,
      slot,
      ...fitted,
    };
  });
}

function reflowReportItems(
  items: PhotoReportItem[],
  cols: number,
  rows: number,
  pageSize: ReportPageSize,
  orientation: ReportPageOrientation,
): PhotoReportItem[] {
  const texts = items.filter((i): i is PhotoReportText => i.type === 'text');
  const photos = sortPhotos(
    items.filter((i): i is PhotoReportPhoto => i.type === 'photo'),
  );
  const laid = layoutPhotosInOrder(photos, cols, rows, pageSize, orientation);
  const { width, height } = getReportPageDims(pageSize, orientation);
  const remappedTexts = texts.map((t) => ({
    ...t,
    x: Math.min(t.x, Math.max(0, width - t.width)),
    y: Math.min(t.y, Math.max(40, height - t.height - 40)),
  }));
  return [...laid, ...remappedTexts];
}

export const usePhotoReportStore = create<PhotoReportState>((set, get) => {
  const perPageOf = () => slotsPerPage(get().gridCols, get().gridRows);
  const cellsOf = () =>
    getGridCells(
      get().gridCols,
      get().gridRows,
      get().pageSize,
      get().pageOrientation,
    );

  return {
  open: false,
  title: '相片報告',
  items: [],
  pageNotes: {},
  selectedIds: [],
  currentPage: 0,
  collapsedPages: {},
  gridCols: 2,
  gridRows: 2,
  pageSize: 'A4',
  pageOrientation: 'portrait',
  busy: false,
  error: null,

  openReport: () => set({ open: true, error: null }),
  closeReport: () => set({ open: false, selectedIds: [] }),
  setTitle: (title) => set({ title }),
  setPageNote: (pageIndex, note) =>
    set((s) => ({
      pageNotes: { ...s.pageNotes, [pageIndex]: note },
    })),
  setSelectedId: (id) => {
    if (!id) {
      set({ selectedIds: [] });
      return;
    }
    const item = get().items.find((i) => i.id === id);
    set({
      selectedIds: [id],
      currentPage: item ? item.pageIndex : get().currentPage,
    });
  },
  selectItem: (id, additive = false) => {
    const item = get().items.find((i) => i.id === id);
    if (!additive) {
      set({
        selectedIds: [id],
        currentPage: item ? item.pageIndex : get().currentPage,
      });
      return;
    }
    const setIds = new Set(get().selectedIds);
    if (setIds.has(id)) setIds.delete(id);
    else setIds.add(id);
    set({
      selectedIds: [...setIds],
      currentPage: item ? item.pageIndex : get().currentPage,
    });
  },
  clearSelection: () => set({ selectedIds: [] }),
  setCurrentPage: (page) => {
    const max = Math.max(0, getPageCount(get().items) - 1);
    set({
      currentPage: Math.min(Math.max(0, page), max),
      selectedIds: [],
    });
  },
  togglePageCollapsed: (pageIndex) =>
    set((s) => ({
      collapsedPages: {
        ...s.collapsedPages,
        [pageIndex]: !s.collapsedPages[pageIndex],
      },
    })),
  setError: (error) => set({ error }),

  setGridLayout: (cols, rows) => {
    const c = Math.max(1, Math.round(cols));
    const r = Math.max(1, Math.round(rows));
    set((s) => {
      const nextItems = reflowReportItems(
        s.items,
        c,
        r,
        s.pageSize,
        s.pageOrientation,
      );
      return {
        gridCols: c,
        gridRows: r,
        items: nextItems,
        error: null,
        currentPage: Math.min(
          s.currentPage,
          Math.max(0, getPageCount(nextItems) - 1),
        ),
      };
    });
  },

  setPageSize: (pageSize) => {
    const next: ReportPageSize = pageSize === 'A3' ? 'A3' : 'A4';
    set((s) => {
      if (s.pageSize === next) return s;
      const nextItems = reflowReportItems(
        s.items,
        s.gridCols,
        s.gridRows,
        next,
        s.pageOrientation,
      );
      return {
        pageSize: next,
        items: nextItems,
        error: null,
        currentPage: Math.min(
          s.currentPage,
          Math.max(0, getPageCount(nextItems) - 1),
        ),
      };
    });
  },

  setPageOrientation: (orientation) => {
    const next: ReportPageOrientation =
      orientation === 'landscape' ? 'landscape' : 'portrait';
    set((s) => {
      if (s.pageOrientation === next) return s;
      const nextItems = reflowReportItems(
        s.items,
        s.gridCols,
        s.gridRows,
        s.pageSize,
        next,
      );
      return {
        pageOrientation: next,
        items: nextItems,
        error: null,
        currentPage: Math.min(
          s.currentPage,
          Math.max(0, getPageCount(nextItems) - 1),
        ),
      };
    });
  },

  addPhotosFromFiles: async (files, mode = 'continue', rule) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      set({ error: '請選擇圖片檔（JPG／PNG／WebP 等）' });
      return;
    }
    set({ busy: true, error: null });
    try {
      const cells = cellsOf();
      const perPage = perPageOf();
      let next = [...get().items];
      next = next.map((item) =>
        item.type === 'photo' && typeof item.pageIndex !== 'number'
          ? { ...item, pageIndex: 0 }
          : item.type === 'text' && typeof item.pageIndex !== 'number'
            ? { ...item, pageIndex: 0 }
            : item,
      );
      let lastId: string | null = null;
      let lastPage = get().currentPage;
      let pageNotes = { ...get().pageNotes };

      const appendPhoto = async (
        file: File,
        pageIndex: number,
        slot: number,
      ) => {
        const prepared = await preparePhotoFromFile(file);
        const fitted = fitPhotoInCell(
          prepared.w,
          prepared.h,
          cells[slot],
          8,
          0,
        );
        const id = createId();
        next = [
          ...next,
          {
            id,
            type: 'photo' as const,
            src: prepared.src,
            name: file.name,
            pageIndex,
            slot,
            naturalWidth: prepared.w,
            naturalHeight: prepared.h,
            rotation: 0 as const,
            caption: '',
            ...fitted,
          },
        ];
        lastId = id;
        lastPage = pageIndex;
      };

      const flushProgress = async (index: number, total: number) => {
        if (index === total - 1 || index % 4 === 3) {
          set({
            items: next,
            pageNotes,
            selectedIds: lastId ? [lastId] : [],
            currentPage: lastPage,
            busy: true,
            collapsedPages: {
              ...get().collapsedPages,
              [lastPage]: false,
            },
          });
          await new Promise<void>((r) => {
            window.setTimeout(r, 0);
          });
        }
      };

      if (mode === 'byName') {
        const nameRule = rule ?? DEFAULT_FILENAME_PAGE_RULE;
        const groups = groupFilesByRoom(list, nameRule);
        // Start after existing content (or page 0 if empty)
        let pageCursor =
          next.some((i) => i.type === 'photo') ? getPageCount(next) : 0;
        let processed = 0;
        const total = groups.reduce((n, g) => n + g.files.length, 0);

        for (const group of groups) {
          let slot = 0;
          const roomStartPage = pageCursor;
          if (!group.unmatched && !(pageNotes[roomStartPage] ?? '').trim()) {
            pageNotes = { ...pageNotes, [roomStartPage]: `房型 ${group.room}` };
          }

          for (const file of group.files) {
            if (slot >= perPage) {
              pageCursor += 1;
              slot = 0;
            }
            await appendPhoto(file, pageCursor, slot);
            slot += 1;
            await flushProgress(processed, total);
            processed += 1;
          }
          // Next room type always starts on a fresh page
          pageCursor += 1;
        }
      } else {
        const newPageStart =
          mode === 'newPage' ? getPageCount(next) : null;

        for (let i = 0; i < list.length; i += 1) {
          const file = list[i];
          const place =
            newPageStart != null
              ? findNextPhotoPlacementFrom(next, newPageStart, perPage)
              : findNextPhotoPlacement(next, perPage);
          await appendPhoto(file, place.pageIndex, place.slot);
          await flushProgress(i, list.length);
        }
      }

      set({
        items: next,
        pageNotes,
        selectedIds: lastId ? [lastId] : [],
        currentPage: lastPage,
        busy: false,
        collapsedPages: {
          ...get().collapsedPages,
          [lastPage]: false,
        },
      });
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : '加入相片失敗',
      });
    }
  },

  addTextBlock: () => {
    const id = createId();
    const pageIndex = get().currentPage;
    const { height } = getReportPageDims(get().pageSize, get().pageOrientation);
    const block: PhotoReportText = {
      id,
      type: 'text',
      pageIndex,
      text: '',
      x: 40,
      y: height - 200,
      width: 320,
      height: 72,
      fontSize: 14,
      color: '#1a1f1c',
    };
    set((s) => ({
      items: [...s.items, block],
      selectedIds: [id],
      collapsedPages: { ...s.collapsedPages, [pageIndex]: false },
    }));
  },

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? ({ ...item, ...patch } as PhotoReportItem) : item,
      ),
    })),

  removeItem: (id) =>
    set((s) => {
      const removed = s.items.find((i) => i.id === id);
      if (removed?.type === 'photo') revokePhotoSrc(removed.src);
      const items = s.items.filter((i) => i.id !== id);
      const pageCount = getPageCount(items);
      const currentPage = Math.min(s.currentPage, Math.max(0, pageCount - 1));
      return {
        items,
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
        currentPage,
      };
    }),

  removeSelected: () => {
    const ids = new Set(get().selectedIds);
    if (!ids.size) return;
    set((s) => {
      for (const item of s.items) {
        if (ids.has(item.id) && item.type === 'photo') {
          revokePhotoSrc(item.src);
        }
      }
      const items = s.items.filter((i) => !ids.has(i.id));
      const pageCount = getPageCount(items);
      const currentPage = Math.min(s.currentPage, Math.max(0, pageCount - 1));
      return { items, selectedIds: [], currentPage };
    });
  },

  clearReport: () => {
    revokePhotoSrcs(get().items);
    set({
      items: [],
      pageNotes: {},
      selectedIds: [],
      currentPage: 0,
      collapsedPages: {},
      title: '相片報告',
      pageSize: 'A4',
      pageOrientation: 'portrait',
      error: null,
    });
  },

  relayoutPhotosToGrid: () => {
    const { gridCols, gridRows, pageSize, pageOrientation } = get();
    set((s) => {
      const nextItems = reflowReportItems(
        s.items,
        gridCols,
        gridRows,
        pageSize,
        pageOrientation,
      );
      return {
        items: nextItems,
        error: null,
        currentPage: Math.min(
          s.currentPage,
          Math.max(0, getPageCount(nextItems) - 1),
        ),
      };
    });
  },

  placePhotoInSlot: (id, slot) => {
    const cells = cellsOf();
    const maxSlot = cells.length - 1;
    const target = Math.min(maxSlot, Math.max(0, slot));
    set((s) => {
      const photo = s.items.find(
        (i): i is PhotoReportPhoto => i.type === 'photo' && i.id === id,
      );
      if (!photo) return s;
      const pageIndex = photo.pageIndex;
      const fromSlot = photo.slot;
      const rotation = normalizePhotoRotation(photo.rotation ?? 0);
      if (fromSlot === target) {
        const fitted = fitPhotoInCell(
          photo.naturalWidth || photo.width,
          photo.naturalHeight || photo.height,
          cells[target],
          8,
          rotation,
        );
        return {
          items: s.items.map((item) =>
            item.id === id
              ? { ...photo, rotation, ...fitted, slot: target }
              : item,
          ),
        };
      }

      const occupant = s.items.find(
        (i): i is PhotoReportPhoto =>
          i.type === 'photo' &&
          i.pageIndex === pageIndex &&
          i.slot === target &&
          i.id !== id,
      );

      const items = s.items.map((item) => {
        if (item.id === id) {
          const fitted = fitPhotoInCell(
            photo.naturalWidth || photo.width,
            photo.naturalHeight || photo.height,
            cells[target],
            8,
            rotation,
          );
          return { ...photo, rotation, slot: target, pageIndex, ...fitted };
        }
        if (occupant && item.id === occupant.id) {
          const occRot = normalizePhotoRotation(occupant.rotation ?? 0);
          const fitted = fitPhotoInCell(
            occupant.naturalWidth || occupant.width,
            occupant.naturalHeight || occupant.height,
            cells[fromSlot],
            8,
            occRot,
          );
          return {
            ...occupant,
            rotation: occRot,
            slot: fromSlot,
            pageIndex,
            ...fitted,
          };
        }
        return item;
      });
      return { items };
    });
  },

  movePhotoTo: (photoId, targetPageIndex, targetSlot) => {
    const cells = cellsOf();
    const perPage = perPageOf();
    set((s) => {
      const drag = s.items.find(
        (i): i is PhotoReportPhoto => i.type === 'photo' && i.id === photoId,
      );
      if (!drag) return s;

      const page = Math.max(0, targetPageIndex);
      const slot = Math.min(perPage - 1, Math.max(0, targetSlot));
      const fromPage = drag.pageIndex;
      const fromSlot = drag.slot;

      if (fromPage === page && fromSlot === slot) return s;

      const occupant = s.items.find(
        (i): i is PhotoReportPhoto =>
          i.type === 'photo' &&
          i.pageIndex === page &&
          i.slot === slot &&
          i.id !== photoId,
      );

      const fit = (photo: PhotoReportPhoto, p: number, sl: number) => {
        const rotation = normalizePhotoRotation(photo.rotation ?? 0);
        const fitted = fitPhotoInCell(
          photo.naturalWidth || photo.width,
          photo.naturalHeight || photo.height,
          cells[sl],
          8,
          rotation,
        );
        return {
          ...photo,
          rotation,
          pageIndex: p,
          slot: sl,
          ...fitted,
        };
      };

      let occupantPage = fromPage;
      let occupantSlot = fromSlot;
      if (occupant && fromPage !== page) {
        const emptyOnTarget = findEmptySlotOnPage(
          s.items,
          page,
          perPage,
          photoId,
        );
        if (emptyOnTarget != null) {
          occupantPage = page;
          occupantSlot = emptyOnTarget;
        }
      }

      const items = s.items.map((item) => {
        if (item.id === photoId) {
          return fit(drag, page, slot);
        }
        if (occupant && item.id === occupant.id) {
          return fit(occupant, occupantPage, occupantSlot);
        }
        return item;
      });

      return {
        items,
        selectedIds: [photoId],
        currentPage: Math.min(page, Math.max(0, getPageCount(items) - 1)),
        collapsedPages: { ...s.collapsedPages, [page]: false },
        error: null,
      };
    });
  },

  rotateSelectedPhotos: (deltaDegrees) => {
    const ids = new Set(get().selectedIds);
    if (!ids.size) return;
    const cells = cellsOf();
    set((s) => ({
      items: s.items.map((item) => {
        if (item.type !== 'photo' || !ids.has(item.id)) return item;
        const rotation = normalizePhotoRotation(
          (item.rotation ?? 0) + deltaDegrees,
        );
        const cell = cells[item.slot] ?? cells[0];
        const fitted = fitPhotoInCell(
          item.naturalWidth || item.width,
          item.naturalHeight || item.height,
          cell,
          8,
          rotation,
        );
        return { ...item, rotation, ...fitted };
      }),
    }));
  },

  sortPagesByRoom: (direction, options) => {
    const rule = options?.rule ?? DEFAULT_FILENAME_PAGE_RULE;
    set((s) => {
      const photos = s.items.filter(
        (i): i is PhotoReportPhoto => i.type === 'photo',
      );
      if (!photos.length) return s;

      const pageCount = getPageCount(s.items);
      const pageKeys: { page: number; key: string }[] = [];
      for (let p = 0; p < pageCount; p += 1) {
        const onPage = photos.filter((ph) => ph.pageIndex === p);
        let key = '\uffff'; // pages with no parseable room go last
        const note = (s.pageNotes[p] ?? '').match(/房型\s*(\d+)/);
        if (note) {
          key = note[1];
        } else {
          const rooms: string[] = [];
          for (const ph of onPage) {
            const parsed = parseRoomPhotoName(ph.name, rule);
            if (parsed) rooms.push(parsed.room);
          }
          if (rooms.length) {
            rooms.sort((a, b) => a.localeCompare(b, 'en'));
            key = rooms[0];
          }
        }
        pageKeys.push({ page: p, key });
      }

      const orderMap = options?.roomOrder?.length
        ? new Map(options.roomOrder.map((r, i) => [r, i]))
        : null;

      pageKeys.sort((a, b) => {
        if (orderMap) {
          const ia = orderMap.has(a.key) ? orderMap.get(a.key)! : 1e9;
          const ib = orderMap.has(b.key) ? orderMap.get(b.key)! : 1e9;
          if (ia !== ib) return ia - ib;
        }
        const cmp = a.key.localeCompare(b.key, 'en');
        if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
        return a.page - b.page;
      });

      const remap = new Map<number, number>();
      pageKeys.forEach((row, newIndex) => {
        remap.set(row.page, newIndex);
      });

      const items = s.items.map((item) => {
        const nextPage = remap.get(item.pageIndex);
        if (nextPage == null || nextPage === item.pageIndex) return item;
        return { ...item, pageIndex: nextPage };
      });

      const pageNotes: Record<number, string> = {};
      for (const [oldStr, note] of Object.entries(s.pageNotes)) {
        const old = Number(oldStr);
        const nextPage = remap.get(old);
        if (nextPage != null && note) pageNotes[nextPage] = note;
      }

      return {
        items,
        pageNotes,
        error: null,
        currentPage: remap.get(s.currentPage) ?? s.currentPage,
      };
    });
  },

  sortPhotosWithinPages: (direction, options) => {
    const rule = options?.rule ?? DEFAULT_FILENAME_PAGE_RULE;
    const cells = cellsOf();
    set((s) => {
      const photos = s.items.filter(
        (i): i is PhotoReportPhoto => i.type === 'photo',
      );
      if (!photos.length) return s;
      const texts = s.items.filter((i): i is PhotoReportText => i.type === 'text');
      const pageCount = getPageCount(s.items);
      const nextPhotos: PhotoReportPhoto[] = [];

      for (let p = 0; p < pageCount; p += 1) {
        const onPage = photos.filter((ph) => ph.pageIndex === p);
        onPage.sort((a, b) => {
          const pa = parseRoomPhotoName(a.name, rule);
          const pb = parseRoomPhotoName(b.name, rule);
          const sa = pa?.seq ?? Number.POSITIVE_INFINITY;
          const sb = pb?.seq ?? Number.POSITIVE_INFINITY;
          if (sa !== sb) return direction === 'desc' ? sb - sa : sa - sb;
          const cmp = a.name.localeCompare(b.name, 'zh-Hant');
          return direction === 'desc' ? -cmp : cmp;
        });
        onPage.forEach((photo, slot) => {
          const cell = cells[slot] ?? cells[0];
          const rotation = normalizePhotoRotation(photo.rotation ?? 0);
          const fitted = fitPhotoInCell(
            photo.naturalWidth || photo.width,
            photo.naturalHeight || photo.height,
            cell,
            8,
            rotation,
          );
          nextPhotos.push({
            ...photo,
            rotation,
            pageIndex: p,
            slot,
            ...fitted,
          });
        });
      }

      return {
        items: [...nextPhotos, ...texts],
        error: null,
      };
    });
  },

  nudgePhotoOnPage: (photoId, delta) => {
    const cells = cellsOf();
    set((s) => {
      const photo = s.items.find(
        (i): i is PhotoReportPhoto => i.type === 'photo' && i.id === photoId,
      );
      if (!photo) return s;
      const onPage = s.items
        .filter(
          (i): i is PhotoReportPhoto =>
            i.type === 'photo' && i.pageIndex === photo.pageIndex,
        )
        .sort((a, b) => a.slot - b.slot);
      const idx = onPage.findIndex((p) => p.id === photoId);
      const j = idx + delta;
      if (idx < 0 || j < 0 || j >= onPage.length) return s;

      const swapped = [...onPage];
      const tmp = swapped[idx];
      swapped[idx] = swapped[j];
      swapped[j] = tmp;

      const byNewSlot = new Map(
        swapped.map((p, slot) => {
          const cell = cells[slot] ?? cells[0];
          const rotation = normalizePhotoRotation(p.rotation ?? 0);
          const fitted = fitPhotoInCell(
            p.naturalWidth || p.width,
            p.naturalHeight || p.height,
            cell,
            8,
            rotation,
          );
          return [
            p.id,
            { ...p, rotation, slot, pageIndex: photo.pageIndex, ...fitted },
          ] as const;
        }),
      );

      return {
        items: s.items.map((item) => {
          if (item.type !== 'photo') return item;
          return byNewSlot.get(item.id) ?? item;
        }),
      };
    });
  },

  loadReportSnapshot: (snapshot) => {
    revokePhotoSrcs(get().items);
    const pageSize: ReportPageSize =
      snapshot.pageSize === 'A3' ? 'A3' : 'A4';
    const pageOrientation: ReportPageOrientation =
      snapshot.pageOrientation === 'landscape' ? 'landscape' : 'portrait';
    set({
      title: snapshot.title || '相片報告',
      gridCols: Math.max(1, snapshot.gridCols),
      gridRows: Math.max(1, snapshot.gridRows),
      pageSize,
      pageOrientation,
      pageNotes: snapshot.pageNotes ?? {},
      items: snapshot.items,
      selectedIds: [],
      currentPage: 0,
      collapsedPages: {},
      error: null,
      busy: false,
      open: true,
    });
  },
  };
});
