import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  CHAT_ALLOWED_FILE_TYPES,
  CHAT_MAX_FILE_BYTES,
  CHAT_STORAGE_DISK,
  CHAT_STORAGE_ROOT,
} from './chatConfig.js';

function toSafeOriginalName(fileName) {
  return path.basename(String(fileName || 'file')).replace(/[^\w.\- ()[\]]+/g, '_');
}

function getExtension(fileName) {
  return path.extname(String(fileName || '')).toLowerCase();
}

export function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function validateAttachmentFile(file) {
  if (!file) {
    const error = new Error('Attachment file is required');
    error.status = 400;
    error.code = 'CHAT_FILE_REQUIRED';
    throw error;
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    const error = new Error('Uploaded file is empty');
    error.status = 400;
    error.code = 'CHAT_FILE_EMPTY';
    throw error;
  }

  if (file.size > CHAT_MAX_FILE_BYTES) {
    const error = new Error(`File exceeds ${formatFileSize(CHAT_MAX_FILE_BYTES)} limit`);
    error.status = 400;
    error.code = 'CHAT_FILE_TOO_LARGE';
    throw error;
  }

  const extension = getExtension(file.originalname);
  const allowedMimeTypes = CHAT_ALLOWED_FILE_TYPES[extension];
  if (!allowedMimeTypes) {
    const error = new Error('Unsupported file type');
    error.status = 400;
    error.code = 'CHAT_FILE_UNSUPPORTED_EXTENSION';
    throw error;
  }

  const normalizedMimeType = String(file.mimetype || 'application/octet-stream').toLowerCase();
  if (!allowedMimeTypes.includes(normalizedMimeType)) {
    const error = new Error('File MIME type does not match the allowed list');
    error.status = 400;
    error.code = 'CHAT_FILE_UNSUPPORTED_MIME';
    throw error;
  }

  return {
    extension,
    originalName: toSafeOriginalName(file.originalname),
    mimeType: normalizedMimeType,
    sizeBytes: file.size,
  };
}

export async function saveAttachmentFile(file) {
  const validated = validateAttachmentFile(file);
  const now = new Date();
  const directory = path.join(
    CHAT_STORAGE_ROOT,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0')
  );
  await fs.mkdir(directory, { recursive: true });

  const storedName = `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${validated.extension}`;
  const absolutePath = path.join(directory, storedName);
  await fs.writeFile(absolutePath, file.buffer);

  return {
    original_name: validated.originalName,
    stored_name: storedName,
    mime_type: validated.mimeType,
    extension: validated.extension.replace(/^\./, ''),
    size_bytes: validated.sizeBytes,
    storage_disk: CHAT_STORAGE_DISK,
    storage_path: path.relative(CHAT_STORAGE_ROOT, absolutePath).replace(/\\/g, '/'),
    absolute_path: absolutePath,
  };
}

export function resolveStoredPath(storagePath) {
  const normalized = path.normalize(String(storagePath || ''));
  const absolutePath = path.resolve(CHAT_STORAGE_ROOT, normalized);
  const relative = path.relative(CHAT_STORAGE_ROOT, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Invalid attachment storage path');
    error.status = 500;
    error.code = 'CHAT_STORAGE_PATH_INVALID';
    throw error;
  }
  return absolutePath;
}

export async function deleteStoredFile(storagePath) {
  try {
    await fs.unlink(resolveStoredPath(storagePath));
  } catch (_error) {
    // Ignore cleanup errors for now.
  }
}
