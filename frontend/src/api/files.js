import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const listFiles = (path) =>
  api.get('/files', { params: { path } }).then(r => r.data);

export const readFile = (path) =>
  api.get('/file', { params: { path } }).then(r => r.data);

export const createFile = (path, content = '', isDir = false) =>
  api.post('/file', { path, content, isDir }).then(r => r.data);

export const updateFile = (path, content) =>
  api.put('/file', { path, content }).then(r => r.data);

export const deleteFile = (path) =>
  api.delete('/file', { params: { path } }).then(r => r.data);

export const renameFile = (oldPath, newPath) =>
  api.post('/rename', { oldPath, newPath }).then(r => r.data);

export const copyFile = (sourcePath, destPath) =>
  api.post('/copy', { sourcePath, destPath }).then(r => r.data);

export const downloadUrl = (path) =>
  `/api/download?path=${encodeURIComponent(path)}`;

export const uploadFiles = (path, files, onProgress) => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: { path },
    onUploadProgress: onProgress,
  }).then(r => r.data);
};

export const searchFiles = (path, q) =>
  api.get('/search', { params: { path, q } }).then(r => r.data);

export const getTree = (path, depth = 2) =>
  api.get('/tree', { params: { path, depth } }).then(r => r.data);
