import { useEffect, useRef, useState } from 'react';
import type { Annotation, Point } from '../lib/annotations';
import { createId } from '../lib/annotations';
import { startPageRender } from '../lib/pdfjs';
import { usePdfStore } from '../store/usePdfStore';
import { AnnotationLayer } from './AnnotationLayer';

function screenToPdf(
  offsetX: number,
  offsetY: number,
  pageHeight: number,
  scale: number,
): Point {
  return {
    x: offsetX / scale,
    y: pageHeight - offsetY / scale,
  };
}

type PageViewProps = {
  pageNumber: number;
  scale: number;
  active: boolean;
  lazy?: boolean;
};

export function PageView({
  pageNumber,
  scale,
  active,
  lazy = false,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const startRef = useRef<Point | null>(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [pageSize, setPageSize] = useState({
    width: 0,
    height: 0,
    pageWidth: 0,
    pageHeight: 0,
  });
  const [draft, setDraft] = useState<Annotation | null>(null);

  const pdf = usePdfStore((s) => s.pdf);
  const tool = usePdfStore((s) => s.tool);
  const annotationColor = usePdfStore((s) => s.annotationColor);
  const annotations = usePdfStore((s) => s.annotations);
  const addAnnotation = usePdfStore((s) => s.addAnnotation);
  const setError = usePdfStore((s) => s.setError);

  // Reserve correct slot size before paint to avoid scroll jump when canvas appears
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale });
        setPageSize((prev) => {
          if (
            prev.pageWidth === base.width &&
            prev.pageHeight === base.height &&
            Math.abs(prev.width - viewport.width) < 0.5 &&
            Math.abs(prev.height - viewport.height) < 0.5
          ) {
            return prev;
          }
          return {
            width: viewport.width,
            height: viewport.height,
            pageWidth: base.width,
            pageHeight: base.height,
          };
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    if (!lazy || !rootRef.current) return;
    const el = rootRef.current;
    const root = el.closest('.viewer-wrap');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
          }
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: '400px 0px',
        threshold: 0.01,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, pageNumber]);

  useEffect(() => {
    setDraft(null);
    drawing.current = false;
    startRef.current = null;
  }, [pageNumber]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !shouldRender) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const render = startPageRender(page, canvasRef.current, scale);
        cancelRender = render.cancel;
        const size = await render.promise;
        if (!cancelled) {
          setPageSize({
            width: size.width,
            height: size.height,
            pageWidth: size.pageWidth,
            pageHeight: size.pageHeight,
          });
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (cancelled || name === 'RenderingCancelledException') return;
        setError(err instanceof Error ? err.message : '頁面渲染失敗');
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, pageNumber, scale, shouldRender, setError]);

  const pageAnns = annotations.filter((a) => a.pageIndex === pageNumber - 1);
  const visible = draft ? [...pageAnns, draft] : pageAnns;

  const getLocalPoint = (e: React.PointerEvent): Point | null => {
    const layer = rootRef.current;
    if (!layer || pageSize.pageHeight === 0) return null;
    const rect = layer.getBoundingClientRect();
    return screenToPdf(
      e.clientX - rect.left,
      e.clientY - rect.top,
      pageSize.pageHeight,
      scale,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === 'pan' || !pdf) return;
    const pt = getLocalPoint(e);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    startRef.current = pt;
    const pageIndex = pageNumber - 1;

    if (tool === 'highlight') {
      setDraft({
        id: createId(),
        type: 'highlight',
        pageIndex,
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        color: annotationColor,
      });
    } else if (tool === 'line') {
      setDraft({
        id: createId(),
        type: 'line',
        pageIndex,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        color: annotationColor,
        strokeWidth: 2,
      });
    } else if (tool === 'ink') {
      setDraft({
        id: createId(),
        type: 'ink',
        pageIndex,
        points: [pt],
        color: annotationColor,
        strokeWidth: 2.5,
      });
    } else if (tool === 'note') {
      const text = window.prompt('輸入註解文字：', '');
      drawing.current = false;
      startRef.current = null;
      if (text == null || !text.trim()) return;
      addAnnotation({
        id: createId(),
        type: 'note',
        pageIndex,
        x: pt.x,
        y: pt.y,
        text: text.trim(),
        color: annotationColor,
      });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const pt = getLocalPoint(e);
    if (!pt) return;

    if (draft.type === 'highlight' && startRef.current) {
      const s = startRef.current;
      setDraft({
        ...draft,
        x: Math.min(s.x, pt.x),
        y: Math.min(s.y, pt.y),
        width: Math.abs(pt.x - s.x),
        height: Math.abs(pt.y - s.y),
      });
    } else if (draft.type === 'line') {
      setDraft({ ...draft, x2: pt.x, y2: pt.y });
    } else if (draft.type === 'ink') {
      setDraft({ ...draft, points: [...draft.points, pt] });
    }
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    startRef.current = null;
    if (!draft) return;

    if (draft.type === 'highlight' && (draft.width < 2 || draft.height < 2)) {
      setDraft(null);
      return;
    }
    if (
      draft.type === 'line' &&
      Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 2
    ) {
      setDraft(null);
      return;
    }
    if (draft.type === 'ink' && draft.points.length < 2) {
      setDraft(null);
      return;
    }
    addAnnotation(draft);
    setDraft(null);
  };

  return (
    <div
      ref={rootRef}
      className={`page-stage ${active ? 'active-page' : ''}`}
      data-page={pageNumber}
      style={{
        width: pageSize.width || undefined,
        height: pageSize.height || undefined,
        minHeight: pageSize.height || 240,
        cursor: tool === 'pan' ? 'default' : 'crosshair',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      {shouldRender && pageSize.pageHeight > 0 && (
        <AnnotationLayer
          annotations={visible}
          scale={scale}
          pageHeight={pageSize.pageHeight}
        />
      )}
    </div>
  );
}
