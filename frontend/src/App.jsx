import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import FileList from './components/FileList';
import FileViewer from './components/FileViewer';
import StatusBar from './components/StatusBar';
import SearchResults from './components/SearchResults';
import MetricsBar from './components/MetricsBar';
import ProcessList from './components/ProcessList';
import {
  ConfirmModal,
  NewItemModal,
  RenameModal,
  UploadProgress,
} from './components/Modal';
import {
  listFiles,
  createFile,
  deleteFile,
  renameFile,
  copyFile,
  uploadFiles,
  searchFiles,
  downloadUrl,
} from './api/files';
import { Menu } from 'lucide-react';
import './App.css';

const Panel = forwardRef(({ initialPath, onPathChange }, ref) => {
  const [files, setFiles] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [modal, setModal] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [history, setHistory] = useState([initialPath]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);
  const [dualPanel, setDualPanel] = useState(false);
  const [showProcesses, setShowProcesses] = useState(false);

  const currentPath = history[historyIdx] || initialPath;

  useEffect(() => { onPathChange?.(currentPath); }, [currentPath]);

  const navigate = useCallback((path) => {
    setHistory(prev => {
      const newHist = prev.slice(0, historyIdx + 1);
      return [...newHist, path];
    });
    setHistoryIdx(prev => prev + 1);
    setSelected([]);
    setSearchQuery('');
    setSearchResults(null);
  }, [historyIdx]);

  useImperativeHandle(ref, () => ({
    navigate,
  }));

  const historyNav = useCallback((dir) => {
    const newIdx = historyIdx + dir;
    if (newIdx >= 0 && newIdx < history.length) {
      setHistoryIdx(newIdx);
      setSelected([]);
    }
  }, [historyIdx, history]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFiles(currentPath);
      setFiles(data.files || []);
      setParentPath(data.parent);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => { refresh(); }, [currentPath]);

  const handleSearch = async (q) => {
    if (!q) { setSearchQuery(''); setSearchResults(null); return; }
    setSearchQuery(q);
    setSearchLoading(true);
    try {
      const data = await searchFiles(currentPath, q);
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAction = async (action, file, extra) => {
    switch (action) {
      case 'view':
      case 'edit':
        setViewer(file);
        break;
      case 'open':
        if (file.isDirectory) navigate(file.path);
        else setViewer(file);
        break;
      case 'rename':
        setModal({ type: 'rename', data: file });
        break;
      case 'delete':
        setModal({ type: 'delete', data: file });
        break;
      case 'dir-size':
        try {
          const res = await fetch(`/api/dirsize?path=${encodeURIComponent(file.path)}`);
          if (!res.ok) throw new Error('No se pudo calcular el tamaño');
          const data = await res.json();
          setModal({ type: 'dir-size', data: { path: data.path, size: data.size } });
        } catch (err) {
          setError(err.message);
        }
        break;
      case 'download':
        window.open(downloadUrl(file.path), '_blank');
        break;
      case 'copy':
        setClipboard({ paths: selected.length > 0 ? selected : [file.path], mode: 'copy' });
        break;
      case 'cut':
        setClipboard({ paths: selected.length > 0 ? selected : [file.path], mode: 'cut' });
        break;
      case 'upload-drop':
        handleUpload(extra);
        break;
    }
  };

  const handleUpload = async (fileList) => {
    setUploadProgress({ files: fileList, progress: 0 });
    try {
      await uploadFiles(currentPath, fileList, (evt) => {
        if (evt.lengthComputable) {
          setUploadProgress(prev => ({
            ...prev,
            progress: Math.round((evt.loaded / evt.total) * 100),
          }));
        }
      });
      setTimeout(() => { setUploadProgress(null); refresh(); }, 800);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setUploadProgress(null);
    }
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    for (const srcPath of clipboard.paths) {
      const name = srcPath.split('/').pop();
      const destPath = `${currentPath.replace(/\/$/, '')}/${name}`;
      try {
        if (clipboard.mode === 'cut') await renameFile(srcPath, destPath);
        else await copyFile(srcPath, destPath);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      }
    }
    if (clipboard.mode === 'cut') setClipboard(null);
    refresh();
  };

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let val = bytes;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(1)} ${units[idx]}`;
  };

  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    setModal({ type: 'delete-many', data: selected });
  };

  const confirmModal = async () => {
    const { type, data } = modal;
    setModal(null);
    if (type === 'delete') {
      try { await deleteFile(data.path); refresh(); }
      catch (err) { setError(err.response?.data?.error || err.message); }
    } else if (type === 'delete-many') {
      for (const p of data) try { await deleteFile(p); } catch {}
      setSelected([]);
      refresh();
    }
  };

  const handleRenameConfirm = async (newName) => {
    const file = modal.data;
    const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
    const newPath = `${dir}/${newName}`;
    setModal(null);
    try { await renameFile(file.path, newPath); refresh(); }
    catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const handleNewItemConfirm = async (name) => {
    const isDir = modal.type === 'new-folder';
    setModal(null);
    const newPath = `${currentPath.replace(/\/$/, '')}/${name}`;
    try { await createFile(newPath, '', isDir); refresh(); }
    catch (err) { setError(err.response?.data?.error || err.message); }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <MetricsBar onRamClick={() => setShowProcesses(p => !p)} />
      <ProcessList visible={showProcesses} />
      <Toolbar
        currentPath={currentPath}
        onNavigate={navigate}
        onRefresh={refresh}
        onNewFile={() => setModal({ type: 'new-file' })}
        onNewFolder={() => setModal({ type: 'new-folder' })}
        onUpload={handleUpload}
        onSearch={handleSearch}
        selected={selected}
        onDelete={handleDeleteSelected}
        clipboard={clipboard}
        onCopy={() => selected.length > 0 && setClipboard({ paths: selected, mode: 'copy' })}
        onCut={() => selected.length > 0 && setClipboard({ paths: selected, mode: 'cut' })}
        onPaste={handlePaste}
        dualPanel={dualPanel}
        onToggleDualPanel={() => setDualPanel(p => !p)}
        history={history}
        historyIdx={historyIdx}
        onHistoryNav={historyNav}
      />

      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-xs flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-100 text-lg leading-none">×</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main panel */}
        <div className={`${dualPanel ? 'w-1/2' : 'flex-1'} flex flex-col overflow-hidden`}>
          {searchQuery ? (
            <SearchResults
              query={searchQuery}
              results={searchResults}
              loading={searchLoading}
              onNavigate={navigate}
              onOpen={(f) => setViewer(f)}
              onClose={() => { setSearchQuery(''); setSearchResults(null); }}
            />
          ) : (
            <FileList
              files={files}
              currentPath={currentPath}
              parentPath={parentPath}
              loading={loading}
              selected={selected}
              onSelect={setSelected}
              onNavigate={navigate}
              onAction={handleAction}
              onRefresh={refresh}
              clipboard={clipboard}
              onPaste={handlePaste}
            />
          )}
          <StatusBar files={files} selected={selected} currentPath={currentPath} />
        </div>

        {/* Dual panel */}
        {dualPanel && (
          <>
            <div className="w-px bg-slate-700 shrink-0" />
            <div className="w-1/2 flex flex-col overflow-hidden">
              <Panel initialPath={currentPath} />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {viewer && (
        <FileViewer file={viewer} onClose={() => setViewer(null)} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmModal
          title="Delete"
          message={`Delete "${modal.data.name}"? This cannot be undone.`}
          onConfirm={confirmModal}
          onCancel={() => setModal(null)}
          danger
        />
      )}
      {modal?.type === 'delete-many' && (
        <ConfirmModal
          title="Delete"
          message={`Delete ${modal.data.length} selected items? This cannot be undone.`}
          onConfirm={confirmModal}
          onCancel={() => setModal(null)}
          danger
        />
      )}
      {modal?.type === 'dir-size' && (
        <ConfirmModal
          title="Tamaño de carpeta"
          message={`"${modal.data.path}" ocupa ${formatBytes(modal.data.size)}`}
          onConfirm={() => setModal(null)}
          onCancel={() => setModal(null)}
        />
      )}
      {(modal?.type === 'new-file' || modal?.type === 'new-folder') && (
        <NewItemModal
          type={modal.type === 'new-folder' ? 'folder' : 'file'}
          currentPath={currentPath}
          onConfirm={handleNewItemConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename' && (
        <RenameModal
          file={modal.data}
          onConfirm={handleRenameConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {uploadProgress && (
        <UploadProgress
          files={uploadProgress.files}
          progress={uploadProgress.progress}
          onClose={() => setUploadProgress(null)}
        />
      )}
    </div>
  );
});

export default function App() {
  const [sidebarPath, setSidebarPath] = useState('/');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const panelRef = useRef(null);

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper */}
      <div className={`fixed inset-y-0 left-0 z-30 md:relative md:flex md:translate-x-0 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          currentPath={sidebarPath}
          onNavigate={(path) => {
            setSidebarPath(path);
            panelRef.current?.navigate(path);
            setSidebarOpen(false);
          }}
          onToggle={() => setSidebarOpen(p => !p)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile hamburger button */}
        <div className="md:hidden flex items-center px-3 py-2 border-b border-slate-700 bg-slate-800/60">
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Menu size={18} />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <Panel ref={panelRef} initialPath="/" onPathChange={setSidebarPath} />
        </div>
      </div>
    </div>
  );
}
