import { ApiError } from './http';

// Upload rules for private trip documents. The declared MIME type is never
// trusted: the file's leading bytes must match an allowed format.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

type Format = { contentType: string; extension: string; matches: (bytes: Uint8Array) => boolean };

const ascii = (bytes: Uint8Array, offset: number, text: string) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

const FORMATS: Format[] = [
  { contentType: 'application/pdf', extension: 'pdf', matches: (bytes) => ascii(bytes, 0, '%PDF-') },
  { contentType: 'image/png', extension: 'png', matches: (bytes) => bytes[0] === 0x89 && ascii(bytes, 1, 'PNG') },
  { contentType: 'image/jpeg', extension: 'jpg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { contentType: 'image/webp', extension: 'webp', matches: (bytes) => ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP') },
  { contentType: 'image/gif', extension: 'gif', matches: (bytes) => ascii(bytes, 0, 'GIF8') },
  { contentType: 'image/heic', extension: 'heic', matches: (bytes) => ascii(bytes, 4, 'ftyp') && ['heic', 'heix', 'mif1', 'msf1'].some((brand) => ascii(bytes, 8, brand)) },
];

export function detectFormat(bytes: Uint8Array): Format | null {
  return FORMATS.find((format) => format.matches(bytes)) ?? null;
}

export function validateUpload(file: File, head: Uint8Array): Format {
  if (file.size === 0) throw new ApiError(400, 'invalid_request', 'That file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'too_large', 'Files can be up to 15 MB.');
  const format = detectFormat(head);
  if (!format) throw new ApiError(415 as number, 'invalid_request', 'Upload a PDF or an image (JPEG, PNG, WebP, GIF or HEIC).');
  return format;
}

/** Keeps a readable, header-safe file name. */
export function safeFileName(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._()-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'document';
  return `${base}.${extension}`;
}

/**
 * Malware scanning hook. No scanner is bundled; files are stored as
 * `not_scanned` and only ever served back to members of the same trip, with
 * headers that stop the browser executing them. Plug a scanning service in
 * here for production (see docs/OPERATIONS.md).
 */
export interface FileScanner {
  scan(bytes: ArrayBuffer, contentType: string): Promise<'clean' | 'infected' | 'not_scanned'>;
}

export const noScanner: FileScanner = { scan: async () => 'not_scanned' };

export function contentDisposition(fileName: string, inline: boolean): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
