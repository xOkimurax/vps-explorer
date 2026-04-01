import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumb({ path, onNavigate }) {
  const parts = path.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
      >
        <Home size={14} />
      </button>
      {parts.map((part, i) => {
        const partPath = '/' + parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <div key={partPath} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={14} className="text-slate-600" />
            <button
              onClick={() => onNavigate(partPath)}
              className={`px-2 py-1 rounded transition-colors
                ${isLast
                  ? 'text-slate-100 font-medium cursor-default'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
            >
              {part}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
