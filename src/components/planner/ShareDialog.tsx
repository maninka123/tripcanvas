'use client';

import { Check, Copy, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useTrip } from '@/features/trips/client/TripContext';
import type { TripRole } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { usePlannerUI } from './planner-state';

export function ShareDialog({ user }: { user: { id: string; email: string } }) {
  const { view: aggregate, role, sync } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Exclude<TripRole, 'owner'>>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const owner = role === 'owner';
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/trips/${aggregate.trip.id}`;

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/trips/${aggregate.trip.id}/members`, { method: 'POST', json: { email: email.trim(), role: newRole } });
      await sync.reload();
      toast({ message: `${email.trim()} can now ${newRole === 'editor' ? 'edit' : 'view'} this trip once they sign in. Send them the link.`, tone: 'success' });
      setEmail('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share the trip.');
    } finally {
      setBusy(false);
    }
  };
  const changeRole = async (memberId: string, next: Exclude<TripRole, 'owner'>) => {
    try { await api(`/api/trips/${aggregate.trip.id}/members`, { method: 'PATCH', json: { memberId, role: next } }); await sync.reload(); }
    catch (cause) { toast({ message: cause instanceof Error ? cause.message : 'Could not change access.', tone: 'error' }); }
  };
  const removeMember = async (memberId: string) => {
    try { await api(`/api/trips/${aggregate.trip.id}/members?memberId=${encodeURIComponent(memberId)}`, { method: 'DELETE' }); await sync.reload(); }
    catch (cause) { toast({ message: cause instanceof Error ? cause.message : 'Could not remove access.', tone: 'error' }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { toast({ message: 'Copy failed — select the link and copy it manually.', tone: 'error' }); }
  };

  return (
    <Modal open onOpenChange={(open) => !open && ui.openDialog(null)} title="Share trip" description="Trips are private. Invite people by the email they sign in with; they need the link below to open it.">
      <div className="row">
        <input className="input" readOnly value={link} aria-label="Trip link" onFocus={(event) => event.target.select()} />
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
      </div>
      {owner ? (
        <form className="stack-sm" onSubmit={(event) => { event.preventDefault(); if (email.trim()) void invite(); }}>
          <div className="share-invite">
            <Field label="Email" error={error}><input className="input" type="email" required value={email} placeholder="friend@example.com" onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Access"><select className="select" value={newRole} onChange={(event) => setNewRole(event.target.value as 'editor' | 'viewer')}><option value="editor">Can edit</option><option value="viewer">Can view</option></select></Field>
            <Button type="submit" variant="primary" icon={<UserPlus size={16} />} loading={busy} disabled={!email.trim()}>Invite</Button>
          </div>
        </form>
      ) : <p className="small muted">Only the owner can invite people.</p>}
      <ul className="member-list">
        {aggregate.members.map((member) => (
          <li key={member.id}>
            <span className="avatar">{(member.displayName ?? member.email).slice(0, 2)}</span>
            <span className="spacer" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: 'block' }}>{member.displayName ?? member.email}{member.userId === user.id ? ' (you)' : ''}</span>
              <span className="tiny subtle">{member.userId ? member.email : 'Invited — not signed in yet'}</span>
            </span>
            {member.role === 'owner' ? <span className="badge">Owner</span> : owner ? (
              <>
                <select className="select" style={{ width: 'auto' }} aria-label={`Access for ${member.email}`} value={member.role} onChange={(event) => void changeRole(member.id, event.target.value as 'editor' | 'viewer')}><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
                <IconButton size="sm" label={`Remove ${member.email}`} onClick={() => void removeMember(member.id)}><Trash2 size={14} /></IconButton>
              </>
            ) : <span className="badge">{member.role === 'editor' ? 'Can edit' : 'Can view'}</span>}
          </li>
        ))}
      </ul>
      <p className="tiny subtle">Editors can change plans; viewers can open the trip and Travel Mode. Only the owner can share, archive or delete. Every request is checked on the server.</p>
    </Modal>
  );
}
