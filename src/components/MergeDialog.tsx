import { useRef, useState } from 'react';
import { downloadBytes, mergePdfs } from '../lib/pdfOps';
import { usePdfStore } from '../store/usePdfStore';

type MergeItem = {
  id: string;
  name: string;
  bytes: ArrayBuffer;
};

export function MergeDialog() {
  const open = usePdfStore((s) => s.mergeOpen);
  const setMergeOpen = usePdfStore((s) => s.setMergeOpen);
  const setError = usePdfStore((s) => s.setError);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MergeItem[]>([]);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: MergeItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        continue;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        bytes: await file.arrayBuffer(),
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const move = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const runMerge = async () => {
    if (items.length < 2) {
      setError('請至少加入兩個 PDF 再合併');
      return;
    }
    setBusy(true);
    try {
      const bytes = await mergePdfs(items);
      downloadBytes(bytes, 'merged.pdf');
      setItems([]);
      setMergeOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '合併失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setMergeOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="merge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="merge-title">合併 PDF</h2>
        <p className="muted">選擇多個檔案，並調整合併順序。</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            加入檔案
          </button>
        </div>
        <ul className="merge-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <span className="merge-name">{item.name}</span>
              <div className="merge-controls">
                <button type="button" className="btn" onClick={() => move(index, -1)}>
                  上移
                </button>
                <button type="button" className="btn" onClick={() => move(index, 1)}>
                  下移
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="muted">尚未加入檔案</p>}
        <div className="modal-footer">
          <button type="button" className="btn" onClick={() => setMergeOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || items.length < 2}
            onClick={() => void runMerge()}
          >
            {busy ? '合併中…' : '合併並下載'}
          </button>
        </div>
      </div>
    </div>
  );
}
