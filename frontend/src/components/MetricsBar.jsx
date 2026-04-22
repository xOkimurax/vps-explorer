import { useEffect, useState } from 'react';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

export default function MetricsBar({ onRamClick, onCpuClick, onProjectsClick, agentCount = 0 }) {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error('Failed to fetch metrics');
      const data = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, []);

  if (error && !metrics) {
    return (
      <div className="mx-4 mt-2 text-xs text-red-400">Metrics error: {error}</div>
    );
  }

  const cpu = metrics?.cpu?.percent ?? 0;
  const ram = metrics?.ram?.percent ?? 0;
  const disk = metrics?.disk?.percent ?? 0;

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onCpuClick}
          className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 text-left hover:border-green-500/60 transition-colors"
        >
          <div className="text-[10px] text-slate-400 uppercase">CPU</div>
          <div className="text-sm text-slate-200 font-semibold">{cpu}%</div>
        </button>
        <button
          onClick={onRamClick}
          className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 text-left hover:border-blue-500/60 transition-colors"
        >
          <div className="text-[10px] text-slate-400 uppercase">RAM</div>
          <div className="text-sm text-slate-200 font-semibold">{ram}%</div>
          <div className="text-[10px] text-slate-500">
            {formatBytes(metrics?.ram?.used)} / {formatBytes(metrics?.ram?.total)}
          </div>
        </button>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-2">
          <div className="text-[10px] text-slate-400 uppercase">Disk</div>
          <div className="text-sm text-slate-200 font-semibold">{disk}%</div>
          <div className="text-[10px] text-slate-500">
            {formatBytes(metrics?.disk?.used)} / {formatBytes(metrics?.disk?.total)}
          </div>
        </div>
        <button
          onClick={onProjectsClick}
          className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 text-left hover:border-purple-500/60 transition-colors"
        >
          <div className="text-[10px] text-slate-400 uppercase">Projects</div>
          <div className="text-sm text-slate-200 font-semibold flex items-center gap-1">
            {agentCount > 0 && (
              <span className="bg-purple-600 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                {agentCount}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
