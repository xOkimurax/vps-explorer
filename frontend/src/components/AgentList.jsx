import { useEffect, useMemo, useState } from 'react';

const STATUS_COLORS = {
  running: 'text-blue-400',
  done: 'text-green-400',
  error: 'text-red-400',
};

const STATUS_LABELS = {
  running: '⚡ Working',
  done: '✅ Done',
  error: '❌ Error',
};

const RETENTION_OPTIONS = [
  { label: '5 min', value: 5 * 60 * 1000 },
  { label: '15 min', value: 15 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '1 day', value: 24 * 60 * 60 * 1000 },
];

export default function AgentList({ visible }) {
  const [agents, setAgents] = useState([]);
  const [retentionMs, setRetentionMs] = useState(5 * 60 * 1000);
  const [filter, setFilter] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);

  const fetchAgents = async () => {
    try {
      const [agentsRes, configRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/agents/config'),
      ]);
      if (!agentsRes.ok) throw new Error('Failed to fetch agents');
      const data = await agentsRes.json();
      setAgents(data.agents || []);
      if (configRes.ok) {
        const cfg = await configRes.json();
        setRetentionMs(cfg.retentionMs);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!visible) return;
    fetchAgents();
    const id = setInterval(fetchAgents, 3000);
    return () => clearInterval(id);
  }, [visible]);

  const handleRetentionChange = async (val) => {
    try {
      await fetch('/api/agents/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionMs: val }),
      });
      setRetentionMs(val);
    } catch {}
  };

  const filtered = useMemo(() => {
    if (!filter) return agents;
    const q = filter.toLowerCase();
    return agents.filter(a => a.description?.toLowerCase().includes(q));
  }, [agents, filter]);

  if (!visible) return null;

  return (
    <div className="mx-4 mt-2 mb-2 bg-slate-800/60 border border-slate-700 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-slate-300 font-semibold">Agentes Claude Code</div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar..."
            className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none w-28"
          />
          <button
            onClick={() => setShowSettings(p => !p)}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
          >
            ⚙️
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/40">
          <div className="text-xs text-slate-400 mb-1">Retention:</div>
          <div className="flex gap-1">
            {RETENTION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleRetentionChange(opt.value)}
                className={`px-2 py-1 rounded text-xs ${
                  retentionMs === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="p-3 text-xs text-red-400">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-xs text-slate-500 text-center">No agents running</div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left px-3 py-1">Status</th>
                <th className="text-left px-3 py-1">Agent</th>
                <th className="text-left px-3 py-1">Info</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className={`px-3 py-1 font-semibold ${STATUS_COLORS[a.status] || 'text-slate-400'}`}>
                    {STATUS_LABELS[a.status] || a.status}
                  </td>
                  <td className="px-3 py-1 text-slate-200">{a.description || '—'}</td>
                  <td className="px-3 py-1 text-slate-400">
                    {a.status === 'done' && a.result && <span title={a.result}>✅ Ver result</span>}
                    {a.status === 'error' && a.error && <span className="text-red-400" title={a.error}>❌ {a.error}</span>}
                    {a.status === 'running' && <span>...</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
