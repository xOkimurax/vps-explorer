import { X, ArrowRight, Folder, File } from 'lucide-react';
import { FileIcon, formatSize } from '../utils/fileIcons';

export default function SearchResults({ query, results, loading, onNavigate, onOpen, onClose }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <div>
          <span className="text-sm font-medium text-slate-200">
            Search results for <span className="text-blue-400">"{query}"</span>
          </span>
          {!loading && (
            <span className="text-xs text-slate-500 ml-2">({results?.length || 0} found)</span>
          )}
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <X size={14} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && (!results || results.length === 0) && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
            <File size={32} className="opacity-30" />
            <span className="text-sm">No results found</span>
          </div>
        )}
        {!loading && results && results.map((file) => (
          <div
            key={file.path}
            className="file-row group"
            onDoubleClick={() => file.isDirectory ? onNavigate(file.path) : onOpen(file)}
          >
            <FileIcon file={file} size={16} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{file.name}</div>
              <div className="text-xs text-slate-500 truncate">{file.path}</div>
            </div>
            {!file.isDirectory && (
              <span className="text-xs text-slate-500">{formatSize(file.size)}</span>
            )}
            <button
              onClick={() => onNavigate(file.isDirectory ? file.path : file.path.substring(0, file.path.lastIndexOf('/')) || '/')}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-all"
              title="Go to directory"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
        {results?.truncated && (
          <div className="text-center text-xs text-slate-500 py-2">
            Showing first 200 results. Refine your search.
          </div>
        )}
      </div>
    </div>
  );
}
