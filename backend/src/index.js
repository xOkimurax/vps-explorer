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
let prevTotalTicks = null;
let prevProcessTicks = {}; // { pid: { utime, stime } }

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

function getTotalCpuTicks() {
  const cpus = os.cpus();
  return cpus.reduce((sum, c) => {
    const t = c.times;
    return sum + t.user + t.nice + t.system + t.idle + t.iowait + t.irq + t.softirq + t.steal;
  }, 0);
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
  const CLK_TCK = 100; // or discover via `getconf CLK_TCK`

  if (hostProc) {
    const entries = await fsp.readdir(hostProc);
    const pids = entries.filter(e => /^\d+$/.test(e));
    const processes = [];
    const now = Date.now();

    for (const pid of pids) {
      try {
        const status = await fsp.readFile(path.join(hostProc, pid, 'status'), 'utf8');
        const stat = await fsp.readFile(path.join(hostProc, pid, 'stat'), 'utf8');

        const nameLine = status.split('\n').find(l => l.startsWith('Name:')) || '';
        const rssLine = status.split('\n').find(l => l.startsWith('VmRSS:')) || '';
        const name = nameLine.split(/\s+/)[1] || 'unknown';
        const rssKB = parseInt(rssLine.replace(/[^0-9]/g, ''), 10);
        if (isNaN(rssKB)) continue;

        // Parse utime/stime from /proc/PID/stat (field 14 and 15)
        // stat format: pid (comm) state ppid pgrp session tty_nr ...
        const statParts = stat.split(' ');
        // comm is in parentheses and may contain spaces, find the last ')' to split cleanly
        const lastParen = stat.lastIndexOf(')');
        const afterComm = stat.slice(lastParen + 2); // skip ") "
        const fields = afterComm.split(' ').filter(Boolean);
        // fields[0]=state, fields[1]=ppid, fields[2]=pgrp... fields[11]=utime, fields[12]=stime
        const utime = parseInt(fields[11], 10) || 0;
        const stime = parseInt(fields[12], 10) || 0;
        const totalTicks = utime + stime;

        const prev = prevProcessTicks[pid];
        let cpuPercent = 0;
        if (prev) {
          const tickDelta = totalTicks - prev.totalTicks;
          const timeDeltaMs = now - prev.timestamp;
          if (timeDeltaMs > 0) {
            cpuPercent = Math.round((tickDelta / CLK_TCK) / (timeDeltaMs / 1000) * 100 * 10) / 10;
          }
        }
        prevProcessTicks[pid] = { totalTicks, timestamp: now };

        const memPercent = Math.round((rssKB / totalKB) * 1000) / 10;
        processes.push({
          pid,
          command: name,
          memPercent,
          cpuPercent,
          rssMB: Math.round(rssKB / 1024),
        });
      } catch {}
    }
    return processes.sort((a, b) => b.memPercent - a.memPercent).slice(0, 50);
  }

  return new Promise((resolve, reject) => {
    exec('ps -o pid,comm,rss,vsz,%cpu', (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n').slice(1);
      const processes = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[0];
        const rssKB = parseInt(parts[2], 10);
        const vszKB = parseInt(parts[3], 10);
        const cpuPercent = parseFloat(parts[4]) || 0;
        const memPercent = isNaN(rssKB) ? 0 : Math.round((rssKB / totalKB) * 1000) / 10;
        return {
          pid,
          command: parts[1],
          memPercent,
          cpuPercent,
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

// GET /api/projects - list all projects with status
// Auto-scans all Docker containers + reads Cloudflare Tunnel config for public URLs
app.get('/api/projects', async (req, res) => {
  try {
    // Read Cloudflare Tunnel config to get public URL mappings
    // Must SSH to host since we're running inside a container with /host mounted
    const readTunnelConfig = () => new Promise((resolve) => {
      const cmd = `sshpass -p 'matias12' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@217.76.59.68 "cat /root/.cloudflared/config.yml 2>/dev/null"`;
      exec(cmd, { timeout: 10000 }, (err, stdout) => {
        if (err) {
          console.error('Tunnel config read failed:', err.message);
          return resolve({ mappings: {}, portToHostname: {} });
        }
        // Parse ingress rules: hostname → port
        const lines = stdout.split('\n');
        const mappings = {};
        const portToHostname = {};
        let currentHost = null;
        for (const line of lines) {
          const hostMatch = line.match(/^\s+-\s+hostname:\s+(.+)$/);
          const svcMatch = line.match(/^\s+service:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
          if (hostMatch) currentHost = hostMatch[1];
          if (svcMatch && currentHost) {
            const internalPort = parseInt(svcMatch[1]);
            const subdomain = currentHost.split('.')[0];
            mappings[currentHost] = internalPort;
            mappings[subdomain] = internalPort;
            portToHostname[internalPort] = currentHost;
            currentHost = null;
          }
        }
        console.log('Tunnel mappings:', JSON.stringify(mappings));
        console.log('Port→Hostname:', JSON.stringify(portToHostname));
        resolve({ mappings, portToHostname });
      });
    });

    // Registry: maps container name to { name, port, type, internal, subdomain }
    // subdomain = the part before .matias-automatization.online in cloudflare config
    const REGISTRY = {
      'vps-explorer-backend':   { name: 'VPS Explorer API', subdomain: null, port: 4001, internal: false },
      'vps-explorer-frontend': { name: 'VPS Explorer',    subdomain: 'vps-explorer', internal: false },
      'n8n':                    { name: 'N8N',             subdomain: 'n8n',         internal: false },
      'evolution-api':           { name: 'Evolution API',   subdomain: 'evo',         internal: false },
      'deploy':                  { name: 'Deploy Panel',    subdomain: 'deploy',       internal: false },
      'alba-catalogo':           { name: 'Alba Catálogo',   port: 4400, internal: true },
      'ticket-ads':              { name: 'Ticket Ads',      port: 4300, internal: true },
      'audio-transcribe-api':    { name: 'Audio Transcriber', port: 3002, internal: true },
      'zen_raman':               { name: 'Zen Raman',       port: 4001, internal: true },
      'insf-vps-insforge-1':     { name: 'InsForge',        subdomain: 'insf-vps', port: 7130, internal: true },
      'insf-vps-postgres-1':     { name: 'InsForge DB',     type: 'database', internal: true },
      'insf-vps-postgrest-1':    { name: 'InsForge PostgREST', port: 5430, type: 'api', internal: true },
      'insf-vps-deno-1':         { name: 'InsForge Deno',   port: 7133, type: 'api', internal: true },
      'insf-vps-vector-1':       { name: 'InsForge Vector', type: 'database', internal: true },
      'postgres':                { name: 'PostgreSQL',      type: 'database', internal: true },
    };

    // Run docker ps on the host via SSH
    const runHostCommand = (cmd) => new Promise((resolve, reject) => {
      exec(`sshpass -p 'matias12' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@217.76.59.68 "${cmd.replace(/"/g, '\\"')}"`, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      });
    });

    // Enhanced URL detection
    const detectUrl = (container, info, tunnelMappings, portToHostname) => {
      // 1. Explicit subdomain from REGISTRY
      if (info.subdomain && tunnelMappings[info.subdomain]) {
        return { url: `https://${info.subdomain}.matias-automatization.online`, detectedAs: 'subdomain' };
      }
      // 2. Port match via reverse index (info.port matches a tunnel hostname)
      if (info.port && portToHostname[info.port]) {
        return { url: `https://${portToHostname[info.port]}`, detectedAs: 'port-match' };
      }
      // 3. Try tunnel hostname for the REGISTRY port
      if (info.port) {
        const matchedHost = Object.keys(tunnelMappings).find(k =>
          tunnelMappings[k] === info.port && k.includes('.')
        );
        if (matchedHost) {
          return { url: `https://${matchedHost}`, detectedAs: 'port-fallback' };
        }
      }
      // 4. Fallback to localhost
      if (info.port) {
        return { url: `http://localhost:${info.port}`, detectedAs: 'localhost' };
      }
      // 5. Public port match for containers without REGISTRY entry
      if (container.publicPort) {
        const matchedHost = Object.keys(tunnelMappings).find(k =>
          tunnelMappings[k] === container.publicPort && k.includes('.')
        );
        if (matchedHost) {
          return { url: `https://${matchedHost}`, detectedAs: 'public-port' };
        }
      }
      return { url: null, detectedAs: null };
    };

    // Health check with timeout
    const healthCheck = (url) => new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      fetch(url, { signal: controller.signal, redirect: 'follow' })
        .then(resp => {
          clearTimeout(timer);
          resolve({ code: resp.status, ok: resp.ok });
        })
        .catch(() => {
          clearTimeout(timer);
          resolve({ code: 0, ok: false });
        });
    });

    // Check container with parallel health checks for internal containers
    const checkContainer = async (info, url, detectedAs) => {
      // For non-internal or subdomain/port-match, single check suffices
      if (!info.internal || detectedAs === 'subdomain' || detectedAs === 'port-match') {
        const result = await healthCheck(url);
        return {
          httpCode: result.code,
          httpOk: result.ok,
          status: result.ok ? 'running' : (result.code > 0 ? 'degraded' : 'stopped'),
          url,
          internal: info.internal !== false
        };
      }

      // For internal containers with localhost fallback, check both in parallel
      const localhostUrl = `http://localhost:${info.port}`;
      const [localhostResult, tunnelResult] = await Promise.all([
        healthCheck(localhostUrl),
        healthCheck(url)
      ]);

      if (localhostResult.ok && tunnelResult.ok) {
        return { httpCode: tunnelResult.code, httpOk: true, status: 'running', url, internal: true };
      } else if (localhostResult.ok && !tunnelResult.ok) {
        return { httpCode: localhostResult.code, httpOk: localhostResult.ok, status: localhostResult.ok ? 'running' : 'degraded', url: localhostUrl, internal: true };
      } else if (!localhostResult.ok && tunnelResult.ok) {
        // Isolated network - only tunnel works
        return { httpCode: tunnelResult.code, httpOk: true, status: 'running', url, internal: false };
      } else {
        return { httpCode: 0, httpOk: false, status: 'stopped', url: localhostUrl, internal: info.internal !== false };
      }
    };

    // Get tunnel config for URL auto-mapping
    const { mappings: tunnelMappings, portToHostname } = await readTunnelConfig();

    // Scan all Docker containers via host SSH
    let containers = [];
    try {
      const output = await runHostCommand('docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}"');
      const lines = output.split('\n').filter(l => l.trim());
      containers = lines.map(line => {
        const parts = line.split('|');
        const portsStr = parts[2] || '';
        // Extract first mapped port (e.g. "4000->4001" → 4000, or "4001" → 4001)
        const portMatch = portsStr.match(/(\d+)->/);
        const plainPort = portsStr.match(/^(\d+)\//);
        const publicPort = portMatch ? parseInt(portMatch[1]) : (plainPort ? parseInt(plainPort[1]) : null);
        return { name: parts[0] || '', status: parts[1] || '', ports: portsStr, publicPort };
      });
    } catch (err) {
      console.error('Docker scan failed:', err.message);
    }

    // Build project list with HTTP checks in parallel
    const projects = await Promise.all(
      containers.map(async (c) => {
        const info = REGISTRY[c.name] || {};
        const { url, detectedAs } = detectUrl(c, info, tunnelMappings, portToHostname);

        const health = url ? await checkContainer(info, url, detectedAs) : {
          httpCode: null,
          httpOk: null,
          status: c.status.toLowerCase().includes('up') ? 'configured' : 'stopped',
          url: null,
          internal: info.internal !== false
        };

        return {
          name: info.name || c.name,
          container: c.name,
          status: health.status,
          type: info.type || 'application',
          internal: health.internal,
          url: health.url,
          httpCode: health.httpCode,
          httpOk: health.httpOk,
          ports: c.ports,
          registry: !!info.name,
          lastChecked: new Date().toISOString(),
        };
      })
    );

    // Sort: running > configured > degraded > stopped
    const STATUS_ORDER = { running: 0, configured: 1, degraded: 2, stopped: 3 };
    projects.sort((a, b) => {
      const orderDiff = (STATUS_ORDER[a.status] || 4) - (STATUS_ORDER[b.status] || 4);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    res.json({
      projects,
      total: projects.length,
      running: projects.filter(p => p.status === 'running' || p.status === 'configured').length,
      scanned: containers.length,
      checked: new Date().toISOString(),
    });
  } catch (err) {
    console.error('/api/projects error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Agents API (mock - for OpenClaw integration)
let agentConfig = { retentionMs: 3600000 }; // 1 hour default

app.get('/api/agents', (req, res) => {
  // Return empty agents list - actual agents managed by OpenClaw
  res.json({ agents: [] });
});

app.get('/api/agents/config', (req, res) => {
  res.json(agentConfig);
});

app.put('/api/agents/config', (req, res) => {
  if (req.body.retentionMs) {
    agentConfig.retentionMs = req.body.retentionMs;
  }
  res.json(agentConfig);
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
