import {
  Folder, FolderOpen, FileText, FileCode, Image, Film, Music,
  FileArchive, File, FileJson, Terminal, Database, Settings,
  Coffee, Braces, Hash, BookOpen, Link
} from 'lucide-react';

const EXT_MAP = {
  // Web
  js: { icon: FileCode, color: 'text-yellow-400' },
  jsx: { icon: FileCode, color: 'text-blue-400' },
  ts: { icon: FileCode, color: 'text-blue-500' },
  tsx: { icon: FileCode, color: 'text-blue-400' },
  html: { icon: FileCode, color: 'text-orange-400' },
  css: { icon: FileCode, color: 'text-blue-300' },
  scss: { icon: FileCode, color: 'text-pink-400' },
  vue: { icon: FileCode, color: 'text-green-400' },
  svelte: { icon: FileCode, color: 'text-orange-500' },
  // Data
  json: { icon: FileJson, color: 'text-yellow-300' },
  yaml: { icon: FileCode, color: 'text-red-400' },
  yml: { icon: FileCode, color: 'text-red-400' },
  toml: { icon: FileCode, color: 'text-orange-300' },
  xml: { icon: FileCode, color: 'text-orange-400' },
  csv: { icon: FileText, color: 'text-green-300' },
  sql: { icon: Database, color: 'text-blue-400' },
  // Backend
  py: { icon: FileCode, color: 'text-blue-400' },
  rb: { icon: FileCode, color: 'text-red-400' },
  go: { icon: FileCode, color: 'text-cyan-400' },
  rs: { icon: FileCode, color: 'text-orange-500' },
  java: { icon: Coffee, color: 'text-orange-400' },
  kt: { icon: FileCode, color: 'text-purple-400' },
  php: { icon: FileCode, color: 'text-purple-300' },
  c: { icon: FileCode, color: 'text-blue-300' },
  cpp: { icon: FileCode, color: 'text-blue-400' },
  h: { icon: FileCode, color: 'text-slate-400' },
  cs: { icon: FileCode, color: 'text-purple-400' },
  // Shell
  sh: { icon: Terminal, color: 'text-green-400' },
  bash: { icon: Terminal, color: 'text-green-400' },
  zsh: { icon: Terminal, color: 'text-green-300' },
  fish: { icon: Terminal, color: 'text-cyan-400' },
  // Text/Docs
  md: { icon: BookOpen, color: 'text-slate-300' },
  txt: { icon: FileText, color: 'text-slate-300' },
  log: { icon: FileText, color: 'text-slate-400' },
  pdf: { icon: FileText, color: 'text-red-500' },
  // Config
  env: { icon: Settings, color: 'text-yellow-500' },
  conf: { icon: Settings, color: 'text-slate-400' },
  cfg: { icon: Settings, color: 'text-slate-400' },
  ini: { icon: Settings, color: 'text-slate-400' },
  // Images
  jpg: { icon: Image, color: 'text-pink-400' },
  jpeg: { icon: Image, color: 'text-pink-400' },
  png: { icon: Image, color: 'text-pink-400' },
  gif: { icon: Image, color: 'text-pink-400' },
  svg: { icon: Image, color: 'text-orange-400' },
  webp: { icon: Image, color: 'text-pink-300' },
  ico: { icon: Image, color: 'text-yellow-400' },
  // Media
  mp4: { icon: Film, color: 'text-purple-400' },
  avi: { icon: Film, color: 'text-purple-400' },
  mov: { icon: Film, color: 'text-purple-400' },
  mkv: { icon: Film, color: 'text-purple-400' },
  mp3: { icon: Music, color: 'text-green-400' },
  wav: { icon: Music, color: 'text-green-400' },
  // Archives
  zip: { icon: FileArchive, color: 'text-yellow-400' },
  tar: { icon: FileArchive, color: 'text-yellow-400' },
  gz: { icon: FileArchive, color: 'text-yellow-400' },
  bz2: { icon: FileArchive, color: 'text-yellow-400' },
  '7z': { icon: FileArchive, color: 'text-yellow-400' },
  rar: { icon: FileArchive, color: 'text-yellow-400' },
  xz: { icon: FileArchive, color: 'text-yellow-400' },
  // Symlink
  lnk: { icon: Link, color: 'text-cyan-400' },
};

export function FileIcon({ file, open = false, size = 16 }) {
  if (file.isDirectory) {
    const Icon = open ? FolderOpen : Folder;
    return <Icon size={size} className="text-blue-400 shrink-0" />;
  }
  if (file.isSymlink) {
    return <Link size={size} className="text-cyan-400 shrink-0" />;
  }
  const ext = (file.extension || '').replace('.', '').toLowerCase();
  const mapping = EXT_MAP[ext];
  if (mapping) {
    const Icon = mapping.icon;
    return <Icon size={size} className={`${mapping.color} shrink-0`} />;
  }
  return <File size={size} className="text-slate-400 shrink-0" />;
}

export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
