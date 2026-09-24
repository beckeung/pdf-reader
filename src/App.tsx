import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { PdfViewer } from './components/PdfViewer';
import { MergeDialog } from './components/MergeDialog';
import { SplitDialog } from './components/SplitDialog';
import { PhotoReportView } from './components/PhotoReportView';
import { usePdfStore } from './store/usePdfStore';
import { usePhotoReportStore } from './store/usePhotoReportStore';
import './styles/app.css';

function useViewerHotkeys() {
  const zoomIn = usePdfStore((s) => s.zoomIn);
  const zoomOut = usePdfStore((s) => s.zoomOut);
  const resetZoom = usePdfStore((s) => s.resetZoom);
  const setDisplayMode = usePdfStore((s) => s.setDisplayMode);
  const goToPage = usePdfStore((s) => s.goToPage);
  const currentPage = usePdfStore((s) => s.currentPage);
  const pageCount = usePdfStore((s) => s.pageCount);
  const selectedPages = usePdfStore((s) => s.selectedPages);
  const deleteSelectedPages = usePdfStore((s) => s.deleteSelectedPages);
  const clearPageSelection = usePdfStore((s) => s.clearPageSelection);
  const selectedTextId = usePdfStore((s) => s.selectedTextId);
  const removeAnnotation = usePdfStore((s) => s.removeAnnotation);
  const setSelectedTextId = usePdfStore((s) => s.setSelectedTextId);
  const copySelectedTextBox = usePdfStore((s) => s.copySelectedTextBox);
  const pasteTextBox = usePdfStore((s) => s.pasteTextBox);
  const textClipboard = usePdfStore((s) => s.textClipboard);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (!pageCount) return;

      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;

      // 文字框整格複製／貼上
      // - 不在輸入框：Ctrl+C / Ctrl+V / Ctrl+D
      // - 在輸入框：Ctrl+Shift+C / Ctrl+Shift+V（保留原生文字複製貼上）
      if (mod) {
        const boxCopy =
          key === 'c' || key === 'C'
            ? e.shiftKey
              ? true
              : !inField
            : false;
        const boxPaste =
          key === 'v' || key === 'V'
            ? e.shiftKey
              ? true
              : !inField
            : false;
        const boxDup =
          (key === 'd' || key === 'D') && !inField;

        if (boxCopy && selectedTextId) {
          e.preventDefault();
          copySelectedTextBox();
          return;
        }
        if (boxPaste && textClipboard) {
          e.preventDefault();
          pasteTextBox();
          return;
        }
        if (boxDup && selectedTextId) {
          e.preventDefault();
          if (copySelectedTextBox()) pasteTextBox();
          return;
        }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // 選取文字框後按 Delete（不在輸入框內）→ 刪除文字框
        if (
          key === 'Delete' &&
          selectedTextId &&
          !inField
        ) {
          e.preventDefault();
          removeAnnotation(selectedTextId);
          setSelectedTextId(null);
          return;
        }
        if (inField) return;

        if (key === 'Delete' && selectedPages.length > 0) {
          e.preventDefault();
          void deleteSelectedPages();
          return;
        }
        if (key === 'Escape') {
          if (selectedTextId) {
            e.preventDefault();
            setSelectedTextId(null);
            return;
          }
          if (selectedPages.length > 0) {
            e.preventDefault();
            clearPageSelection();
            return;
          }
        }
        if (key === 'ArrowLeft' || key === 'PageUp') {
          e.preventDefault();
          goToPage(currentPage - 1);
          return;
        }
        if (key === 'ArrowRight' || key === 'PageDown') {
          e.preventDefault();
          goToPage(currentPage + 1);
          return;
        }
      }

      if (inField) return;
      if (!e.ctrlKey && !e.metaKey) return;

      if (key === '=' || key === '+' || key === 'Add') {
        e.preventDefault();
        zoomIn();
      } else if (key === '-' || key === '_' || key === 'Subtract') {
        e.preventDefault();
        zoomOut();
      } else if (key === '0') {
        e.preventDefault();
        if (e.shiftKey) {
          setDisplayMode('fit-width');
        } else {
          resetZoom();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    pageCount,
    currentPage,
    selectedPages,
    selectedTextId,
    textClipboard,
    goToPage,
    deleteSelectedPages,
    clearPageSelection,
    removeAnnotation,
    setSelectedTextId,
    copySelectedTextBox,
    pasteTextBox,
    zoomIn,
    zoomOut,
    resetZoom,
    setDisplayMode,
  ]);
}

export default function App() {
  const error = usePdfStore((s) => s.error);
  const setError = usePdfStore((s) => s.setError);
  const photoReportOpen = usePhotoReportStore((s) => s.open);
  useViewerHotkeys();

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error, setError]);

  if (photoReportOpen) {
    return <PhotoReportView />;
  }

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <Sidebar />
        <PdfViewer />
      </div>
      <StatusBar />
      <MergeDialog />
      <SplitDialog />
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button type="button" className="toast-close" onClick={() => setError(null)}>
            關閉
          </button>
        </div>
      )}
    </div>
  );
}
