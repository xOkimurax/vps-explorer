import { useEffect, useRef } from 'react';
import {
  Pencil, Trash2, Download, Copy, Scissors, Eye, FolderOpen,
  FileText, RefreshCw
} from 'lucide-react';

export default function ContextMenu({ x, y, file, onClose, onAction }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to stay in viewport
  const style = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 300),
  };

  const items = [
    ...(file.isDirectory
      ? [{ icon: FolderOpen, label: 'Open', action: 'open', color: 'text-blue-400' }]
      : [{ icon: Eye, label: 'View', action: 'view', color: 'text-blue-400' }]),
    ...(file.isDirectory ? [] : [
      { icon: FileText, label: 'Edit', action: 'edit', color: 'text-slate-300' },
    ]),
    'sep',
    { icon: Pencil, label: 'Rename', action: 'rename', color: 'text-yellow-400' },
    { icon: Copy, label: 'Copy', action: 'copy', color: 'text-slate-300' },
    { icon: Scissors, label: 'Cut', action: 'cut', color: 'text-slate-300' },
    'sep',
    { icon: Download, label: 'Download', action: 'download', color: 'text-green-400' },
    'sep',
    { icon: Trash2, label: 'Delete', action: 'delete', color: 'text-red-400' },
  ];

  return (
    <div className="context-menu" style={style} ref={ref}>
      <div className="px-3 py-1.5 border-b border-slate-700 text-xs text-slate-400 truncate max-w-[200px]">
        {file.name}
      </div>
      {items.map((item, i) =>
        item === 'sep' ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={item.action}
            className={`context-menu-item w-full ${item.color}`}
            onClick={() => { onAction(item.action, file); onClose(); }}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
