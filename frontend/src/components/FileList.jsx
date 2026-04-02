import { useState, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, Grid3x3, List, RefreshCw, ArrowLeft } from 'lucide-react';
import { FileIcon, formatSize, formatDate } from '../utils/fileIcons';
import ContextMenu from './ContextMenu';
import { downloadUrl } from '../api/files';

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true, className: 'flex-1 min-w-0' },
  { key: 'size', label: 'Size', sortable: true, className: 'w-20 text-right hidden sm:block' },
  { key: 'permissions', label: 'Perms', sortable: false, className: 'w-28 hidden md:block' },
  { key: 'modified', label: 'Modified', sortable: true, className: 'w-28 text-right hidden lg:block' },
];

export default function FileList({
  files,
  currentPath,
  parentPath,
  loading,
  selected,
  onSelect,
  onNavigate,
  onAction,
  onRefresh,
  clipboard,
  onPaste,
}) {
  const [sortKey, setSortKey] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // list | grid
  const [ctxMenu, setCtxMenu] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const touchMoved = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortedFiles = [...(files || [])].sort((a, b) => {
    // Directories always first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'size') { va = a.size || 0; vb = b.size || 0; }
    if (sortKey === 'modified') { va = new Date(a.modified); vb = new Date(b.modified); }
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortAsc ? va - vb : vb - va;
  });

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) onAction('upload-drop', null, droppedFiles);
  }, [onAction]);

  const isTouchDevice = () => window.matchMedia('(hover: none)').matches;

  const handleClick = (file, e) => {
    // En touch: si ya hay selección activa, tap togglea el item
    if (isTouchDevice() && selected.length > 0) {
      onSelect(prev => {
        const set = new Set(prev);
        if (set.has(file.path)) set.delete(file.path);
        else set.add(file.path);
        return [...set];
      });
      return;
    }
    // En touch sin selección activa: tap directo abre/navega (manejado en handleTouchEnd)
    if (isTouchDevice()) return;
    // Desktop: ctrl/meta para multi-select
    if (e.ctrlKey || e.metaKey) {
      onSelect(prev => {
        const set = new Set(prev);
        if (set.has(file.path)) set.delete(file.path);
        else set.add(file.path);
        return [...set];
      });
    } else if (e.shiftKey && selected.length > 0) {
      const idx = sortedFiles.findIndex(f => f.path === file.path);
      const lastIdx = sortedFiles.findIndex(f => f.path === selected[selected.length - 1]);
      const [min, max] = [Math.min(idx, lastIdx), Math.max(idx, lastIdx)];
      onSelect(sortedFiles.slice(min, max + 1).map(f => f.path));
    } else {
      onSelect([file.path]);
    }
  };

  const handleDoubleClick = (file) => {
    if (isTouchDevice()) return; // touch usa tap directo
    if (file.isDirectory) onNavigate(file.path);
    else onAction('view', file);
  };

  const handleTouchStart = (file, e) => {
    longPressTriggered.current = false;
    touchMoved.current = false;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // vibrar si está disponible
      if (navigator.vibrate) navigator.vibrate(50);
      // activar selección
      onSelect(prev => {
        const set = new Set(prev);
        set.add(file.path);
        return [...set];
      });
    }, 500);
  };

  const handleTouchEnd = (file, e) => {
    clearTimeout(longPressTimer.current);
    if (touchMoved.current) return;
    if (longPressTriggered.current) {
      e.preventDefault(); // evitar click after longpress
      return;
    }
    // Tap normal: si hay selección activa, manejado en handleClick
    if (selected.length > 0) return;
    // Tap normal sin selección: abrir/navegar
    if (file.isDirectory) onNavigate(file.path);
    else onAction('view', file);
  };

  const handleTouchMove = (e) => {
    clearTimeout(longPressTimer.current);
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.sqrt(dx * dx + dy * dy) > 10) touchMoved.current = true;
  };

  if (loading) {
    return (
      <div className="flex-1 p-4 space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton h-8 w-full" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden relative ${dragOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      ref={containerRef}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Column headers - list mode */}
      {viewMode === 'list' && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 text-xs text-slate-500 select-none">
          <div className="w-6 shrink-0" />
          {COLUMNS.map(col => (
            <button
              key={col.key}
              className={`flex items-center gap-1 ${col.className} ${col.sortable ? 'hover:text-slate-300 cursor-pointer' : ''}`}
              onClick={() => col.sortable && handleSort(col.key)}
            >
              {col.label}
              {col.sortable && sortKey === col.key && (
                sortAsc ? <ArrowUp size={10} /> : <ArrowDown size={10} />
              )}
            </button>
          ))}
          <div className="w-16 shrink-0" />
        </div>
      )}

      {/* Files */}
      <div className="flex-1 overflow-y-auto p-2" style={{ touchAction: "pan-y" }}>
        {/* Up directory */}
        {parentPath && (
          <div
            className="file-row text-slate-400"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; touchMoved.current = false; longPressTriggered.current = false; }}
            onTouchMove={(e) => handleTouchMove(e)}
            onTouchEnd={(e) => { clearTimeout(longPressTimer.current); if (touchMoved.current || longPressTriggered.current) return; onNavigate(parentPath); }}
            onDoubleClick={() => onNavigate(parentPath)}
            onClick={() => { if (!isTouchDevice()) onNavigate(parentPath); }}
          >
            <ArrowLeft size={16} className="text-slate-500 shrink-0" />
            <span className="text-sm">..</span>
          </div>
        )}

        {files.length === 0 && !parentPath ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
            <Grid3x3 size={32} className="opacity-30" />
            <span className="text-sm">Empty directory</span>
          </div>
        ) : viewMode === 'list' ? (
          sortedFiles.map(file => (
            <div
              key={file.path}
              className={`file-row group ${selected.includes(file.path) ? 'selected' : ''}`}
              onClick={(e) => handleClick(file, e)}
              onDoubleClick={() => handleDoubleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
              onTouchStart={(e) => handleTouchStart(file, e)}
              onTouchEnd={(e) => handleTouchEnd(file, e)}
              onTouchMove={(e) => handleTouchMove(e)}
            >
              <FileIcon file={file} open={false} size={16} />
              <span className="flex-1 truncate text-sm text-slate-200 min-w-0">
                {file.name}
                {file.isSymlink && <span className="text-xs text-cyan-400 ml-1">→</span>}
              </span>
              <span className="w-20 text-right text-xs text-slate-500 hidden sm:block">
                {file.isDirectory ? '—' : formatSize(file.size)}
              </span>
              <span className="w-28 text-xs text-slate-500 font-mono hidden md:block">
                {file.permissions}
              </span>
              <span className="w-28 text-right text-xs text-slate-500 hidden lg:block">
                {formatDate(file.modified)}
              </span>
              {/* Quick actions */}
              <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {!file.isDirectory && (
                  <a
                    href={downloadUrl(file.path)}
                    download={file.name}
                    onClick={e => e.stopPropagation()}
                    className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors"
                    title="Download"
                  >
                    ↓
                  </a>
                )}
                <button
                  onClick={e => { e.stopPropagation(); onAction('delete', file); }}
                  className="p-1 hover:bg-red-900/50 rounded text-slate-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        ) : (
          // Grid mode
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-2">
            {sortedFiles.map(file => (
              <div
                key={file.path}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg cursor-pointer transition-colors
                  hover:bg-slate-700/50
                  ${selected.includes(file.path) ? 'bg-blue-600/20 border border-blue-500/40' : ''}`}
                onClick={(e) => handleClick(file, e)}
                onDoubleClick={() => handleDoubleClick(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                onTouchStart={(e) => handleTouchStart(file, e)}
                onTouchEnd={(e) => handleTouchEnd(file, e)}
                onTouchMove={handleTouchMove}
              >
                <FileIcon file={file} open={false} size={32} />
                <span className="text-xs text-slate-300 text-center truncate w-full">{file.name}</span>
                {!file.isDirectory && (
                  <span className="text-xs text-slate-600">{formatSize(file.size)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
        <button
          onClick={() => setViewMode('list')}
          className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          title="List view"
        >
          <List size={14} />
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          title="Grid view"
        >
          <Grid3x3 size={14} />
        </button>
      </div>

      {dragOver && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-blue-500 border-dashed rounded flex items-center justify-center pointer-events-none">
          <div className="text-blue-400 text-lg font-medium">Drop files to upload</div>
        </div>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          file={ctxMenu.file}
          onClose={() => setCtxMenu(null)}
          onAction={(action, file) => {
            setCtxMenu(null);
            onAction(action, file);
          }}
        />
      )}
    </div>
  );
}
