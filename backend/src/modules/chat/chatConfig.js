import path from 'path';

export const CHAT_MAX_MESSAGE_LENGTH = Number(process.env.CHAT_MAX_MESSAGE_LENGTH || 4000);
export const CHAT_MAX_FILE_BYTES = Number(process.env.CHAT_MAX_FILE_BYTES || 10 * 1024 * 1024);
export const CHAT_MESSAGE_RATE_LIMIT = Number(process.env.CHAT_MESSAGE_RATE_LIMIT || 25);
export const CHAT_MESSAGE_RATE_WINDOW_MS = Number(process.env.CHAT_MESSAGE_RATE_WINDOW_MS || 60 * 1000);
export const CHAT_UPLOAD_RATE_LIMIT = Number(process.env.CHAT_UPLOAD_RATE_LIMIT || 8);
export const CHAT_UPLOAD_RATE_WINDOW_MS = Number(process.env.CHAT_UPLOAD_RATE_WINDOW_MS || 10 * 60 * 1000);
export const CHAT_STORAGE_DISK = process.env.CHAT_STORAGE_DISK || 'local-private';
export const CHAT_STORAGE_ROOT = path.resolve(
  process.env.CHAT_STORAGE_ROOT || path.join(process.cwd(), 'backend-uploads', 'chat-private')
);

export const CHAT_ALLOWED_FILE_TYPES = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.txt': ['text/plain', 'application/octet-stream'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
};
