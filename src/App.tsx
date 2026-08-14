import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { PdfViewer } from './components/PdfViewer';
import { MergeDialog } from './components/MergeDialog';
import { SplitDialog } from './components/SplitDialog';
import { usePdfStore } from './store/usePdfStore';
import './styles/app.css';

function useZoomHotkeys() {
  const zoomIn = usePdfStore((s) => s.zoomIn);
  const zoomOut = usePdfStore((s) => s.zoomOut);
  const resetZoom = usePdfStore((s) => s.resetZoom);
  const setDisplayMode = usePdfStore((s) => s.setDisplayMode);
  const pageCount = usePdfStore((s) => s.pageCount);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!pageCount) return;

      const key = e.key;
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
  }, [pageCount, zoomIn, zoomOut, resetZoom, setDisplayMode]);
}

export default function App() {
  const error = usePdfStore((s) => s.error);
  const setError = usePdfStore((s) => s.setError);
  useZoomHotkeys();

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error, setError]);

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
