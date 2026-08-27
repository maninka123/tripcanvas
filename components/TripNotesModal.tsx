'use client';

import { useRef } from 'react';
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Underline, X } from 'lucide-react';
import { resizeImageToDataUrl } from '@/lib/image';

const TOOLS: { command: string; icon: typeof Bold; label: string; value?: string }[] = [
  { command: 'bold', icon: Bold, label: 'Bold' },
  { command: 'italic', icon: Italic, label: 'Italic' },
  { command: 'underline', icon: Underline, label: 'Underline' },
  { command: 'formatBlock', icon: Heading2, label: 'Heading', value: '<h3>' },
  { command: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
];

export function TripNotesModal({ initialValue, onSave, onClose }: { initialValue: string; onSave: (html: string) => void; onClose: () => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const insertLink = () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    runCommand('createLink', url);
  };

  const insertImage = async (file: File) => {
    const dataUrl = await resizeImageToDataUrl(file, 900);
    runCommand('insertImage', dataUrl);
  };

  const onImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void insertImage(file);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    void insertImage(file);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void insertImage(file);
  };

  const handleSave = () => { onSave(editorRef.current?.innerHTML ?? ''); onClose(); };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal-panel notes-modal" role="dialog" aria-modal="true" aria-labelledby="notes-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div><p className="eyebrow">TRIP NOTES</p><h2 id="notes-title">Write it down, format it your way</h2></div>
          <button onClick={onClose} aria-label="Close"><X size={18}/></button>
        </header>
        <div className="notes-toolbar" role="toolbar" aria-label="Formatting">
          {TOOLS.map(({ command, icon: Icon, label, value }) => (
            <button key={command + (value ?? '')} type="button" title={label} aria-label={label} onClick={() => runCommand(command, value)}><Icon size={15}/></button>
          ))}
          <button type="button" title="Add link" aria-label="Add link" onClick={insertLink}><Link2 size={15}/></button>
          <button type="button" title="Add image" aria-label="Add image" onClick={() => imageInputRef.current?.click()}><ImageIcon size={15}/></button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageFile} style={{ display: 'none' }}/>
        </div>
        <div
          ref={editorRef}
          className="notes-editor"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: initialValue || '<p>Packing reminders, must-do lists, addresses to remember — write freely. Drag or paste an image in here too.</p>' }}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        />
        <div className="notes-modal-actions">
          <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={handleSave}>Save notes</button>
        </div>
      </section>
    </div>
  );
}
