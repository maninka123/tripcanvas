'use client';

import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTrip } from '@/features/trips/client/TripContext';
import { ACCEPTED_FILES, deleteFile, fileUrl, formatBytes, uploadFile } from '@/features/trips/client/files';
import type { Attachment, AttachmentCategory } from '@/features/trips/types';

// Autosaving form controls. Text inputs keep a local draft and commit after a
// short pause (and on blur); consecutive commits to the same field are merged
// into one save and one undo step by the sync engine's coalesce key.

export function useDraft<T>(value: T, commit: (value: T) => void, delay = 600) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Adopt outside changes (undo, a collaborator's edit) when not mid-edit.
  if (value !== synced && !editing) { setSynced(value); setDraft(value); }
  const flush = (next: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setEditing(false);
    setSynced(next);
    if (next !== value) commit(next);
  };
  const change = (next: T) => {
    setDraft(next);
    setEditing(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), delay);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { draft, change, flush: () => flush(draft) };
}

export function AutoInput({ value, onCommit, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (value: string) => void }) {
  const { draft, change, flush } = useDraft(value, onCommit);
  return <input {...rest} className={rest.className ?? 'input'} value={draft} onChange={(event) => change(event.target.value)} onBlur={flush} onKeyDown={(event) => { if (event.key === 'Enter' && rest.type !== 'textarea') flush(); rest.onKeyDown?.(event); }} />;
}

export function AutoTextarea({ value, onCommit, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onCommit: (value: string) => void }) {
  const { draft, change, flush } = useDraft(value, onCommit, 800);
  return <textarea {...rest} className={rest.className ?? 'textarea'} value={draft} onChange={(event) => change(event.target.value)} onBlur={flush} />;
}

/** Number input that commits null when emptied. */
export function AutoNumber({ value, onCommit, min = 0, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min'> & { value: number | null; onCommit: (value: number | null) => void; min?: number }) {
  const text = value === null ? '' : String(value);
  const { draft, change, flush } = useDraft(text, (next) => {
    const parsed = next.trim() === '' ? null : Number(next);
    if (parsed === null || (Number.isFinite(parsed) && parsed >= min)) onCommit(parsed);
  });
  return <input {...rest} type="number" inputMode="decimal" min={min} className="input" value={draft} onChange={(event) => change(event.target.value)} onBlur={flush} />;
}

export function Attachments({ attachments, owner, canEdit }: { attachments: Attachment[]; owner: { activityId?: string; stayId?: string }; canEdit: boolean }) {
  const { sync } = useTrip();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<AttachmentCategory>('ticket');
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadFile(sync, file, { category, ...owner });
      toast({ message: `Attached ${file.name}.`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Upload failed.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (attachment: Attachment) => {
    try { await deleteFile(sync, attachment.id); toast({ message: `Removed ${attachment.fileName}.` }); }
    catch (error) { toast({ message: error instanceof Error ? error.message : 'Could not remove the file.', tone: 'error' }); }
  };
  return (
    <div className="attachments">
      {attachments.length ? (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.contentType.startsWith('image/') ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
              <a href={fileUrl(attachment.id)} target="_blank" rel="noopener" className="spacer truncate">{attachment.fileName}</a>
              <span className="tiny subtle">{formatBytes(attachment.sizeBytes)}</span>
              {canEdit ? <IconButton size="sm" label={`Remove ${attachment.fileName}`} onClick={() => void remove(attachment)}><Trash2 size={14} /></IconButton> : null}
            </li>
          ))}
        </ul>
      ) : <p className="small subtle"><Paperclip size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> No tickets or confirmations attached.</p>}
      {canEdit ? (
        <div className="row-wrap">
          <select className="select" style={{ width: 'auto' }} aria-label="Document type" value={category} onChange={(event) => setCategory(event.target.value as AttachmentCategory)}>
            <option value="ticket">Ticket</option><option value="confirmation">Confirmation</option><option value="voucher">Voucher</option><option value="insurance">Insurance</option><option value="other">Other</option>
          </select>
          <Button size="sm" icon={<Upload size={14} />} loading={busy} onClick={() => input.current?.click()}>Attach a file</Button>
          <input ref={input} type="file" hidden accept={ACCEPTED_FILES} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          <span className="tiny subtle">PDF or image, up to 15 MB. Private to this trip.</span>
        </div>
      ) : null}
    </div>
  );
}
