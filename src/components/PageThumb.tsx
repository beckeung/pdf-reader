import { useEffect, useRef, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';

type PageThumbProps = {
  pageNumber: number;
  active: boolean;
  selected?: boolean;
  thumbWidth: number;
  onSelect: (
    page: number,
    e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
};

export function PageThumb({
  pageNumber,
  active,
  selected = false,
  thumbWidth,
  onSelect,
}: PageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(1.4);
  const pdf = usePdfStore((s) => s.pdf);
  const fileName = usePdfStore((s) => s.fileName);

  useEffect(() => {
    setVisible(false);
    setFailed(false);
  }, [fileName, pageNumber]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const root = el.closest('.sidebar-panel');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setVisible(true);
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: '160px 0px',
        threshold: 0.01,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !visible || !canvasRef.current) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const scale = thumbWidth / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          outputScale !== 1
            ? ([outputScale, 0, 0, outputScale, 0, 0] as number[])
            : undefined;

        const task = page.render({
          canvas,
          viewport,
          transform,
          background: '#ffffff',
        });
        cancelRender = () => {
          try {
            task.cancel();
          } catch {
            /* ignore */
          }
        };
        await task.promise;
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (cancelled || name === 'RenderingCancelledException') return;
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, pageNumber, visible, thumbWidth]);

  return (
    <button
      ref={rootRef}
      type="button"
      className={`page-thumb ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={(e) => onSelect(pageNumber, e)}
      title={`第 ${pageNumber} 頁`}
      style={{ ['--thumb-w' as string]: `${thumbWidth}px` }}
    >
      <span
        className="page-thumb-frame"
        style={{ minHeight: Math.round(thumbWidth * aspect) }}
      >
        {failed ? (
          <span className="page-thumb-fallback">無法預覽</span>
        ) : (
          <canvas ref={canvasRef} className="page-thumb-canvas" />
        )}
      </span>
      <span className="page-thumb-label">{pageNumber}</span>
    </button>
  );
}
