import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { PageView } from './PageView';

type ZoomAnchor = {
  mx: number;
  my: number;
  scrollLeft: number;
  scrollTop: number;
  oldScale: number;
};

export function PdfViewer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pdf = usePdfStore((s) => s.pdf);
  const currentPage = usePdfStore((s) => s.currentPage);
  const pageCount = usePdfStore((s) => s.pageCount);
  const scale = usePdfStore((s) => s.scale);
  const zoomMode = usePdfStore((s) => s.zoomMode);
  const displayMode = usePdfStore((s) => s.displayMode);
  const fileName = usePdfStore((s) => s.fileName);
  const scrollRequestPage = usePdfStore((s) => s.scrollRequestPage);
  const openFile = usePdfStore((s) => s.openFile);
  const syncCurrentPage = usePdfStore((s) => s.syncCurrentPage);
  const clearScrollRequest = usePdfStore((s) => s.clearScrollRequest);
  const zoomByFactor = usePdfStore((s) => s.zoomByFactor);

  const isMulti = displayMode === 'multi-page';

  useEffect(() => {
    if (!pdf || zoomMode === 'percent') return;
    const el = wrapRef.current;
    if (!el) return;

    const compute = async () => {
      try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const pad = 48;
        const availW = Math.max(120, el.clientWidth - pad);
        const availH = Math.max(120, el.clientHeight - pad);
        const fitW = availW / base.width;
        const fitH = availH / base.height;
        const next =
          zoomMode === 'fit-width' || isMulti ? fitW : Math.min(fitW, fitH);
        const prev = usePdfStore.getState().scale;
        if (Math.abs(prev - next) < 0.005) return;
        usePdfStore.setState({
          scale: next,
          zoomPercent: Math.round(next * 100),
          zoomMode,
        });
      } catch {
        /* ignore */
      }
    };

    void compute();
    const ro = new ResizeObserver(() => {
      void compute();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf, zoomMode, isMulti]);

  useEffect(() => {
    if (!isMulti || scrollRequestPage == null || !wrapRef.current) return;
    const target = wrapRef.current.querySelector(
      `[data-page="${scrollRequestPage}"]`,
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    clearScrollRequest();
  }, [scrollRequestPage, isMulti, clearScrollRequest]);

  useEffect(() => {
    if (!isMulti || !wrapRef.current) return;
    const root = wrapRef.current;
    let raf = 0;

    const update = () => {
      raf = 0;
      const pages = root.querySelectorAll<HTMLElement>('[data-page]');
      if (!pages.length) return;
      const rootTop = root.getBoundingClientRect().top;
      const anchor = rootTop + Math.min(120, root.clientHeight * 0.2);
      let bestPage = 1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const el of pages) {
        const page = Number(el.dataset.page);
        if (!Number.isFinite(page)) continue;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - anchor);
        if (dist < bestDist) {
          bestDist = dist;
          bestPage = page;
        }
      }
      syncCurrentPage(bestPage);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [isMulti, pageCount, syncCurrentPage, fileName]);

  // Ctrl / ⌘ + wheel zoom (trackpad pinch also sends ctrl+wheel)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !fileName) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!usePdfStore.getState().pageCount) return;

      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = usePdfStore.getState().scale;
      zoomAnchorRef.current = {
        mx,
        my,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        oldScale,
      };

      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomByFactor(factor);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fileName, zoomByFactor]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const anchor = zoomAnchorRef.current;
    if (!el || !anchor) return;
    const ratio = scale / anchor.oldScale;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      zoomAnchorRef.current = null;
      return;
    }
    el.scrollLeft = (anchor.scrollLeft + anchor.mx) * ratio - anchor.mx;
    el.scrollTop = (anchor.scrollTop + anchor.my) * ratio - anchor.my;
    zoomAnchorRef.current = null;
  }, [scale]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await openFile(file);
  };

  return (
    <div
      className={`viewer-wrap ${isMulti ? 'multi-page' : 'single-page'}`}
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      title="Ctrl + 滾輪縮放"
    >
      {!fileName ? (
        <div className="dropzone">
          <p>拖放 PDF 到此處，或點上方「開啟」</p>
        </div>
      ) : isMulti ? (
        <div className="page-stack">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <PageView
              key={n}
              pageNumber={n}
              scale={scale}
              active={n === currentPage}
              lazy
            />
          ))}
        </div>
      ) : (
        <PageView pageNumber={currentPage} scale={scale} active />
      )}
    </div>
  );
}
