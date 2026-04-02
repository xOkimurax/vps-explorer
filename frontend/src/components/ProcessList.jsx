import { useEffect, useMemo, useState } from 'react';

export default function ProcessList({ visible }) {
  const [processes, setProcesses] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);

  const fetchProcesses = async () => {
    try {
      const res = await fetch('/api/processes');
      if (!res.ok) throw new Error('Failed to fetch processes');
      const data = await res.json();
      setProcesses(data.processes || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!visible) return;
    fetchProcesses();
    const id = setInterval(fetchProcesses, 5000);
    return () => clearInterval(id);
  }, [visible]);

  const filtered = useMemo(() => {
    if (!filter) return processes;
    const q = filter.toLowerCase();
    return processes.filter(p => p.command.toLowerCase().includes(q));
  }, [processes, filter]);

  if (!visible) return null;

  return (
    <div className="mx-4 mt-2 mb-2 bg-slate-800/60 border border-slate-700 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-slate-300 font-semibold">Procesos por RAM</div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar..."
          className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
        />
      </div>
      {error ? (
        <div className="p-3 text-xs text-red-400">{error}</div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left px-3 py-1">PID</th>
                <th className="text-left px-3 py-1">Proceso</th>
                <th className="text-right px-3 py-1">%RAM</th>
                <th className="text-right px-3 py-1">RSS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.pid} className="border-t border-slate-800">
                  <td className="px-3 py-1 text-slate-400">{p.pid}</td>
                  <td className="px-3 py-1 text-slate-200">{p.command}</td>
                  <td className="px-3 py-1 text-right text-slate-200">{p.memPercent}%</td>
                  <td className="px-3 py-1 text-right text-slate-400">{p.rssMB} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
