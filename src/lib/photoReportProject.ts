import { unzipSync, zipSync } from 'fflate';
import { writeBytesToHandle } from './pdfOps';
import type {
  PhotoReportItem,
  PhotoReportPhoto,
  PhotoReportText,
  PhotoRotation,
  ReportPageOrientation,
  ReportPageSize,
} from '../store/usePhotoReportStore';

export const PHOTO_REPORT_EXT = '.prpt';
export const PHOTO_REPORT_MIME = 'application/x-photo-report';

const MANIFEST_NAME = 'report.json';

type SavedPhotoMeta = {
  type: 'photo';
  id: string;
  name: string;
  pageIndex: number;
  slot: number;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: PhotoRotation;
  caption: string;
  /** Path inside the .prpt zip, e.g. media/abc.jpg */
  file: string;
};

type SavedTextMeta = {
  type: 'text';
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
};

export type PhotoReportManifest = {
  version: 1;
  kind: 'photo-report';
  title: string;
  gridCols: number;
  gridRows: number;
  pageSize?: ReportPageSize;
  pageOrientation?: ReportPageOrientation;
  pageNotes: Record<string, string>;
  items: (SavedPhotoMeta | SavedTextMeta)[];
};

export type LoadedPhotoReport = {
  title: string;
  gridCols: number;
  gridRows: number;
  pageSize: ReportPageSize;
  pageOrientation: ReportPageOrientation;
  pageNotes: Record<number, string>;
  items: PhotoReportItem[];
};

function safeFileStem(name: string): string {
  return (name || '相片報告').replace(/[\\/:*?"<>|]+/g, '_').trim() || '相片報告';
}

function extForBlob(blob: Blob, fallback = '.jpg'): string {
  const t = blob.type.toLowerCase();
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
  return fallback;
}

async function fetchBlob(src: string): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error('無法讀取相片資料');
  return res.blob();
}

export async function buildPhotoReportProject(input: {
  title: string;
  gridCols: number;
  gridRows: number;
  pageSize: ReportPageSize;
  pageOrientation: ReportPageOrientation;
  pageNotes: Record<number, string>;
  items: PhotoReportItem[];
}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const savedItems: PhotoReportManifest['items'] = [];

  for (const item of input.items) {
    if (item.type === 'text') {
      savedItems.push({
        type: 'text',
        id: item.id,
        pageIndex: item.pageIndex,
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        color: item.color,
      });
      continue;
    }

    const blob = await fetchBlob(item.src);
    const ext = extForBlob(blob);
    const filePath = `media/${item.id}${ext}`;
    const buf = new Uint8Array(await blob.arrayBuffer());
    files[filePath] = buf;
    savedItems.push({
      type: 'photo',
      id: item.id,
      name: item.name,
      pageIndex: item.pageIndex,
      slot: item.slot,
      naturalWidth: item.naturalWidth,
      naturalHeight: item.naturalHeight,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation ?? 0,
      caption: item.caption ?? '',
      file: filePath,
    });
  }

  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.pageNotes)) {
    if (v?.trim()) notes[String(k)] = v;
  }

  const manifest: PhotoReportManifest = {
    version: 1,
    kind: 'photo-report',
    title: input.title,
    gridCols: input.gridCols,
    gridRows: input.gridRows,
    pageSize: input.pageSize,
    pageOrientation: input.pageOrientation,
    pageNotes: notes,
    items: savedItems,
  };

  const enc = new TextEncoder();
  files[MANIFEST_NAME] = enc.encode(JSON.stringify(manifest));

  return zipSync(files, { level: 0 });
}

export async function parsePhotoReportProject(
  bytes: Uint8Array,
): Promise<LoadedPhotoReport> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new Error('無法開啟專案檔（不是有效的 .prpt）');
  }

  const manifestBytes = unzipped[MANIFEST_NAME];
  if (!manifestBytes) {
    throw new Error('專案檔缺少 report.json');
  }

  let manifest: PhotoReportManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as PhotoReportManifest;
  } catch {
    throw new Error('專案檔內容損毀');
  }

  if (manifest.kind !== 'photo-report' || manifest.version !== 1) {
    throw new Error('不支援的專案檔版本');
  }

  const pageNotes: Record<number, string> = {};
  for (const [k, v] of Object.entries(manifest.pageNotes ?? {})) {
    const n = Number(k);
    if (Number.isFinite(n)) pageNotes[n] = String(v ?? '');
  }

  const items: PhotoReportItem[] = [];
  for (const raw of manifest.items ?? []) {
    if (raw.type === 'text') {
      const t = raw as SavedTextMeta;
      items.push({
        type: 'text',
        id: t.id,
        pageIndex: t.pageIndex,
        text: t.text ?? '',
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        fontSize: t.fontSize,
        color: t.color,
      } satisfies PhotoReportText);
      continue;
    }

    const p = raw as SavedPhotoMeta;
    const fileBytes = unzipped[p.file];
    if (!fileBytes) {
      throw new Error(`缺少相片檔：${p.file}`);
    }
    const lower = p.file.toLowerCase();
    const mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const blob = new Blob(
      [fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength) as ArrayBuffer],
      { type: mime },
    );
    const src = URL.createObjectURL(blob);
    items.push({
      type: 'photo',
      id: p.id,
      src,
      name: p.name,
      pageIndex: p.pageIndex,
      slot: p.slot,
      naturalWidth: p.naturalWidth,
      naturalHeight: p.naturalHeight,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      rotation: (p.rotation ?? 0) as PhotoRotation,
      caption: p.caption ?? '',
    } satisfies PhotoReportPhoto);
  }

  return {
    title: manifest.title || '相片報告',
    gridCols: Math.max(1, manifest.gridCols || 2),
    gridRows: Math.max(1, manifest.gridRows || 2),
    pageSize: manifest.pageSize === 'A3' ? 'A3' : 'A4',
    pageOrientation:
      manifest.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    pageNotes,
    items,
  };
}

export async function savePhotoReportProjectAs(
  bytes: Uint8Array,
  suggestedTitle: string,
): Promise<boolean> {
  const name = `${safeFileStem(suggestedTitle)}${PHOTO_REPORT_EXT}`;

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: '相片報告專案 (.prpt)',
            accept: {
              [PHOTO_REPORT_MIME]: [PHOTO_REPORT_EXT],
              'application/zip': [PHOTO_REPORT_EXT],
            },
          },
        ],
      });
      await writeBytesToHandle(handle, bytes);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false;
      }
      throw err;
    }
  }

  const blob = new Blob(
    [
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    ],
    { type: PHOTO_REPORT_MIME },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function pickPhotoReportProjectFile(): Promise<File | null> {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: '相片報告專案 (.prpt)',
            accept: {
              [PHOTO_REPORT_MIME]: [PHOTO_REPORT_EXT],
              'application/zip': [PHOTO_REPORT_EXT],
            },
          },
        ],
      });
      return handle.getFile();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }
  return null;
}
