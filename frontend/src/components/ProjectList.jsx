import { useEffect, useMemo, useState } from 'react';

const STATUS_COLORS = {
  running: 'text-green-400',
  stopped: 'text-red-400',
  unknown: 'text-slate-400',
};

const STATUS_BADGES = {
  running: 'bg-green-900/50 text-green-300 border border-green-700',
  stopped: 'bg-red-900/50 text-red-300 border border-red-700',
  unknown: 'bg-slate-800 text-slate-400 border border-slate-600',
};

const HTTP_BADGES = {
  200: 'bg-green-900/30 text-green-400',
  201: 'bg-green-900/30 text-green-400',
  300: 'bg-yellow-900/30 text-yellow-400',
  400: 'bg-orange-900/30 text-orange-400',
  500: 'bg-red-900/30 text-red-400',
  0: 'bg-slate-800 text-slate-500',
};

function formatUptime(status) {
  // Status comes from docker ps, e.g. "Up 5 days", "Up 15 hours"
  if (!status) return '';
  return status.replace('Up ', '↑ ');
}

export default function ProjectList({ visible }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [filter, setFilter] = useState('');
  const [showInternal, setShowInternal] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const url = showInternal ? '/api/projects?includeInternal=true' : '/api/projects';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProjects(data.projects || []);
      setLastChecked(data.checked);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    fetchProjects();
    const id = setInterval(fetchProjects, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, [visible, showInternal]);

  const filtered = useMemo(() => {
    if (!filter) return projects;
    const q = filter.toLowerCase();
    return projects.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.container.toLowerCase().includes(q) ||
      (p.url && p.url.toLowerCase().includes(q))
    );
  }, [projects, filter]);

  if (!visible) return null;

  return (
    <div className="mx-4 mt-2 mb-2 bg-slate-800/60 border border-slate-700 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 font-semibold">Proyectos</span>
          <span className="text-[10px] text-slate-500">
            {projects.filter(p => p.status === 'running').length}/{projects.length} activos
          </span>
          {loading && <span className="text-[10px] text-slate-500 animate-pulse">↻</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar..."
            className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none w-28"
          />
          <button
            onClick={() => setShowInternal(p => !p)}
            className={`text-[10px] px-2 py-1 rounded border ${
              showInternal 
                ? 'bg-purple-600/30 text-purple-300 border-purple-600' 
                : 'bg-slate-700 text-slate-400 border-slate-600 hover:text-slate-200'
            }`}
            title="Mostrar proyectos internos"
          >
            {showInternal ? '✓' : '-'}
          </button>
          <button
            onClick={fetchProjects}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
            title="Refrescar"
          >
            ↻
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-3 text-xs text-red-400">Error: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-xs text-slate-500 text-center">No hay proyectos activos</div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 sticky top-0 bg-slate-800/80">
              <tr>
                <th className="text-left px-3 py-1.5">Estado</th>
                <th className="text-left px-3 py-1.5">Proyecto</th>
                <th className="text-left px-3 py-1.5">URL / HTTP</th>
                <th className="text-left px-3 py-1.5">Contenedor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.container} className="border-t border-slate-800/50 hover:bg-slate-700/20">
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGES[p.status] || STATUS_BADGES.unknown}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                      {p.status === 'running' ? 'Active' : p.status === 'stopped' ? 'Stop' : '?'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-200 font-medium">{p.name}</div>
                    {p.internal && <span className="text-[10px] text-purple-400">interno</span>}
                  </td>
                  <td className="px-3 py-2">
                    {p.url ? (
                      <div className="flex items-center gap-2">
                        <a 
                          href={p.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 hover:underline text-[10px] truncate max-w-[180px]"
                          title={p.url}
                        >
                          {p.url.replace('https://', '').replace('http://', '')}
                        </a>
                        {p.httpCode && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${HTTP_BADGES[p.httpCode] || HTTP_BADGES[0]}`}>
                            {p.httpCode}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-400 text-[10px] font-mono">{p.container}</div>
                    <div className="text-slate-500 text-[9px]">{formatUptime(p.status)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastChecked && (
        <div className="px-3 py-1.5 border-t border-slate-700/50 text-[10px] text-slate-500">
          Ultimo check: {new Date(lastChecked).toLocaleTimeString('es-PY')}
        </div>
      )}
    </div>
  );
}