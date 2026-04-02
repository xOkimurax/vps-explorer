import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Star, StarOff, HardDrive, Home, Settings2, Menu } from 'lucide-react';
import { getTree } from '../api/files';

const BOOKMARKS_KEY = 'vps-explorer-bookmarks';

const DEFAULT_BOOKMARKS = [
  { name: 'Root', path: '/' },
  { name: 'Home', path: '/root' },
  { name: 'Tmp', path: '/tmp' },
  { name: 'Etc', path: '/etc' },
  { name: 'Var', path: '/var' },
  { name: 'Opt', path: '/opt' },
];

function TreeNode({ node, currentPath, onNavigate, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [children, setChildren] = useState(node.children || []);
  const [loading, setLoading] = useState(false);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!expanded && children.length === 0 && !node.children) {
      setLoading(true);
      try {
        const data = await getTree(node.path, 1);
        setChildren(data.children || []);
      } catch {}
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  const isActive = currentPath === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm transition-colors
          ${isActive ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-slate-700/50 text-slate-300'}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onNavigate(node.path)}
      >
        <button
          onClick={toggle}
          className="p-0.5 hover:bg-slate-600 rounded shrink-0"
        >
          {loading ? (
            <div className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
          ) : expanded ? (
            <ChevronDown size={12} className="text-slate-400" />
          ) : (
            <ChevronRight size={12} className="text-slate-400" />
          )}
        </button>
        {expanded ? (
          <FolderOpen size={14} className="text-blue-400 shrink-0" />
        ) : (
          <Folder size={14} className="text-blue-400 shrink-0" />
        )}
        <span className="truncate text-xs">{node.name}</span>
      </div>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ currentPath, onNavigate, onToggle }) {
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || DEFAULT_BOOKMARKS;
    } catch {
      return DEFAULT_BOOKMARKS;
    }
  });
  const [tree, setTree] = useState(null);
  const [showTree, setShowTree] = useState(false);

  const saveBookmarks = (bm) => {
    setBookmarks(bm);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm));
  };

  const isBookmarked = bookmarks.some(b => b.path === currentPath);

  const toggleBookmark = () => {
    if (isBookmarked) {
      saveBookmarks(bookmarks.filter(b => b.path !== currentPath));
    } else {
      const name = currentPath.split('/').pop() || '/';
      saveBookmarks([...bookmarks, { name, path: currentPath }]);
    }
  };

  const loadTree = async () => {
    if (!showTree) {
      try {
        const data = await getTree('/', 2);
        setTree(data);
      } catch {}
    }
    setShowTree(!showTree);
  };

  return (
    <aside className="w-52 bg-slate-800/60 border-r border-slate-700 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <HardDrive size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">VPS Explorer</span>
        </div>
        <button
          onClick={onToggle}
          className="md:hidden p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Menu size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-4">
        {/* Bookmarks */}
        <div>
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bookmarks</span>
            <button
              onClick={toggleBookmark}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-yellow-400 transition-colors"
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              {isBookmarked ? <StarOff size={12} /> : <Star size={12} />}
            </button>
          </div>
          <div className="space-y-0.5 px-2">
            {bookmarks.map((bm) => (
              <button
                key={bm.path}
                onClick={() => onNavigate(bm.path)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left
                  ${currentPath === bm.path ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-slate-700/50 text-slate-300'}`}
              >
                <Folder size={13} className="text-blue-400 shrink-0" />
                <span className="truncate">{bm.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Directory Tree */}
        <div>
          <button
            onClick={loadTree}
            className="flex items-center justify-between w-full px-3 mb-1 group"
          >
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">File Tree</span>
            {showTree ? (
              <ChevronDown size={12} className="text-slate-500" />
            ) : (
              <ChevronRight size={12} className="text-slate-500" />
            )}
          </button>
          {showTree && tree && (
            <div className="px-1">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs transition-colors
                  ${currentPath === '/' ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-slate-700/50 text-slate-300'}`}
                onClick={() => onNavigate('/')}
              >
                <FolderOpen size={13} className="text-blue-400" />
                <span>/</span>
              </div>
              {(tree.children || []).map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  currentPath={currentPath}
                  onNavigate={onNavigate}
                  depth={1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-700">
        <div className="text-xs text-slate-500 truncate" title={currentPath}>
          {currentPath}
        </div>
      </div>
    </aside>
  );
}
