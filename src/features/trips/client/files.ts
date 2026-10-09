import { api } from '@/lib/api-client';
import type { Attachment, AttachmentCategory } from '../types';
import type { TripSync } from './trip-sync';

export const ACCEPTED_FILES = 'application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Waits until queued edits are saved, so a file can link to an item the server knows about. */
async function settled(sync: TripSync, timeoutMs = 15_000) {
  const started = Date.now();
  while (sync.hasPending && Date.now() - started < timeoutMs) await new Promise((resolve) => setTimeout(resolve, 250));
  if (sync.hasPending) throw new Error('Your latest changes are still saving. Try the upload again in a moment.');
}

export async function uploadFile(sync: TripSync, file: File, owner: { category: AttachmentCategory; activityId?: string | null; stayId?: string | null }): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Files can be up to 15 MB.');
  await settled(sync);
  const form = new FormData();
  form.set('file', file);
  form.set('category', owner.category);
  if (owner.activityId) form.set('activityId', owner.activityId);
  if (owner.stayId) form.set('stayId', owner.stayId);
  const result = await api<{ attachment: Attachment }>(`/api/trips/${sync.tripId}/files`, { method: 'POST', body: form });
  await sync.reload();
  return result.attachment;
}

export async function deleteFile(sync: TripSync, id: string) {
  await api(`/api/files/${id}`, { method: 'DELETE' });
  await sync.reload();
}

export function fileUrl(id: string, download = false) {
  return `/api/files/${id}${download ? '?download=1' : ''}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
