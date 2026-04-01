import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, children, onClose, size = 'md' }) {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  useEffect(() => {
    const handleKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={`bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full ${sizeClasses[size]}`}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, onConfirm, onCancel, danger = false }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <div className="p-4 space-y-4">
        <p className="text-sm text-slate-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger text-sm' : 'btn-primary text-sm'}>
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function NewItemModal({ type, currentPath, onConfirm, onCancel }) {
  const inputRef = useRef(null);
  const isDir = type === 'folder';

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = inputRef.current?.value?.trim();
    if (name) onConfirm(name);
  };

  return (
    <Modal title={`New ${isDir ? 'Folder' : 'File'}`} onClose={onCancel} size="sm">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Name</label>
          <input ref={inputRef} className="input" placeholder={isDir ? 'folder-name' : 'filename.txt'} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" className="btn-primary text-sm">Create</button>
        </div>
      </form>
    </Modal>
  );
}

export function RenameModal({ file, onConfirm, onCancel }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = file.name;
      // Select name without extension for files
      const dotIdx = file.name.lastIndexOf('.');
      if (!file.isDirectory && dotIdx > 0) {
        inputRef.current.setSelectionRange(0, dotIdx);
      } else {
        inputRef.current.select();
      }
    }
  }, [file]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = inputRef.current?.value?.trim();
    if (name && name !== file.name) onConfirm(name);
    else onCancel();
  };

  return (
    <Modal title="Rename" onClose={onCancel} size="sm">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">New name</label>
          <input ref={inputRef} className="input" autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" className="btn-primary text-sm">Rename</button>
        </div>
      </form>
    </Modal>
  );
}

export function UploadProgress({ files, progress, onClose }) {
  return (
    <Modal title="Uploading Files" size="sm">
      <div className="p-4 space-y-3">
        {files.map((f, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="truncate">{f.name}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ))}
        {progress >= 100 && (
          <button onClick={onClose} className="btn-primary w-full text-sm mt-2">Done</button>
        )}
      </div>
    </Modal>
  );
}
