import { formatSize } from '../utils/fileIcons';

export default function StatusBar({ files, selected, currentPath }) {
  const total = files?.length || 0;
  const dirs = files?.filter(f => f.isDirectory).length || 0;
  const fileCount = total - dirs;
  const totalSize = files?.filter(f => !f.isDirectory).reduce((acc, f) => acc + (f.size || 0), 0) || 0;

  return (
    <div className="bg-slate-800/60 border-t border-slate-700 px-4 py-1.5 flex items-center gap-4 text-xs text-slate-500">
      <span>{total} items</span>
      <span className="text-slate-600">·</span>
      <span>{dirs} folders, {fileCount} files</span>
      <span className="text-slate-600">·</span>
      <span>{formatSize(totalSize)}</span>
      {selected.length > 0 && (
        <>
          <span className="text-slate-600">·</span>
          <span className="text-blue-400">{selected.length} selected</span>
        </>
      )}
      <div className="flex-1" />
      <span className="text-slate-600 truncate max-w-xs" title={currentPath}>{currentPath}</span>
    </div>
  );
}
