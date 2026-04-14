const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const mime = require('mime-types');
const os = require('os');
const http = require('http');
const { exec } = require('child_process');
const { startTerminal } = require('./terminal');

const app = express();
const PORT = process.env.PORT || 4001;
const HOST_ROOT = process.env.HOST_ROOT || '';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = req.body.path || req.query.path || '/tmp';
    try {
      await fsp.access(uploadPath);
      cb(null, uploadPath);
    } catch {
      cb(new Error('Upload directory does not exist'));
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Security: resolve and validate paths
function resolvePath(inputPath) {
  if (!inputPath) return HOST_ROOT + '/';
  const resolved = path.resolve(inputPath);
  // If already prefixed with HOST_ROOT, return as-is
  if (HOST_ROOT && resolved.startsWith(HOST_ROOT)) return resolved;
  return HOST_ROOT + resolved;
}

function stripHostRoot(p) {
  if (HOST_ROOT && p.startsWith(HOST_ROOT)) return p.slice(HOST_ROOT.length) || '/';
  return p;
}

let prevCpuSnapshot = os.cpus();
function getCpuUsagePercent() {
  const cpus = os.cpus();
  const totals = cpus.map((c, i) => {
    const prev = prevCpuSnapshot[i];
    const prevTimes = prev.times;
    const times = c.times;
    const prevTotal = Object.values(prevTimes).reduce((a, b) => a + b, 0);
    const total = Object.values(times).reduce((a, b) => a + b, 0);
    const totalDelta = total - prevTotal;
    const idleDelta = times.idle - prevTimes.idle;
    return { totalDelta, idleDelta };
  });
  prevCpuSnapshot = cpus;
  const totalDelta = totals.reduce((a, b) => a + b.totalDelta, 0);
  const idleDelta = totals.reduce((a, b) => a + b.idleDelta, 0);
  if (totalDelta === 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

function getRamUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = Math.round((used / total) * 100);
  return { total, used, free, percent };
}

function getDiskUsage(pathToCheck) {
  return new Promise((resolve, reject) => {
    exec(`df -k ${pathToCheck}`, (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return reject(new Error('df output invalid'));
      const parts = lines[1].split(/\s+/);
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      const available = parseInt(parts[3], 10) * 1024;
      const percent = parseInt(parts[4].replace('%', ''), 10);
      resolve({ total, used, available, percent });
    });
  });
}

function getDirSizeBytes(dirPath) {
  return new Promise((resolve) => {
    exec(`du -sk "${dirPath}"`, (err, stdout) => {
      if (err) return resolve(0);
      const parts = stdout.trim().split(/\s+/);
      const kb = parseInt(parts[0], 10);
      if (isNaN(kb)) return resolve(0);
      resolve(kb * 1024);
    });
  });
}

async function getHostMemTotalKB() {
  try {
    const meminfoPath = fs.existsSync('/host/proc/meminfo') ? '/host/proc/meminfo' : null;
    if (meminfoPath) {
      const txt = await fsp.readFile(meminfoPath, 'utf8');
      const line = txt.split('\n').find(l => l.startsWith('MemTotal:'));
      if (line) {
        const kb = parseInt(line.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(kb)) return kb;
      }
    }
  } catch {}
  return Math.max(1, Math.round(os.totalmem() / 1024));
}

async function getProcesses() {
  const totalKB = await getHostMemTotalKB();
  const hostProc = fs.existsSync('/host/proc') ? '/host/proc' : null;

  if (hostProc) {
    const entries = await fsp.readdir(hostProc);
    const pids = entries.filter(e => /^\d+$/.test(e));
    const processes = [];
    for (const pid of pids) {
      try {
        const status = await fsp.readFile(path.join(hostProc, pid, 'status'), 'utf8');
        const nameLine = status.split('\n').find(l => l.startsWith('Name:')) || '';
        const rssLine = status.split('\n').find(l => l.startsWith('VmRSS:')) || '';
        const name = nameLine.split(/\s+/)[1] || 'unknown';
        const rssKB = parseInt(rssLine.replace(/[^0-9]/g, ''), 10);
        if (isNaN(rssKB)) continue;
        const memPercent = Math.round((rssKB / totalKB) * 1000) / 10;
        processes.push({
          pid,
          command: name,
          memPercent,
          rssMB: Math.round(rssKB / 1024),
        });
      } catch {}
    }
    return processes.sort((a, b) => b.memPercent - a.memPercent).slice(0, 50);
  }

  return new Promise((resolve, reject) => {
    exec('ps -o pid,comm,rss,vsz', (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n').slice(1);
      const processes = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[0];
        const rssKB = parseInt(parts[2], 10);
        const vszKB = parseInt(parts[3], 10);
        const memPercent = isNaN(rssKB) ? 0 : Math.round((rssKB / totalKB) * 1000) / 10;
        return {
          pid,
          command: parts[1],
          memPercent,
          rssMB: isNaN(rssKB) ? 0 : Math.round(rssKB / 1024),
          vszMB: isNaN(vszKB) ? 0 : Math.round(vszKB / 1024),
        };
      }).sort((a, b) => b.memPercent - a.memPercent);
      resolve(processes);
    });
  });
}

