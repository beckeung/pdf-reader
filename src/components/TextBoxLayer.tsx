import { useEffect, useRef } from 'react';
import type { TextAnnotation } from '../lib/annotations';
import { usePdfStore } from '../store/usePdfStore';

type TextBoxLayerProps = {
  annotations: TextAnnotation[];
  scale: number;
  pageHeight: number;
  pageWidth: number;
  pageNumber: number;
};

export function TextBoxLayer({
  annotations,
  scale,
  pageHeight,
  pageWidth,
  pageNumber,
}: TextBoxLayerProps) {
  const updateAnnotation = usePdfStore((s) => s.updateAnnotation);
  const removeAnnotation = usePdfStore((s) => s.removeAnnotation);
  const selectedTextId = usePdfStore((s) => s.selectedTextId);
  const setSelectedTextId = usePdfStore((s) => s.setSelectedTextId);
  const copySelectedTextBox = usePdfStore((s) => s.copySelectedTextBox);
  const pasteTextBox = usePdfStore((s) => s.pasteTextBox);
  const textClipboard = usePdfStore((s) => s.textClipboard);
  const tool = usePdfStore((s) => s.tool);
  const prevCountRef = useRef(0);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (annotations.length > prevCountRef.current) {
      const newest = annotations[annotations.length - 1];
      if (newest) {
        setSelectedTextId(newest.id);
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>(
            `textarea[data-text-id="${newest.id}"]`,
          );
          el?.focus();
        });
      }
    }
    prevCountRef.current = annotations.length;
  }, [annotations, setSelectedTextId]);

  if (!annotations.length) return null;

  const onDragPointerDown = (
    e: React.PointerEvent,
    ann: TextAnnotation,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedTextId(ann.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: ann.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: ann.x,
      origY: ann.y,
    };
  };

  const onDragPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    let nextX = drag.origX + dx;
    let nextY = drag.origY - dy;
    const ann = annotations.find((a) => a.id === drag.id);
    if (!ann) return;
    nextX = Math.max(0, Math.min(nextX, pageWidth - ann.width));
    nextY = Math.max(0, Math.min(nextY, pageHeight - ann.height));
    updateAnnotation(drag.id, { x: nextX, y: nextY });
  };

  const onDragPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const onResizePointerDown = (
    e: React.PointerEvent,
    ann: TextAnnotation,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedTextId(ann.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      id: ann.id,
      startX: e.clientX,
      startY: e.clientY,
      origW: ann.width,
      origH: ann.height,
      origX: ann.x,
      origY: ann.y,
    };
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    e.stopPropagation();
    const dx = (e.clientX - resize.startX) / scale;
    const dy = (e.clientY - resize.startY) / scale;
    const width = Math.max(
      60,
      Math.min(resize.origW + dx, pageWidth - resize.origX),
    );
    const height = Math.max(
      28,
      Math.min(resize.origH + dy, resize.origY + resize.origH),
    );
    const y = resize.origY + resize.origH - height;
    updateAnnotation(resize.id, { width, height, y: Math.max(0, y) });
  };

  const onResizePointerUp = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    e.stopPropagation();
    resizeRef.current = null;
  };

  const deleteBox = (id: string) => {
    removeAnnotation(id);
    setSelectedTextId(null);
  };

  return (
    <div className="text-box-layer" data-page={pageNumber}>
      {annotations.map((ann) => {
        const left = ann.x * scale;
        const top = (pageHeight - ann.y - ann.height) * scale;
        const selected = selectedTextId === ann.id;
        return (
          <div
            key={ann.id}
            className={`text-box ${selected ? 'selected' : ''} ${tool === 'text' ? 'editable' : ''}`}
            style={{
              left,
              top,
              width: ann.width * scale,
              height: ann.height * scale,
              borderColor: ann.color,
              color: ann.color,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTextId(ann.id);
            }}
          >
            <div
              className="text-box-handle"
              title="拖曳移動位置"
              onPointerDown={(e) => onDragPointerDown(e, ann)}
              onPointerMove={onDragPointerMove}
              onPointerUp={onDragPointerUp}
              onPointerCancel={onDragPointerUp}
            >
              <span>文字</span>
              <div className="text-box-actions">
                <button
                  type="button"
                  className="text-box-action"
                  title="複製文字框（Ctrl+C）"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    copySelectedTextBox(ann.id);
                  }}
                >
                  複製
                </button>
                <button
                  type="button"
                  className="text-box-action"
                  title="貼上文字框（Ctrl+V）"
                  disabled={!textClipboard}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    pasteTextBox();
                  }}
                >
                  貼上
                </button>
                <button
                  type="button"
                  className="text-box-delete"
                  title="刪除文字框"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deleteBox(ann.id);
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
            <textarea
              className="text-box-input"
              data-text-id={ann.id}
              value={ann.text}
              placeholder="輸入或修改文字…"
              style={{ fontSize: Math.max(10, ann.fontSize * scale) }}
              onFocus={() => setSelectedTextId(ann.id)}
              onChange={(e) =>
                updateAnnotation(ann.id, { text: e.target.value })
              }
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Ctrl/⌘+Delete 或 Ctrl/⌘+Backspace：刪除整個文字框
                if (
                  (e.key === 'Delete' || e.key === 'Backspace') &&
                  (e.ctrlKey || e.metaKey)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteBox(ann.id);
                }
              }}
            />
            <div
              className="text-box-print"
              style={{ fontSize: Math.max(10, ann.fontSize * scale) }}
              aria-hidden
            >
              {ann.text}
            </div>
            <div
              className="text-box-resize"
              title="拖曳調整大小"
              onPointerDown={(e) => onResizePointerDown(e, ann)}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
          </div>
        );
      })}
    </div>
  );
}
