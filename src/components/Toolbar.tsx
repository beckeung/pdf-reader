import { useEffect, useRef, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { usePhotoReportStore } from '../store/usePhotoReportStore';
import { downloadBytes } from '../lib/pdfOps';
import { exportPdfWithAnnotations } from '../lib/annotations';
import type { ToolMode } from '../lib/annotations';

const MARK_TOOLS: {
  id: Exclude<ToolMode, 'pan' | 'note' | 'text'>;
  label: string;
}[] = [
  { id: 'highlight', label: '螢光筆' },
  { id: 'line', label: '畫線' },
  { id: 'ink', label: '手繪' },
];

function isMarkTool(tool: ToolMode): boolean {
  return tool === 'highlight' || tool === 'line' || tool === 'ink';
}

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markMenuRef = useRef<HTMLDivElement>(null);
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const {
    fileName,
    fileBytes,
    pageCount,
    tool,
    annotationColor,
    annotations,
    loading,
    sidebarOpen,
    fileHandle,
    setTool,
    setAnnotationColor,
    setMergeOpen,
    setSplitOpen,
    setSidebarOpen,
    openFile,
    openFromUrl,
    setError,
    saveDocument,
    saveDocumentAs,
    rotateSelectedOrCurrent,
  } = usePdfStore();
  const openReport = usePhotoReportStore((s) => s.openReport);

  const activeMark = MARK_TOOLS.find((t) => t.id === tool);
  const markActive = isMarkTool(tool);

  useEffect(() => {
    if (!markMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = markMenuRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMarkMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMarkMenuOpen(false);
    };
    // delay so the opening click doesn't immediately close the menu
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown);
    }, 0);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [markMenuOpen]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await openFile(file);
  };

  const loadTestPdf = async () => {
    await openFromUrl(
      '/testmaterial/31WeeklyReport.pdf',
      '31WeeklyReport.pdf',
    );
  };

  const exportAnnotated = async () => {
    if (!fileBytes) {
      setError('請先開啟 PDF');
      return;
    }
    try {
      const bytes = await exportPdfWithAnnotations(fileBytes, annotations);
      const base = fileName?.replace(/\.pdf$/i, '') || 'document';
      downloadBytes(bytes, `${base}-標記.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗');
    }
  };

  const pickMarkTool = (id: (typeof MARK_TOOLS)[number]['id']) => {
    setTool(id);
    setMarkMenuOpen(false);
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button
          type="button"
          className="btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="切換目錄"
        >
          目錄
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          開啟
        </button>
        <button
          type="button"
          className="btn"
          disabled={!fileBytes || loading}
          onClick={() => void saveDocument()}
          title={
            fileHandle
              ? '儲存到目前檔案（含標記）'
              : '尚未綁定檔案位置，將改為另存新檔'
          }
        >
          儲存
        </button>
        <button
          type="button"
          className="btn"
          disabled={!fileBytes || loading}
          onClick={() => void saveDocumentAs()}
          title="另存新檔（含標記）"
        >
          另存新檔
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void loadTestPdf()}
          disabled={loading}
          title="載入 testmaterial/31WeeklyReport.pdf（約 40MB／50 頁）"
        >
          測試檔
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={onPickFile}
        />
        <span className="file-label" title={fileName ?? undefined}>
          {loading ? '載入中…' : fileName ?? '尚未開啟檔案'}
        </span>
      </div>

      <div className="toolbar-group tools">
        <button
          type="button"
          className={`btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => setTool('pan')}
        >
          瀏覽
        </button>

        <div className="mark-menu" ref={markMenuRef}>
          <button
            type="button"
            className={`btn mark-menu-trigger ${markActive ? 'active' : ''}`}
            disabled={!pageCount}
            aria-haspopup="menu"
            aria-expanded={markMenuOpen}
            onClick={() => setMarkMenuOpen((open) => !open)}
            title="標注工具"
          >
            <span
              className="mark-menu-swatch"
              style={{ background: annotationColor }}
              aria-hidden
            />
            {activeMark ? activeMark.label : '標注工具'}
            <span className="mark-menu-caret" aria-hidden>
              ▾
            </span>
          </button>

          {markMenuOpen && (
            <div className="mark-menu-panel" role="menu" aria-label="標注工具">
              <div className="mark-menu-title">標注工具</div>
              {MARK_TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === t.id}
                  className={`mark-menu-item ${tool === t.id ? 'active' : ''}`}
                  onClick={() => pickMarkTool(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <label className="mark-menu-color">
                <span>顏色</span>
                <input
                  type="color"
                  value={annotationColor}
                  onChange={(e) => setAnnotationColor(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`btn ${tool === 'note' ? 'active' : ''}`}
          disabled={!pageCount}
          onClick={() => setTool('note')}
        >
          註解
        </button>
        <button
          type="button"
          className={`btn ${tool === 'text' ? 'active' : ''}`}
          disabled={!pageCount}
          onClick={() => setTool('text')}
          title="可列印文字：儲存／匯出會寫入 PDF（含中文）；Ctrl+C/V 整格"
        >
          文字
        </button>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className="btn"
          disabled={!fileBytes || loading}
          onClick={() => void rotateSelectedOrCurrent(-90)}
          title="逆時針旋轉 90°（有選頁則旋轉選取頁，否則旋轉目前頁）"
        >
          ↺
        </button>
        <button
          type="button"
          className="btn"
          disabled={!fileBytes || loading}
          onClick={() => void rotateSelectedOrCurrent(90)}
          title="順時針旋轉 90°（有選頁則旋轉選取頁，否則旋轉目前頁）"
        >
          ↻ 旋轉
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => openReport()}
          title="開啟相片報告版面：放置相片與文字並產生 PDF"
        >
          相片報告
        </button>
        <button type="button" className="btn" onClick={() => setMergeOpen(true)}>
          合併
        </button>
        <button
          type="button"
          className="btn"
          disabled={!fileBytes}
          onClick={() => setSplitOpen(true)}
        >
          分拆
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!fileBytes}
          onClick={exportAnnotated}
          title="螢光筆／畫線／手繪會寫入 PDF；文字框以可列印圖層寫入（支援中文）"
        >
          匯出標記
        </button>
      </div>
    </header>
  );
}
