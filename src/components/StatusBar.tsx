import { usePdfStore, type DisplayMode } from '../store/usePdfStore';

const DISPLAY_MODES: { id: DisplayMode; label: string; title: string }[] = [
  { id: 'one-page', label: '一頁', title: '單頁顯示（適合頁面）' },
  { id: 'fit-width', label: '對齊闊度', title: '單頁對齊寬度' },
  { id: 'multi-page', label: '多頁顯示', title: '連續捲動多頁' },
];

export function StatusBar() {
  const pageCount = usePdfStore((s) => s.pageCount);
  const currentPage = usePdfStore((s) => s.currentPage);
  const zoomPercent = usePdfStore((s) => s.zoomPercent);
  const displayMode = usePdfStore((s) => s.displayMode);
  const goToPage = usePdfStore((s) => s.goToPage);
  const setDisplayMode = usePdfStore((s) => s.setDisplayMode);
  const setZoomPercent = usePdfStore((s) => s.setZoomPercent);
  const zoomIn = usePdfStore((s) => s.zoomIn);
  const zoomOut = usePdfStore((s) => s.zoomOut);

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        <button
          type="button"
          className="btn"
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          上一頁
        </button>
        <label className="page-input">
          <span>第</span>
          <input
            type="number"
            min={1}
            max={pageCount || 1}
            value={pageCount ? currentPage : ''}
            disabled={!pageCount}
            onChange={(e) => goToPage(Number(e.target.value))}
            aria-label="目前頁碼"
          />
          <span>/ {pageCount || '—'} 頁</span>
        </label>
        <button
          type="button"
          className="btn"
          disabled={!pageCount || currentPage >= pageCount}
          onClick={() => goToPage(currentPage + 1)}
        >
          下一頁
        </button>
      </div>

      <div className="statusbar-group zoom-group" title="Ctrl+滾輪／Ctrl±／Ctrl+0">
        <button
          type="button"
          className="btn"
          onClick={() => zoomOut()}
          disabled={!pageCount}
          title="縮小（Ctrl+-）"
        >
          −
        </button>
        <label className="zoom-readout">
          <input
            type="number"
            min={25}
            max={400}
            step={5}
            value={pageCount ? zoomPercent : ''}
            disabled={!pageCount}
            onChange={(e) => setZoomPercent(Number(e.target.value))}
            aria-label="縮放百分比"
          />
          <span>%</span>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => zoomIn()}
          disabled={!pageCount}
          title="放大（Ctrl+=）"
        >
          ＋
        </button>
      </div>

      <div className="statusbar-group display-modes">
        <span className="statusbar-label">顯示</span>
        {DISPLAY_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`btn ${displayMode === mode.id ? 'active' : ''}`}
            disabled={!pageCount}
            title={mode.title}
            onClick={() => setDisplayMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </footer>
  );
}
