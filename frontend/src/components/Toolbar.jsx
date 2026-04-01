import { useState, useRef } from 'react';
import {
  RefreshCw, FolderPlus, FilePlus, Upload, Search, X,
  Clipboard, Scissors, Copy, Trash2, ChevronLeft, ChevronRight,
  LayoutPanelLeft
} from 'lucide-react';
import Breadcrumb from './Breadcrumb';

export default function Toolbar({
  currentPath,
  onNavigate,
  onRefresh,
  onNewFile,
  onNewFolder,
  onUpload,
  onSearch,
  selected,
  onDelete,
  clipboard,
  onCopy,
  onCut,
  onPaste,
  dualPanel,
  onToggleDualPanel,
  history,
  historyIdx,
  onHistoryNav,
}) {
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const fileInputRef = useRef(null);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onUpload(files);
    e.target.value = '';
  };

  return (
    <div className="bg-slate-800/80 border-b border-slate-700 px-3 py-2 space-y-2">
      {/* Top row: navigation + actions */}
      <div className="flex items-center gap-2">
        {/* History nav */}
        <button
          onClick={() => onHistoryNav(-1)}
          disabled={historyIdx <= 0}
          className="btn-ghost p-1.5 disabled:opacity-30"
          title="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => onHistoryNav(1)}
          disabled={historyIdx >= history.length - 1}
          className="btn-ghost p-1.5 disabled:opacity-30"
          title="Forward"
        >
          <ChevronRight size={16} />
        </button>

        {/* Breadcrumb */}
        <div className="flex-1 min-w-0">
          <Breadcrumb path={currentPath} onNavigate={onNavigate} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRefresh} className="btn-ghost p-1.5" title="Refresh (F5)">
            <RefreshCw size={15} />
          </button>
          <button onClick={onNewFolder} className="btn-ghost p-1.5" title="New Folder">
            <FolderPlus size={15} />
          </button>
          <button onClick={onNewFile} className="btn-ghost p-1.5" title="New File">
            <FilePlus size={15} />
          </button>
          <button onClick={handleUploadClick} className="btn-ghost p-1.5" title="Upload Files">
            <Upload size={15} />
          </button>
          <button
            onClick={() => setSearchMode(!searchMode)}
            className={`btn-ghost p-1.5 ${searchMode ? 'bg-slate-700 text-blue-400' : ''}`}
            title="Search (Ctrl+F)"
          >
            <Search size={15} />
          </button>
          <button
            onClick={onToggleDualPanel}
            className={`btn-ghost p-1.5 ${dualPanel ? 'bg-slate-700 text-blue-400' : ''}`}
            title="Dual panel"
          >
            <LayoutPanelLeft size={15} />
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Search row */}
      {searchMode && (
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              className="input pl-8 pr-8"
              placeholder={`Search in ${currentPath}...`}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); onSearch(''); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary text-xs px-3 py-1.5">Search</button>
          <button type="button" onClick={() => { setSearchMode(false); setQuery(''); onSearch(''); }} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
        </form>
      )}

      {/* Selection actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 py-1 px-2 bg-blue-900/20 rounded-md border border-blue-700/30">
          <span className="text-xs text-blue-300 font-medium">{selected.length} selected</span>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={onCopy} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
              <Copy size={12} /> Copy
            </button>
            <button onClick={onCut} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
              <Scissors size={12} /> Cut
            </button>
            <button onClick={onDelete} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 text-red-400 hover:text-red-300">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Clipboard paste */}
      {clipboard && clipboard.paths.length > 0 && (
        <div className="flex items-center gap-2 py-1 px-2 bg-yellow-900/20 rounded-md border border-yellow-700/30">
          <Clipboard size={12} className="text-yellow-400" />
          <span className="text-xs text-yellow-300">
            {clipboard.mode === 'cut' ? 'Cut' : 'Copied'}: {clipboard.paths.length} item(s)
          </span>
          <button onClick={onPaste} className="btn-ghost text-xs py-1 px-2 ml-auto">
            Paste here
          </button>
        </div>
      )}
    </div>
  );
}
