import { useEffect, useRef, useState } from 'react';
import type { OutlineItem } from '../lib/pdfjs';
import { usePdfStore } from '../store/usePdfStore';
import { PageThumb } from './PageThumb';

type SidebarTab = 'bookmark' | 'page';
type PageViewMode = 'number' | 'preview';

const THUMB_MIN = 80;
const THUMB_MAX = 220;
const THUMB_STEP = 20;
const SIDEBAR_MIN = 180;
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MAX_RATIO = 0.3;
const SIDEBAR_WIDTH_KEY = 'pdf-sidebar-width';

function clampThumbWidth(width: number): number {
  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, Math.round(width)));
}

function maxSidebarWidth(viewportWidth = window.innerWidth): number {
  return Math.max(SIDEBAR_MIN, Math.floor(viewportWidth * SIDEBAR_MAX_RATIO));
}

function clampSidebarWidth(width: number, viewportWidth = window.innerWidth): number {
  return Math.min(maxSidebarWidth(viewportWidth), Math.max(SIDEBAR_MIN, Math.round(width)));
}

function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT;
    return clampSidebarWidth(n);
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function OutlineTree({
  items,
  depth = 0,
}: {
  items: OutlineItem[];
  depth?: number;
}) {
  const goToPage = usePdfStore((s) => s.goToPage);
  const currentPage = usePdfStore((s) => s.currentPage);

  if (!items.length) return null;

  return (
    <ul className="outline-list" style={{ paddingLeft: depth ? 12 : 0 }}>
      {items.map((item, idx) => {
        const active =
          item.pageNumber != null && item.pageNumber === currentPage;
        return (
          <li key={`${item.title}-${idx}`}>
            <button
              type="button"
              className={`outline-item ${active ? 'active' : ''}`}
              disabled={item.pageNumber == null}
              onClick={() => {
                if (item.pageNumber != null) goToPage(item.pageNumber);
              }}
              title={
                item.pageNumber != null
                  ? `第 ${item.pageNumber} 頁`
                  : '無法解析頁碼'
              }
            >
              {item.title}
            </button>
            <OutlineTree items={item.items} depth={depth + 1} />
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar() {
  const sidebarOpen = usePdfStore((s) => s.sidebarOpen);
  const outline = usePdfStore((s) => s.outline);
  const pageCount = usePdfStore((s) => s.pageCount);
  const currentPage = usePdfStore((s) => s.currentPage);
  const goToPage = usePdfStore((s) => s.goToPage);
  const selectedPages = usePdfStore((s) => s.selectedPages);
  const selectOnlyPage = usePdfStore((s) => s.selectOnlyPage);
  const togglePageSelected = usePdfStore((s) => s.togglePageSelected);
  const selectPageRange = usePdfStore((s) => s.selectPageRange);
  const clearPageSelection = usePdfStore((s) => s.clearPageSelection);
  const [tab, setTab] = useState<SidebarTab>('page');
  const [pageView, setPageView] = useState<PageViewMode>('number');
  const [thumbWidth, setThumbWidth] = useState(160);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const thumbListRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const selectedSet = new Set(selectedPages);

  const onPageActivate = (
    page: number,
    e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    if (e.shiftKey) {
      selectPageRange(page);
      goToPage(page);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      togglePageSelected(page);
      goToPage(page);
      return;
    }
    selectOnlyPage(page);
    goToPage(page);
  };

  const zoomThumbs = (delta: number) => {
    setThumbWidth((w) => clampThumbWidth(w + delta));
  };

  useEffect(() => {
    const onResize = () => {
      setSidebarWidth((w) => clampSidebarWidth(w));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (pageView !== 'preview') return;
    const el = thumbListRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      zoomThumbs(e.deltaY < 0 ? THUMB_STEP : -THUMB_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pageView]);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    document.body.classList.add('sidebar-resizing');

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      setSidebarWidth(clampSidebarWidth(ev.clientX));
    };
    const onUp = (ev: PointerEvent) => {
      draggingRef.current = false;
      document.body.classList.remove('sidebar-resizing');
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  if (!sidebarOpen) return null;

  return (
    <aside
      className="sidebar"
      style={{ width: sidebarWidth }}
      aria-label="側欄"
    >
      <div className="sidebar-tabs" role="tablist" aria-label="側欄">
        <button
          type="button"
          role="tab"
          id="sidebar-tab-bookmark"
          aria-selected={tab === 'bookmark'}
          aria-controls="sidebar-panel-bookmark"
          className={`sidebar-tab ${tab === 'bookmark' ? 'active' : ''}`}
          onClick={() => setTab('bookmark')}
        >
          Bookmark
        </button>
        <button
          type="button"
          role="tab"
          id="sidebar-tab-page"
          aria-selected={tab === 'page'}
          aria-controls="sidebar-panel-page"
          className={`sidebar-tab ${tab === 'page' ? 'active' : ''}`}
          onClick={() => setTab('page')}
        >
          Page
        </button>
      </div>

      <div className="sidebar-panel">
        {tab === 'bookmark' ? (
          <div
            role="tabpanel"
            id="sidebar-panel-bookmark"
            aria-labelledby="sidebar-tab-bookmark"
            className="sidebar-section"
          >
            {outline.length === 0 ? (
              <p className="muted">此文件沒有書籤目錄</p>
            ) : (
              <OutlineTree items={outline} />
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id="sidebar-panel-page"
            aria-labelledby="sidebar-tab-page"
            className="sidebar-section"
          >
            {pageCount === 0 ? (
              <p className="muted">尚未開啟文件</p>
            ) : (
              <>
                <div className="page-view-toggle" role="group" aria-label="頁面顯示方式">
                  <button
                    type="button"
                    className={`page-view-btn ${pageView === 'number' ? 'active' : ''}`}
                    onClick={() => setPageView('number')}
                  >
                    頁碼
                  </button>
                  <button
                    type="button"
                    className={`page-view-btn ${pageView === 'preview' ? 'active' : ''}`}
                    onClick={() => setPageView('preview')}
                  >
                    預覽
                  </button>
                </div>

                {selectedPages.length > 0 && (
                  <div className="page-selection-bar">
                    <span>已選 {selectedPages.length} 頁 · Del 刪除</span>
                    <button
                      type="button"
                      className="page-view-btn"
                      onClick={() => clearPageSelection()}
                    >
                      清除
                    </button>
                  </div>
                )}

                {pageView === 'number' ? (
                  <div
                    className="page-jump-list"
                    title="Ctrl 多選 · Shift 範圍 · Del 刪除"
                  >
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                      (n) => (
                        <button
                          key={n}
                          type="button"
                          className={`page-chip ${n === currentPage ? 'active' : ''} ${selectedSet.has(n) ? 'selected' : ''}`}
                          aria-pressed={selectedSet.has(n)}
                          onClick={(e) => onPageActivate(n, e)}
                        >
                          {n}
                        </button>
                      ),
                    )}
                  </div>
                ) : (
                  <>
                    <div className="thumb-zoom-bar">
                      <button
                        type="button"
                        className="page-view-btn"
                        disabled={thumbWidth <= THUMB_MIN}
                        onClick={() => zoomThumbs(-THUMB_STEP)}
                        title="縮小預覽"
                      >
                        −
                      </button>
                      <input
                        type="range"
                        className="thumb-zoom-range"
                        min={THUMB_MIN}
                        max={THUMB_MAX}
                        step={THUMB_STEP}
                        value={thumbWidth}
                        onChange={(e) =>
                          setThumbWidth(clampThumbWidth(Number(e.target.value)))
                        }
                        aria-label="預覽縮放"
                      />
                      <button
                        type="button"
                        className="page-view-btn"
                        disabled={thumbWidth >= THUMB_MAX}
                        onClick={() => zoomThumbs(THUMB_STEP)}
                        title="放大預覽"
                      >
                        ＋
                      </button>
                      <span className="thumb-zoom-label">{thumbWidth}px</span>
                    </div>
                    <div
                      ref={thumbListRef}
                      className="page-thumb-list"
                      title="Ctrl 多選 · Shift 範圍 · Ctrl+滾輪縮放"
                    >
                      {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                        (n) => (
                          <PageThumb
                            key={n}
                            pageNumber={n}
                            thumbWidth={thumbWidth}
                            active={n === currentPage}
                            selected={selectedSet.has(n)}
                            onSelect={onPageActivate}
                          />
                        ),
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="調整側欄闊度"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={maxSidebarWidth()}
        aria-valuenow={sidebarWidth}
        title="拖曳調整闊度（上限 30%）"
        onPointerDown={onResizePointerDown}
      />
    </aside>
  );
}
