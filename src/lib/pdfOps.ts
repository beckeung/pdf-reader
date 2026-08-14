import { PDFDocument } from 'pdf-lib';

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
