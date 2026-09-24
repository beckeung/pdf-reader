import { PDFDocument, degrees } from 'pdf-lib';

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function writeBytesToHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(toArrayBuffer(bytes));
  await writable.close();
}

export async function savePdfAs(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<FileSystemFileHandle | null> {
  const name = suggestedName.toLowerCase().endsWith('.pdf')
    ? suggestedName
    : `${suggestedName}.pdf`;

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'PDF',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      await writeBytesToHandle(handle, bytes);
      return handle;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  downloadBytes(bytes, name);
  return null;
}

export async function mergePdfs(
  files: { name: string; bytes: ArrayBuffer }[],
): Promise<Uint8Array> {
  if (files.length < 1) {
    throw new Error('請至少選擇一個 PDF');
  }
  const merged = await PDFDocument.create();
  for (const file of files) {
    const doc = await PDFDocument.load(file.bytes.slice(0), {
      ignoreEncryption: true,
    });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return merged.save();
}

/** Parse ranges like "1-3, 5, 8-10" (1-based, inclusive). */
export function parsePageRanges(
  input: string,
  totalPages: number,
): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('請輸入頁碼範圍');
  }
  const pages = new Set<number>();
  const parts = trimmed.split(',');
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;
    if (token.includes('-')) {
      const [startRaw, endRaw] = token.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start ||
        end > totalPages
      ) {
        throw new Error(`無效範圍：${token}`);
      }
      for (let p = start; p <= end; p += 1) {
        pages.add(p);
      }
    } else {
      const page = Number(token);
      if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        throw new Error(`無效頁碼：${token}`);
      }
      pages.add(page);
    }
  }
  if (pages.size === 0) {
    throw new Error('請輸入有效頁碼範圍');
  }
  return [...pages].sort((a, b) => a - b);
}

export async function splitPdf(
  sourceBytes: ArrayBuffer,
  pageNumbers: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes.slice(0), {
    ignoreEncryption: true,
  });
  const out = await PDFDocument.create();
  const zeroBased = pageNumbers.map((n) => n - 1);
  const pages = await out.copyPages(src, zeroBased);
  for (const page of pages) {
    out.addPage(page);
  }
  return out.save();
}

/** Remove 1-based pages; keeps remaining pages in order. */
export async function deletePages(
  sourceBytes: ArrayBuffer,
  pagesToDelete: number[],
): Promise<Uint8Array> {
  const unique = [...new Set(pagesToDelete)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new Error('請先選擇要刪除的頁面');
  }
  const src = await PDFDocument.load(sourceBytes.slice(0), {
    ignoreEncryption: true,
  });
  const total = src.getPageCount();
  for (const page of unique) {
    if (!Number.isInteger(page) || page < 1 || page > total) {
      throw new Error(`無效頁碼：${page}`);
    }
  }
  if (unique.length >= total) {
    throw new Error('至少需保留一頁');
  }
  const remove = new Set(unique);
  const keepZeroBased: number[] = [];
  for (let i = 1; i <= total; i += 1) {
    if (!remove.has(i)) keepZeroBased.push(i - 1);
  }
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keepZeroBased);
  for (const page of pages) {
    out.addPage(page);
  }
  return out.save();
}

/** Map a 1-based page number after deleting pages; null if the page itself was deleted. */
export function remapPageAfterDelete(
  page: number,
  deletedPages: number[],
): number | null {
  const deleted = new Set(deletedPages);
  if (deleted.has(page)) return null;
  let removedBefore = 0;
  for (const d of deleted) {
    if (d < page) removedBefore += 1;
  }
  return page - removedBefore;
}

/** Rotate 1-based pages by ±90 / 180 degrees (persisted in PDF). */
export async function rotatePages(
  sourceBytes: ArrayBuffer,
  pageNumbers: number[],
  deltaDegrees: 90 | -90 | 180,
): Promise<Uint8Array> {
  const unique = [...new Set(pageNumbers)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new Error('請先選擇要旋轉的頁面');
  }
  const src = await PDFDocument.load(sourceBytes.slice(0), {
    ignoreEncryption: true,
  });
  const total = src.getPageCount();
  for (const pageNum of unique) {
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > total) {
      throw new Error(`無效頁碼：${pageNum}`);
    }
    const page = src.getPage(pageNum - 1);
    const current = page.getRotation().angle;
    const next = ((current + deltaDegrees) % 360 + 360) % 360;
    page.setRotation(degrees(next));
  }
  return src.save();
}