function formatPermissions(mode) {
  const types = { 0o040000: 'd', 0o120000: 'l', 0o100000: '-' };
  const type = types[mode & 0o170000] || '-';
  const perms = ['r', 'w', 'x'];
  let str = type;
  for (let i = 2; i >= 0; i--) {
    for (let j = 2; j >= 0; j--) {
      str += (mode & (1 << (i * 3 + j))) ? perms[2 - j] : '-';
    }
  }
  return str;
}

function getFileType(filePath, stat) {
  if (stat.isDirectory()) return 'directory';
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico'];
  const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac'];
  const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.php', '.css', '.scss', '.html', '.xml', '.json', '.yaml', '.yml', '.toml', '.sh', '.bash', '.zsh', '.fish', '.sql', '.md', '.vue', '.svelte'];
  const archiveExts = ['.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar'];
  const pdfExts = ['.pdf'];
  const textExts = ['.txt', '.log', '.env', '.conf', '.cfg', '.ini', '.csv'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (codeExts.includes(ext)) return 'code';
  if (archiveExts.includes(ext)) return 'archive';
  if (pdfExts.includes(ext)) return 'pdf';
  if (textExts.includes(ext)) return 'text';
  return 'file';
}

// GET /api/files?path=/ruta - list directory
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = resolvePath(req.query.path || '/');
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });

    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stat = await fsp.stat(fullPath);
          const lstat = await fsp.lstat(fullPath);
          return {
            name: entry.name,
            path: stripHostRoot(fullPath),
            isDirectory: entry.isDirectory(),
            isSymlink: lstat.isSymbolicLink(),
            size: stat.size,
            modified: stat.mtime,
            created: stat.birthtime,
            permissions: formatPermissions(stat.mode),
            mode: stat.mode,
            uid: stat.uid,
            gid: stat.gid,
            type: getFileType(fullPath, stat),
            extension: path.extname(entry.name).toLowerCase(),
          };
        } catch (err) {
          return {
            name: entry.name,
            path: stripHostRoot(fullPath),
            isDirectory: entry.isDirectory(),
            isSymlink: false,
            size: 0,
            modified: new Date(),
            created: new Date(),
            permissions: '----------',
            mode: 0,
            uid: 0,
            gid: 0,
            type: entry.isDirectory() ? 'directory' : 'file',
            extension: path.extname(entry.name).toLowerCase(),
            error: err.message,
          };
        }
      })
    );

    // Sort: directories first, then files alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = path.dirname(dirPath);
    const cleanPath = stripHostRoot(dirPath);
    const cleanParent = parentPath && parentPath !== dirPath ? stripHostRoot(parentPath) : null;
    res.json({
      path: cleanPath,
      parent: cleanPath !== '/' ? cleanParent : null,
      files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics - system metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const cpu = getCpuUsagePercent();
    const ram = getRamUsage();
    const diskPath = fs.existsSync('/host/root') ? '/host/root' : (fs.existsSync('/host') ? '/host' : '/');
    const disk = await getDiskUsage(diskPath);
    res.json({
      cpu: { percent: cpu },
      ram,
      disk,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/processes - top processes by RAM
app.get('/api/processes', async (req, res) => {
  try {
    const processes = await getProcesses();
    res.json({ processes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dirsize?path=/ruta - folder size on demand
app.get('/api/dirsize', async (req, res) => {
  try {
    const dirPath = resolvePath(req.query.path || '/');
    const size = await getDirSizeBytes(dirPath);
    res.json({ path: stripHostRoot(dirPath), size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/file?path=/ruta - read file content
app.get('/api/file', async (req, res) => {
  try {
    const filePath = resolvePath(req.query.path);
    const stat = await fsp.stat(filePath);

    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (stat.size > MAX_SIZE) {
      return res.json({
        path: filePath,
        size: stat.size,
        truncated: true,
        error: 'File too large to display (>10MB)',
      });
    }

    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const isText = mimeType.startsWith('text/') ||
      ['application/json', 'application/xml', 'application/javascript',
       'application/x-sh', 'application/x-yaml'].includes(mimeType) ||
      ['.yaml', '.yml', '.toml', '.env', '.conf', '.cfg', '.ini', '.log', '.md'].includes(path.extname(filePath).toLowerCase());

    if (isText) {
      const content = await fsp.readFile(filePath, 'utf8');
      res.json({
        path: filePath,
        content,
        size: stat.size,
        mimeType,
        encoding: 'utf8',
      });
    } else {
      res.json({
        path: filePath,
        size: stat.size,
        mimeType,
        binary: true,
        message: 'Binary file - use download endpoint',
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/file - create file or directory
app.post('/api/file', async (req, res) => {
  try {
    const { path: filePath, content = '', isDir = false } = req.body;
    const resolved = resolvePath(filePath);

    if (isDir) {
      await fsp.mkdir(resolved, { recursive: true });
      res.json({ success: true, path: resolved, type: 'directory' });
    } else {
      await fsp.mkdir(path.dirname(resolved), { recursive: true });
      await fsp.writeFile(resolved, content, 'utf8');
      res.json({ success: true, path: resolved, type: 'file' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/file - edit file content
app.put('/api/file', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const resolved = resolvePath(filePath);
    await fsp.writeFile(resolved, content, 'utf8');
    res.json({ success: true, path: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/file?path=/ruta - delete file or directory
app.delete('/api/file', async (req, res) => {
  try {
    const filePath = resolvePath(req.query.path);
    const stat = await fsp.stat(filePath);

    if (stat.isDirectory()) {
      await fsp.rm(filePath, { recursive: true, force: true });
    } else {
      await fsp.unlink(filePath);
    }

    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rename - rename file or directory
app.post('/api/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const resolvedOld = resolvePath(oldPath);
    const resolvedNew = resolvePath(newPath);
    await fsp.rename(resolvedOld, resolvedNew);
    res.json({ success: true, oldPath: resolvedOld, newPath: resolvedNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/copy - copy file or directory
app.post('/api/copy', async (req, res) => {
  try {
    const { sourcePath, destPath } = req.body;
    const resolvedSrc = resolvePath(sourcePath);
    const resolvedDest = resolvePath(destPath);
    const stat = await fsp.stat(resolvedSrc);

    if (stat.isDirectory()) {
      await fsp.cp(resolvedSrc, resolvedDest, { recursive: true });
    } else {
      await fsp.copyFile(resolvedSrc, resolvedDest);
    }

    res.json({ success: true, sourcePath: resolvedSrc, destPath: resolvedDest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/download?path=/ruta - download file
app.get('/api/download', async (req, res) => {
  try {
    const filePath = resolvePath(req.query.path);
    const stat = await fsp.stat(filePath);

    if (stat.isDirectory()) {
      // Download directory as zip
      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });
      const dirName = path.basename(filePath);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${dirName}.zip"`);

      archive.pipe(res);
      archive.directory(filePath, dirName);
      await archive.finalize();
    } else {
      const fileName = path.basename(filePath);
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload - upload files
app.post('/api/upload', (req, res) => {
  const uploadPath = req.query.path || req.headers['x-upload-path'] || '/tmp';

  const dynamicStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const resolved = resolvePath(uploadPath);
      cb(null, resolved);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });

  const dynamicUpload = multer({ storage: dynamicStorage }).array('files');

  dynamicUpload(req, res, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const uploaded = req.files.map(f => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ success: true, files: uploaded });
  });
});

// GET /api/search?path=/ruta&q=query - search files
app.get('/api/search', async (req, res) => {
  try {
    const searchPath = resolvePath(req.query.path || '/');
    const query = (req.query.q || '').toLowerCase();
    const results = [];
    const MAX_RESULTS = 200;

    async function searchDir(dirPath, depth = 0) {
      if (depth > 10 || results.length >= MAX_RESULTS) return;
      try {
        const entries = await fsp.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) break;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.name.toLowerCase().includes(query)) {
            try {
              const stat = await fsp.stat(fullPath);
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size: stat.size,
                modified: stat.mtime,
                type: getFileType(fullPath, stat),
              });
            } catch {}
          }
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await searchDir(fullPath, depth + 1);
          }
        }
      } catch {}
    }

    await searchDir(searchPath);
    res.json({ results, total: results.length, truncated: results.length >= MAX_RESULTS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tree?path=/ruta - get directory tree for sidebar
app.get('/api/tree', async (req, res) => {
  try {
    const dirPath = resolvePath(req.query.path || '/');
    const depth = parseInt(req.query.depth) || 2;

    async function buildTree(p, d) {
      if (d <= 0) return null;
      try {
        const entries = await fsp.readdir(p, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).slice(0, 50);
        const children = await Promise.all(
          dirs.map(async (entry) => {
            const fullPath = path.join(p, entry.name);
            const subtree = await buildTree(fullPath, d - 1);
            return {
              name: entry.name,
              path: fullPath,
              children: subtree,
            };
          })
        );
        return children;
      } catch {
        return null;
      }
    }

    const children = await buildTree(dirPath, depth);
    res.json({ path: dirPath, children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, uptime: process.uptime() });
});

// Proxy transcription to Groq API (bypasses mixed content, better quality)
app.post('/api/transcribe', async (req, res) => {
  try {
    const audio_base64 = req.body.audio_base64;
    const mimetype = req.body.mimetype || 'audio/webm';

    if (!audio_base64) {
      return res.status(400).json({ error: 'Missing audio_base64' });
    }

    // Decode base64 and create buffer
    const audioBuffer = Buffer.from(audio_base64, 'base64');

    // Create form data for Groq
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimetype });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || 'GROQ_API_KEY_PLACEHOLDER'}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      res.json({ text: data.text || '' });
    } else {
      res.status(response.status).json({ error: data.error?.message || 'Transcription failed' });
    }
  } catch (err) {
    console.error('Transcribe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
startTerminal(server);

server.listen(PORT, () => {
  console.log(`VPS Explorer Backend running on port ${PORT}`);
});
