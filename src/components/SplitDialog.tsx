import { useState } from 'react';
import { downloadBytes, parsePageRanges, splitPdf } from '../lib/pdfOps';
import { usePdfStore } from '../store/usePdfStore';

export function SplitDialog() {
  const open = usePdfStore((s) => s.splitOpen);
  const setSplitOpen = usePdfStore((s) => s.setSplitOpen);
  const fileBytes = usePdfStore((s) => s.fileBytes);
  const fileName = usePdfStore((s) => s.fileName);
  const pageCount = usePdfStore((s) => s.pageCount);
  const setError = usePdfStore((s) => s.setError);
  const [range, setRange] = useState('1');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const runSplit = async () => {
    if (!fileBytes) {
      setError('請先開啟 PDF');
      return;
    }
    setBusy(true);
    try {
      const pages = parsePageRanges(range, pageCount);
      const bytes = await splitPdf(fileBytes, pages);
      const base = fileName?.replace(/\.pdf$/i, '') || 'document';
      downloadBytes(bytes, `${base}-分拆.pdf`);
      setSplitOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分拆失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setSplitOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="split-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="split-title">分拆 PDF</h2>
        <p className="muted">
          目前共 {pageCount} 頁。輸入要保留的頁碼範圍，例如 <code>1-3, 5</code>。
        </p>
        <label className="field">
          <span>頁碼範圍</span>
          <input
            type="text"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="1-3, 5"
          />
        </label>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={() => setSplitOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void runSplit()}
          >
            {busy ? '處理中…' : '分拆並下載'}
          </button>
        </div>
      </div>
    </div>
  );
}
