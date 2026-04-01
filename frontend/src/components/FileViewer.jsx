import { useState, useEffect, useRef } from 'react';
import { X, Download, Edit2, Copy, Check } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { readFile, updateFile, downloadUrl } from '../api/files';
import { FileIcon, formatSize } from '../utils/fileIcons';

function CodeViewer({ content, language }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      if (language && hljs.getLanguage(language)) {
        ref.current.innerHTML = hljs.highlight(content, { language }).value;
      } else {
        ref.current.innerHTML = hljs.highlightAuto(content, undefined).value;
      }
    }
  }, [content, language]);

  return (
    <pre className="text-xs leading-relaxed overflow-auto p-4 h-full">
      <code ref={ref} className="hljs" />
    </pre>
  );
}

const EXT_LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp', php: 'php',
  html: 'html', css: 'css', scss: 'scss', xml: 'xml',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', md: 'markdown',
};

export default function FileViewer({ file, onClose, onEdit }) {
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    readFile(file.path)
      .then(data => {
        setFileData(data);
        if (data.content) {
          setEditContent(data.content);
          setLineCount(data.content.split('\n').length);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [file.path]);

  const ext = (file.extension || '').replace('.', '').toLowerCase();
  const language = EXT_LANG_MAP[ext] || null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFile(file.path, editContent);
      setSaved(true);
      setFileData(prev => ({ ...prev, content: editContent }));
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fileData?.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (editMode) handleSave();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <FileIcon file={file} size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{file.name}</div>
            <div className="text-xs text-slate-500 flex items-center gap-3">
              <span>{formatSize(file.size)}</span>
              {lineCount > 0 && <span>{lineCount} lines</span>}
              {language && <span className="text-blue-400">{language}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {fileData?.content !== undefined && (
              <>
                <button onClick={handleCopy} className="btn-ghost p-1.5 text-xs flex items-center gap-1">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`btn-ghost p-1.5 text-xs flex items-center gap-1 ${editMode ? 'text-blue-400 bg-blue-900/30' : ''}`}
                  title="Toggle edit mode"
                >
                  <Edit2 size={14} />
                  {editMode ? 'Viewing' : 'Edit'}
                </button>
              </>
            )}
            <a
              href={downloadUrl(file.path)}
              download={file.name}
              className="btn-ghost p-1.5"
              title="Download"
            >
              <Download size={14} />
            </a>
            <button onClick={onClose} className="btn-ghost p-1.5" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && fileData && (
            <>
              {fileData.binary && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                  <FileIcon file={file} size={48} />
                  <div className="text-center">
                    <p className="text-slate-300 font-medium">{file.name}</p>
                    <p className="text-sm">{fileData.mimeType} · {formatSize(file.size)}</p>
                    <p className="text-sm mt-2 text-slate-500">Binary file — use download to view</p>
                  </div>
                  <a href={downloadUrl(file.path)} download={file.name} className="btn-primary mt-2">
                    <Download size={14} className="inline mr-1" /> Download
                  </a>
                </div>
              )}
              {fileData.content !== undefined && !editMode && (
                <CodeViewer content={fileData.content} language={language} />
              )}
              {fileData.content !== undefined && editMode && (
                <div className="flex flex-col h-full">
                  <textarea
                    className="flex-1 bg-transparent text-slate-200 text-xs font-mono p-4 resize-none outline-none leading-relaxed"
                    value={editContent}
                    onChange={e => {
                      setEditContent(e.target.value);
                      setLineCount(e.target.value.split('\n').length);
                    }}
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const val = editContent;
                        setEditContent(val.substring(0, start) + '  ' + val.substring(end));
                        setTimeout(() => {
                          e.target.selectionStart = e.target.selectionEnd = start + 2;
                        }, 0);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700 shrink-0">
                    <span className="text-xs text-slate-500">{lineCount} lines · Ctrl+S to save</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditMode(false)} className="btn-secondary text-xs">
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary text-xs flex items-center gap-1"
                      >
                        {saving ? 'Saving...' : saved ? <><Check size={12} /> Saved!</> : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {fileData.truncated && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                  <p className="text-slate-300">File too large to display ({formatSize(file.size)})</p>
                  <a href={downloadUrl(file.path)} download={file.name} className="btn-primary">
                    <Download size={14} className="inline mr-1" /> Download
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
