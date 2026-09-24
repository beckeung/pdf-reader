import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadPhotoReportPdf } from '../lib/photoReportPdf';
import {
  DEFAULT_FILENAME_PAGE_RULE,
  listRoomCodes,
  previewRoomGrouping,
  type FilenamePageRule,
  type PhotoInsertMode,
} from '../lib/photoNamePaging';
import {
  PHOTO_REPORT_EXT,
  buildPhotoReportProject,
  parsePhotoReportProject,
  pickPhotoReportProjectFile,
  savePhotoReportProjectAs,
} from '../lib/photoReportProject';
import {
  GRID_PRESETS,
  findEmptySlotOnPage,
  getGridCells,
  getPageCount,
  getPhotoCaptionBox,
  getReportPageDims,
  groupPhotosByPage,
  nearestSlotFromPoint,
  slotsPerPage,
  usePhotoReportStore,
  type PhotoReportItem,
  type PhotoReportPhoto,
  type ReportPageOrientation,
  type ReportPageSize,
} from '../store/usePhotoReportStore';

const UI_SCALE = 1.05;

export function PhotoReportView() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const {
    title,
    items,
    pageNotes,
    selectedIds,
    currentPage,
    collapsedPages,
    gridCols,
    gridRows,
    pageSize,
    pageOrientation,
    busy,
    error,
    setTitle,
    setPageNote,
    setSelectedId,
    selectItem,
    clearSelection,
    setCurrentPage,
    togglePageCollapsed,
    setError,
    setGridLayout,
    setPageSize,
    setPageOrientation,
    addPhotosFromFiles,
    addTextBlock,
    updateItem,
    removeSelected,
    clearReport,
    closeReport,
    placePhotoInSlot,
    movePhotoTo,
    rotateSelectedPhotos,
    sortPagesByRoom,
    sortPhotosWithinPages,
    nudgePhotoOnPage,
    loadReportSnapshot,
  } = usePhotoReportStore();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSelectedPhoto = useMemo(
    () =>
      selectedIds.some((id) =>
        items.some((i) => i.id === id && i.type === 'photo'),
      ),
    [selectedIds, items],
  );
  const perPage = slotsPerPage(gridCols, gridRows);
  const { width: pageWidth, height: pageHeight } = useMemo(
    () => getReportPageDims(pageSize, pageOrientation),
    [pageSize, pageOrientation],
  );
  const cells = useMemo(
    () => getGridCells(gridCols, gridRows, pageSize, pageOrientation),
    [gridCols, gridRows, pageSize, pageOrientation],
  );
  const gridLabel = `${gridCols}×${gridRows}`;
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [paperMenuOpen, setPaperMenuOpen] = useState(false);
  const gridMenuRef = useRef<HTMLDivElement>(null);
  const paperMenuRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const [listDragId, setListDragId] = useState<string | null>(null);
  const [listDropTarget, setListDropTarget] = useState<{
    pageIndex: number;
    slot: number;
  } | null>(null);
  const [stageView, setStageView] = useState<'one' | 'two' | 'all'>('one');
  const [pendingPhotos, setPendingPhotos] = useState<File[] | null>(null);
  const [insertMode, setInsertMode] = useState<PhotoInsertMode>('byName');
  const [nameRule, setNameRule] = useState<FilenamePageRule>(
    DEFAULT_FILENAME_PAGE_RULE,
  );
  const [showCustomRule, setShowCustomRule] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [manualSort, setManualSort] = useState(false);
  const [customRoomOrder, setCustomRoomOrder] = useState<string[] | null>(
    null,
  );
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [captionEdit, setCaptionEdit] = useState<{
    id: string;
    name: string;
    draft: string;
  } | null>(null);
  const dragRef = useRef<{
    id: string;
    kind: 'photo' | 'text';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    pageIndex: number;
    scale: number;
  } | null>(null);

  const pageCount = getPageCount(items);
  const groups = useMemo(() => groupPhotosByPage(items), [items]);
  const stageScale =
    stageView === 'one' ? UI_SCALE : stageView === 'two' ? 0.72 : 0.52;
  const visiblePages = useMemo(() => {
    if (stageView === 'all') {
      return Array.from({ length: pageCount }, (_, i) => i);
    }
    if (stageView === 'two') {
      if (pageCount <= 1) return [0];
      const start = Math.min(currentPage, pageCount - 2);
      return [start, start + 1];
    }
    return [Math.min(currentPage, Math.max(0, pageCount - 1))];
  }, [stageView, currentPage, pageCount]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error, setError]);

  useEffect(() => {
    if (!gridMenuOpen && !paperMenuOpen && !sortMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (gridMenuOpen && !gridMenuRef.current?.contains(t)) {
        setGridMenuOpen(false);
      }
      if (paperMenuOpen && !paperMenuRef.current?.contains(t)) {
        setPaperMenuOpen(false);
      }
      if (sortMenuOpen && !sortMenuRef.current?.contains(t)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [gridMenuOpen, paperMenuOpen, sortMenuOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
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
      if (!selectedIds.length) return;
      e.preventDefault();
      removeSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, removeSelected]);

  const onGenerate = async () => {
    if (!items.length) {
      setError('請先加入相片或文字');
      return;
    }
    setGenBusy(true);
    try {
      await downloadPhotoReportPdf(
        title,
        items,
        pageNotes,
        gridCols,
        gridRows,
        pageSize,
        pageOrientation,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生 PDF 失敗');
    } finally {
      setGenBusy(false);
    }
  };

  const onSaveProject = async () => {
    if (!items.length) {
      setError('請先加入相片或文字再儲存');
      return;
    }
    setProjectBusy(true);
    try {
      const bytes = await buildPhotoReportProject({
        title,
        gridCols,
        gridRows,
        pageSize,
        pageOrientation,
        pageNotes,
        items,
      });
      const ok = await savePhotoReportProjectAs(bytes, title);
      if (!ok) return;
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存專案失敗');
    } finally {
      setProjectBusy(false);
    }
  };

  const loadProjectFromFile = async (file: File) => {
    setProjectBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const loaded = await parsePhotoReportProject(buf);
      if (items.length > 0) {
        const proceed = window.confirm(
          '載入專案會取代目前報告內容，確定繼續？',
        );
        if (!proceed) return;
      }
      loadReportSnapshot(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入專案失敗');
    } finally {
      setProjectBusy(false);
    }
  };

  const onLoadProject = async () => {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const picked = await pickPhotoReportProjectFile();
        if (picked) await loadProjectFromFile(picked);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入專案失敗');
      }
      return;
    }
    projectInputRef.current?.click();
  };

  const requestAddPhotos = (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      setError('請選擇圖片檔（JPG／PNG／WebP 等）');
      return;
    }
    setInsertMode('byName');
    setShowCustomRule(false);
    setPendingPhotos(list);
  };

  const namePreview = useMemo(
    () => (pendingPhotos ? previewRoomGrouping(pendingPhotos, nameRule) : []),
    [pendingPhotos, nameRule],
  );

  const confirmAddPhotos = () => {
    if (!pendingPhotos?.length) {
      setPendingPhotos(null);
      return;
    }
    const files = pendingPhotos;
    const mode = insertMode;
    const rule = { ...nameRule };
    setPendingPhotos(null);
    void addPhotosFromFiles(files, mode, rule);
  };

  const clampOnPage = (item: PhotoReportItem, x: number, y: number) => {
    // Keep entirely within the page (cannot leave this page)
    const nextX = Math.max(0, Math.min(x, pageWidth - item.width));
    const nextY = Math.max(0, Math.min(y, pageHeight - item.height));
    return { x: nextX, y: nextY };
  };

  const openCaptionEditor = (photo: PhotoReportPhoto) => {
    setSelectedId(photo.id);
    setCaptionEdit({
      id: photo.id,
      name: photo.name,
      draft: photo.caption ?? '',
    });
  };

  const saveCaptionEditor = () => {
    if (!captionEdit) return;
    updateItem(captionEdit.id, { caption: captionEdit.draft });
    const photo = usePhotoReportStore
      .getState()
      .items.find((i): i is PhotoReportPhoto => i.id === captionEdit.id);
    if (photo?.type === 'photo') {
      placePhotoInSlot(photo.id, photo.slot);
    }
    setCaptionEdit(null);
  };

  const onSelectClick = (
    e: React.MouseEvent,
    id: string,
  ) => {
    e.stopPropagation();
    selectItem(id, e.ctrlKey || e.metaKey);
  };

  const onDragStart = (
    e: React.PointerEvent,
    item: PhotoReportItem,
    scale: number,
  ) => {
    if ((e.target as HTMLElement).closest('textarea,button,input')) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      selectItem(item.id, true);
      return;
    }
    e.preventDefault();
    if (!selectedSet.has(item.id)) {
      setSelectedId(item.id);
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: item.id,
      kind: item.type,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
      pageIndex: item.pageIndex,
      scale,
    };
  };

  const onDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const scale = drag.scale || UI_SCALE;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const item = items.find((i) => i.id === drag.id);
    if (!item || item.pageIndex !== drag.pageIndex) return;
    const pos = clampOnPage(item, drag.origX + dx, drag.origY - dy);
    updateItem(drag.id, pos);

    if (drag.kind === 'photo') {
      const cx = pos.x + item.width / 2;
      const cy = pos.y + item.height / 2;
      setHoverPage(drag.pageIndex);
      setHoverSlot(nearestSlotFromPoint(cx, cy, cells));
    }
  };

  const onDragEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setHoverSlot(null);
    setHoverPage(null);
    if (!drag || drag.kind !== 'photo') return;
    const latest = usePhotoReportStore
      .getState()
      .items.find((i) => i.id === drag.id);
    if (!latest || latest.type !== 'photo') return;
    if (latest.pageIndex !== drag.pageIndex) {
      placePhotoInSlot(latest.id, latest.slot);
      return;
    }
    const cx = latest.x + latest.width / 2;
    const cy = latest.y + latest.height / 2;
    placePhotoInSlot(latest.id, nearestSlotFromPoint(cx, cy, cells));
  };

  const renderReportPage = (pageIndex: number, scale: number) => {
    const pageItems = items.filter((i) => i.pageIndex === pageIndex);
    const active = pageIndex === currentPage;
    return (
      <div
        key={pageIndex}
        className={`photo-report-page-shell ${active ? 'active' : ''}`}
      >
        {stageView !== 'one' && (
          <div className="photo-report-page-badge">第 {pageIndex + 1} 頁</div>
        )}
        <div
          className="photo-report-page"
          style={{
            width: pageWidth * scale,
            height: pageHeight * scale,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (pageIndex !== currentPage) setCurrentPage(pageIndex);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files?.length) {
              requestAddPhotos(e.dataTransfer.files);
            }
          }}
        >
          <div
            className="photo-report-page-title"
            style={{ fontSize: 20 * scale }}
          >
            {title.trim() || '（報告標題）'}
          </div>
          <div
            className="photo-report-page-caption"
            style={{ fontSize: 13 * scale }}
          >
            {(pageNotes[pageIndex] ?? '').trim() || ' '}
          </div>

          {cells.map((cell, i) => (
            <div
              key={`cell-${pageIndex}-${i}`}
              className={`photo-report-cell ${
                hoverPage === pageIndex && hoverSlot === i ? 'drop-target' : ''
              }`}
              style={{
                left: cell.x * scale,
                top: (pageHeight - cell.y - cell.h) * scale,
                width: cell.w * scale,
                height: cell.h * scale,
              }}
            >
              <span className="photo-report-cell-label">{i + 1}</span>
            </div>
          ))}

          {pageItems.map((item) => {
            if (item.type === 'photo') {
              const left = item.x * scale;
              const top = (pageHeight - item.y - item.height) * scale;
              const selected = selectedSet.has(item.id);
              const boxW = item.width * scale;
              const boxH = item.height * scale;
              const rot = item.rotation ?? 0;
              const odd = rot === 90 || rot === 270;
              const cap = getPhotoCaptionBox(item, cells);
              const capLeft = cap.x * scale;
              const capTop =
                (pageHeight - cap.y - cap.height) * scale;
              return (
                <div key={item.id} className="photo-report-photo-wrap">
                  <div
                    className={`photo-report-item photo ${selected ? 'selected' : ''}`}
                    style={{
                      left,
                      top,
                      width: boxW,
                      height: boxH,
                    }}
                    onPointerDown={(e) => onDragStart(e, item, scale)}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    onClick={(e) => onSelectClick(e, item.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      openCaptionEditor(item);
                    }}
                    title="Ctrl 多選 · 工具列旋轉"
                  >
                    <img
                      src={item.src}
                      alt={item.name}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: odd ? boxH : boxW,
                        height: odd ? boxW : boxH,
                        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                      }}
                    />
                  </div>
                  <div
                    className={`photo-report-photo-caption ${selected ? 'selected' : ''}`}
                    style={{
                      left: capLeft,
                      top: capTop,
                      width: cap.width * scale,
                      height: cap.height * scale,
                      fontSize: Math.max(9, 11 * scale),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(item.id);
                      openCaptionEditor(item);
                    }}
                    title="點擊編輯描述"
                  >
                    {(item.caption ?? '').trim() || '（點此加描述）'}
                  </div>
                </div>
              );
            }
            const left = item.x * scale;
            const top = (pageHeight - item.y - item.height) * scale;
            const selected = selectedSet.has(item.id);
            return (
              <div
                key={item.id}
                className={`photo-report-item text ${selected ? 'selected' : ''}`}
                style={{
                  left,
                  top,
                  width: item.width * scale,
                  height: item.height * scale,
                }}
                onPointerDown={(e) => onDragStart(e, item, scale)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                onClick={(e) => onSelectClick(e, item.id)}
              >
                <textarea
                  value={item.text}
                  placeholder="輸入文字…"
                  style={{ fontSize: Math.max(10, item.fontSize * scale) }}
                  onChange={(e) =>
                    updateItem(item.id, { text: e.target.value })
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="photo-report">
      <header className="photo-report-bar">
        <div className="toolbar-group">
          <button type="button" className="btn" onClick={() => closeReport()}>
            ← 返回閱讀器
          </button>
          <input
            className="photo-report-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="報告標題"
            placeholder="報告標題"
          />
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => photoInputRef.current?.click()}
            title="加入相片：可設定插入／依檔名房型分頁"
          >
            加入相片
          </button>
          <button type="button" className="btn" onClick={() => addTextBlock()}>
            加入文字
          </button>
          <div className="photo-report-grid-menu" ref={gridMenuRef}>
            <button
              type="button"
              className={`btn ${gridMenuOpen ? 'active' : ''}`}
              onClick={() => {
                setGridMenuOpen((o) => !o);
                setPaperMenuOpen(false);
              }}
              title="選擇每頁相片格數（會重新排列所有相片）"
              aria-expanded={gridMenuOpen}
              aria-haspopup="menu"
            >
              排格 {gridLabel}
            </button>
            {gridMenuOpen && (
              <div className="photo-report-grid-dropdown" role="menu">
                {GRID_PRESETS.map((preset) => {
                  const active =
                    preset.cols === gridCols && preset.rows === gridRows;
                  const n = preset.cols * preset.rows;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`photo-report-grid-option ${active ? 'active' : ''}`}
                      onClick={() => {
                        setGridLayout(preset.cols, preset.rows);
                        setGridMenuOpen(false);
                      }}
                    >
                      {preset.label}
                      <span className="muted">每頁 {n} 張</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="photo-report-grid-menu" ref={paperMenuRef}>
            <button
              type="button"
              className={`btn ${paperMenuOpen ? 'active' : ''}`}
              onClick={() => {
                setPaperMenuOpen((o) => !o);
                setGridMenuOpen(false);
              }}
              title="紙張大小與直向／橫向（會重新排列）"
              aria-expanded={paperMenuOpen}
              aria-haspopup="menu"
            >
              {pageSize}·{pageOrientation === 'portrait' ? '直' : '橫'}
            </button>
            {paperMenuOpen && (
              <div className="photo-report-grid-dropdown" role="menu">
                {(['A4', 'A3'] as ReportPageSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={pageSize === size}
                    className={`photo-report-grid-option ${pageSize === size ? 'active' : ''}`}
                    onClick={() => setPageSize(size)}
                  >
                    {size}
                    <span className="muted">
                      {size === 'A4' ? '210×297mm' : '297×420mm'}
                    </span>
                  </button>
                ))}
                <div className="photo-report-menu-sep" />
                {(
                  [
                    ['portrait', '直向'],
                    ['landscape', '橫向'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={pageOrientation === value}
                    className={`photo-report-grid-option ${pageOrientation === value ? 'active' : ''}`}
                    onClick={() =>
                      setPageOrientation(value as ReportPageOrientation)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!hasSelectedPhoto}
            onClick={() => rotateSelectedPhotos(-90)}
            title="逆時針旋轉 90°（多選可同時旋轉）"
          >
            ↺
          </button>
          <button
            type="button"
            className="btn"
            disabled={!hasSelectedPhoto}
            onClick={() => rotateSelectedPhotos(90)}
            title="順時針旋轉 90°（多選可同時旋轉）"
          >
            ↻ 旋轉
          </button>
          <button
            type="button"
            className="btn"
            disabled={projectBusy || busy || !items.length}
            onClick={() => void onSaveProject()}
            title={`儲存為可繼續編輯的專案檔（${PHOTO_REPORT_EXT}）`}
          >
            {projectBusy ? '處理中…' : '儲存'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={projectBusy || busy}
            onClick={() => void onLoadProject()}
            title={`載入專案檔（${PHOTO_REPORT_EXT}）繼續編輯`}
          >
            載入
          </button>
          <button
            type="button"
            className="btn"
            disabled={!items.length}
            onClick={() => {
              if (window.confirm('清除報告上所有相片與文字？')) clearReport();
            }}
          >
            清空
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={genBusy || busy || projectBusy}
            onClick={() => void onGenerate()}
          >
            {genBusy ? '產生中…' : '產生 PDF'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = '';
              if (files?.length) requestAddPhotos(files);
            }}
          />
          <input
            ref={projectInputRef}
            type="file"
            accept={`${PHOTO_REPORT_EXT},.zip,application/zip`}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void loadProjectFromFile(file);
            }}
          />
        </div>
      </header>

      <div className="photo-report-body">
        <aside className="photo-report-side">
          <h2>相片報告</h2>
          <label className="photo-report-header-field">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="輸入報告標題…"
              aria-label="報告標題"
            />
          </label>

          <div className="photo-report-sort-bar" ref={sortMenuRef}>
            <button
              type="button"
              className={`btn photo-report-sort-btn ${sortMenuOpen ? 'active' : ''}`}
              disabled={!items.some((i) => i.type === 'photo')}
              onClick={() => setSortMenuOpen((o) => !o)}
              aria-expanded={sortMenuOpen}
              title="頁面依房型（首4碼）排序；相片在頁內排序"
            >
              排序{manualSort ? ' · 手動' : ''}
            </button>
            {sortMenuOpen && (
              <div className="photo-report-grid-dropdown photo-report-sort-dropdown" role="menu">
                <div className="photo-report-sort-section">頁面排序</div>
                <button
                  type="button"
                  role="menuitem"
                  className="photo-report-grid-option"
                  onClick={() => {
                    setManualSort(false);
                    sortPagesByRoom('asc', { rule: nameRule });
                    setSortMenuOpen(false);
                  }}
                >
                  房型順序
                  <span className="muted">首{nameRule.roomLen}碼 ↑</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="photo-report-grid-option"
                  onClick={() => {
                    setManualSort(false);
                    sortPagesByRoom('desc', { rule: nameRule });
                    setSortMenuOpen(false);
                  }}
                >
                  房型倒序
                  <span className="muted">首{nameRule.roomLen}碼 ↓</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="photo-report-grid-option"
                  onClick={() => {
                    const rooms = listRoomCodes(
                      items.filter((i) => i.type === 'photo'),
                      nameRule,
                    );
                    setCustomRoomOrder(rooms);
                    setSortMenuOpen(false);
                  }}
                >
                  自訂頁序…
                  <span className="muted">自訂房型頁先後</span>
                </button>
                <div className="photo-report-menu-sep" />
                <div className="photo-report-sort-section">相片排序（不改頁）</div>
                <button
                  type="button"
                  role="menuitem"
                  className="photo-report-grid-option"
                  onClick={() => {
                    setManualSort(false);
                    sortPhotosWithinPages('asc', { rule: nameRule });
                    setSortMenuOpen(false);
                  }}
                >
                  序號順序
                  <span className="muted">頁內序號 ↑</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="photo-report-grid-option"
                  onClick={() => {
                    setManualSort(false);
                    sortPhotosWithinPages('desc', { rule: nameRule });
                    setSortMenuOpen(false);
                  }}
                >
                  序號倒序
                  <span className="muted">頁內序號 ↓</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`photo-report-grid-option ${manualSort ? 'active' : ''}`}
                  onClick={() => {
                    setManualSort(true);
                    setSortMenuOpen(false);
                  }}
                >
                  手動調序
                  <span className="muted">同頁 ↑↓</span>
                </button>
              </div>
            )}
          </div>
          {manualSort && (
            <p className="photo-report-sort-hint muted">
              手動模式：用每張旁的 ↑↓ 在同一頁內調整格位
            </p>
          )}

          <div className="photo-report-groups">
            {groups.map((group) => {
              const collapsed = !!collapsedPages[group.pageIndex];
              const isActivePage = group.pageIndex === currentPage;
              const count = group.photos.length + group.texts.length;
              return (
                <div
                  key={group.pageIndex}
                  className={`photo-report-group ${isActivePage ? 'active-page' : ''}`}
                >
                  <div className="photo-report-group-head">
                    <div className="photo-report-group-head-row">
                      <button
                        type="button"
                        className="photo-report-group-toggle"
                        aria-expanded={!collapsed}
                        onClick={() => togglePageCollapsed(group.pageIndex)}
                        title={collapsed ? '展開' : '收合'}
                      >
                        {collapsed ? '▶' : '▼'}
                      </button>
                      <button
                        type="button"
                        className="photo-report-group-title"
                        onClick={() => {
                          setCurrentPage(group.pageIndex);
                          if (collapsed) togglePageCollapsed(group.pageIndex);
                        }}
                      >
                        第 {group.pageIndex + 1} 頁
                        <span className="photo-report-group-count">
                          {group.photos.length}/{perPage} 相
                          {group.texts.length > 0
                            ? ` · ${group.texts.length} 文字`
                            : ''}
                        </span>
                      </button>
                    </div>
                    <input
                      type="text"
                      className="photo-report-page-note-input"
                      value={pageNotes[group.pageIndex] ?? ''}
                      placeholder="該頁標注…"
                      aria-label={`第 ${group.pageIndex + 1} 頁標注`}
                      onFocus={() => setCurrentPage(group.pageIndex)}
                      onChange={(e) =>
                        setPageNote(group.pageIndex, e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {!collapsed && (
                    <ul
                      className={`photo-report-list ${listDropTarget?.pageIndex === group.pageIndex && group.photos.length === 0 ? 'drop-over' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (listDragId) {
                          const empty = findEmptySlotOnPage(
                            items,
                            group.pageIndex,
                            perPage,
                            listDragId,
                          );
                          if (empty != null) {
                            setListDropTarget({
                              pageIndex: group.pageIndex,
                              slot: empty,
                            });
                          }
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id =
                          e.dataTransfer.getData('text/photo-id') || listDragId;
                        if (!id) return;
                        const empty = findEmptySlotOnPage(
                          items,
                          group.pageIndex,
                          perPage,
                          id,
                        );
                        if (empty != null) {
                          movePhotoTo(id, group.pageIndex, empty);
                        }
                        setListDragId(null);
                        setListDropTarget(null);
                      }}
                    >
                      {count === 0 && (
                        <li className="muted photo-report-empty">
                          此頁尚無內容（可拖入相片）
                        </li>
                      )}
                      {group.photos.map((photo) => (
                        <li
                          key={photo.id}
                          className={`photo-report-list-row ${listDragId === photo.id ? 'dragging' : ''} ${
                            listDropTarget?.pageIndex === group.pageIndex &&
                            listDropTarget.slot === photo.slot
                              ? 'drop-before'
                              : ''
                          }`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/photo-id', photo.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setListDragId(photo.id);
                            setSelectedId(photo.id);
                          }}
                          onDragEnd={() => {
                            setListDragId(null);
                            setListDropTarget(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setListDropTarget({
                              pageIndex: group.pageIndex,
                              slot: photo.slot,
                            });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const id =
                              e.dataTransfer.getData('text/photo-id') ||
                              listDragId;
                            if (!id || id === photo.id) {
                              setListDragId(null);
                              setListDropTarget(null);
                              return;
                            }
                            movePhotoTo(id, group.pageIndex, photo.slot);
                            setListDragId(null);
                            setListDropTarget(null);
                          }}
                        >
                          <button
                            type="button"
                            className={`photo-report-list-item ${selectedSet.has(photo.id) ? 'active' : ''}`}
                            onClick={(e) => onSelectClick(e, photo.id)}
                            title={`${photo.caption || photo.name}（Ctrl 多選 · Delete 刪除 · 工具列旋轉）`}
                          >
                            📷 格{photo.slot + 1} · {photo.name}
                            {photo.caption ? ' · 有描述' : ''}
                          </button>
                          <button
                            type="button"
                            className="photo-report-list-desc"
                            title="相片描述"
                            onClick={() => openCaptionEditor(photo)}
                          >
                            述
                          </button>
                          {manualSort && (
                            <span className="photo-report-list-nudge">
                              <button
                                type="button"
                                title="上移"
                                onClick={() => nudgePhotoOnPage(photo.id, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                title="下移"
                                onClick={() => nudgePhotoOnPage(photo.id, 1)}
                              >
                                ↓
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                      {group.texts.map((text) => (
                        <li key={text.id}>
                          <button
                            type="button"
                            className={`photo-report-list-item ${selectedSet.has(text.id) ? 'active' : ''}`}
                            onClick={(e) => onSelectClick(e, text.id)}
                          >
                            文字：{text.text.slice(0, 16) || '（空白）'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <div
          className="photo-report-stage-wrap"
          onClick={() => clearSelection()}
        >
          <div className="photo-report-page-nav">
            <div className="photo-report-view-modes" role="group" aria-label="顯示模式">
              {(
                [
                  ['one', '單頁'],
                  ['two', '雙頁'],
                  ['all', '全部'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`btn ${stageView === mode ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setStageView(mode);
                  }}
                  title={
                    mode === 'one'
                      ? '一次顯示一頁'
                      : mode === 'two'
                        ? '並排顯示兩頁'
                        : '捲動瀏覽所有頁'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {stageView !== 'all' && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={currentPage <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage(currentPage - 1);
                  }}
                >
                  上一頁
                </button>
                <span>
                  第 {currentPage + 1} / {pageCount} 頁
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={currentPage >= pageCount - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage(currentPage + 1);
                  }}
                >
                  下一頁
                </button>
              </>
            )}
            {stageView === 'all' && <span>共 {pageCount} 頁</span>}
          </div>

          <div
            className={`photo-report-stage-pages mode-${stageView}`}
            onClick={(e) => e.stopPropagation()}
          >
            {visiblePages.map((p) => renderReportPage(p, stageScale))}
          </div>
        </div>
      </div>

      {customRoomOrder && (
        <div
          className="photo-report-caption-backdrop"
          role="presentation"
          onClick={() => setCustomRoomOrder(null)}
        >
          <div
            className="photo-report-caption-dialog photo-report-insert-dialog"
            role="dialog"
            aria-labelledby="custom-room-order-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="custom-room-order-title">自訂頁面房型順序</h3>
            <p className="muted">
              依首{nameRule.roomLen}碼調整頁面先後；不會把相片搬去其他頁
            </p>
            <ul className="photo-report-custom-rooms">
              {customRoomOrder.map((room, index) => (
                <li key={room}>
                  <span>
                    {index + 1}. 房型 {room}
                  </span>
                  <span className="photo-report-list-nudge">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => {
                        if (index === 0) return;
                        setCustomRoomOrder((list) => {
                          if (!list) return list;
                          const next = [...list];
                          const t = next[index - 1];
                          next[index - 1] = next[index];
                          next[index] = t;
                          return next;
                        });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index >= customRoomOrder.length - 1}
                      onClick={() => {
                        if (index >= customRoomOrder.length - 1) return;
                        setCustomRoomOrder((list) => {
                          if (!list) return list;
                          const next = [...list];
                          const t = next[index + 1];
                          next[index + 1] = next[index];
                          next[index] = t;
                          return next;
                        });
                      }}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {!customRoomOrder.length && (
              <p className="muted">目前沒有可辨識的房型檔名（需符合命名規則）</p>
            )}
            <div className="photo-report-caption-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setCustomRoomOrder(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!customRoomOrder.length}
                onClick={() => {
                  setManualSort(false);
                  sortPagesByRoom('custom', {
                    rule: nameRule,
                    roomOrder: customRoomOrder,
                  });
                  setCustomRoomOrder(null);
                }}
              >
                套用頁序
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPhotos && (
        <div
          className="photo-report-caption-backdrop"
          role="presentation"
          onClick={() => setPendingPhotos(null)}
        >
          <div
            className="photo-report-caption-dialog photo-report-insert-dialog"
            role="dialog"
            aria-labelledby="photo-place-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="photo-place-title">加入相片</h3>
            <p className="muted">已選 {pendingPhotos.length} 張，請選擇插入方式</p>

            <div className="photo-report-insert-modes" role="radiogroup">
              {(
                [
                  ['byName', '依檔名房型分頁', 'xxxx-xx：同房型同頁排序，換房型開新頁'],
                  ['continue', '緊接放入', '由最前空格填入，滿了才開新頁'],
                  ['newPage', '新開一頁', '從新頁第一格開始，不填補前面空格'],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={`photo-report-insert-mode ${insertMode === value ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="photo-insert-mode"
                    checked={insertMode === value}
                    onChange={() => setInsertMode(value)}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small className="muted">{hint}</small>
                  </span>
                </label>
              ))}
            </div>

            {insertMode === 'byName' && (
              <div className="photo-report-name-rule">
                <div className="photo-report-name-rule-head">
                  <span>
                    命名規則：
                    <code>
                      {'0'.repeat(Math.max(1, nameRule.roomLen))}
                      {nameRule.separator}
                      {'0'.repeat(Math.max(1, nameRule.seqLen))}
                    </code>
                    （房型{nameRule.roomLen}碼 + 序號{nameRule.seqLen}碼）
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowCustomRule((v) => !v)}
                  >
                    {showCustomRule ? '收合自訂' : '自訂規則'}
                  </button>
                </div>
                {showCustomRule && (
                  <div className="photo-report-name-rule-fields">
                    <label>
                      房型位數
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={nameRule.roomLen}
                        onChange={(e) =>
                          setNameRule((r) => ({
                            ...r,
                            roomLen: Number(e.target.value) || 4,
                          }))
                        }
                      />
                    </label>
                    <label>
                      分隔符
                      <input
                        type="text"
                        maxLength={3}
                        value={nameRule.separator}
                        onChange={(e) =>
                          setNameRule((r) => ({
                            ...r,
                            separator: e.target.value || '-',
                          }))
                        }
                      />
                    </label>
                    <label>
                      序號位數
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={nameRule.seqLen}
                        onChange={(e) =>
                          setNameRule((r) => ({
                            ...r,
                            seqLen: Number(e.target.value) || 2,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setNameRule(DEFAULT_FILENAME_PAGE_RULE)}
                    >
                      重設 4-2
                    </button>
                  </div>
                )}
                <ul className="photo-report-name-preview">
                  {namePreview.map((g) => (
                    <li key={g.room}>
                      <strong>{g.room}</strong>
                      <span className="muted">
                        {g.count} 張
                        {g.unmatched ? ' · 無法解析' : ''}
                        {g.sample ? ` · 例 ${g.sample}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="photo-report-caption-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setPendingPhotos(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => confirmAddPhotos()}
              >
                確定加入
              </button>
            </div>
          </div>
        </div>
      )}

      {captionEdit && (
        <div
          className="photo-report-caption-backdrop"
          role="presentation"
          onClick={() => setCaptionEdit(null)}
        >
          <div
            className="photo-report-caption-dialog"
            role="dialog"
            aria-labelledby="photo-caption-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="photo-caption-title">相片描述</h3>
            <p className="muted">{captionEdit.name}</p>
            <textarea
              autoFocus
              value={captionEdit.draft}
              placeholder="輸入此相片的描述…"
              rows={4}
              onChange={(e) =>
                setCaptionEdit({ ...captionEdit, draft: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCaptionEdit(null);
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveCaptionEditor();
                }
              }}
            />
            <div className="photo-report-caption-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setCaptionEdit(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => saveCaptionEditor()}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="toast error" role="alert">
          {error}
          <button
            type="button"
            className="toast-close"
            onClick={() => setError(null)}
          >
            關閉
          </button>
        </div>
      )}
    </div>
  );
}
