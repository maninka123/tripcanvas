'use client';

import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button, IconButton } from './Button';

// Accessible overlays built on Radix Dialog: focus is trapped and restored,
// Escape closes, and the page behind is inert. `Drawer` slides in from the
// right on desktop and becomes a bottom sheet on phones (see components.css).

type Common = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', hideTitle }: Common & { size?: 'sm' | 'md' | 'lg'; hideTitle?: boolean }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="overlay" />
        <RadixDialog.Content className={`dialog${size !== 'md' ? ` dialog-${size}` : ''}`} aria-describedby={description ? undefined : undefined}>
          <div className="dialog-header">
            <div className="spacer">
              <RadixDialog.Title className={hideTitle ? 'visually-hidden' : undefined}>{title}</RadixDialog.Title>
              {description ? <RadixDialog.Description asChild><p>{description}</p></RadixDialog.Description> : <RadixDialog.Description className="visually-hidden">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close asChild><IconButton label="Close"><X size={18} /></IconButton></RadixDialog.Close>
          </div>
          {children ? <div className="dialog-body">{children}</div> : null}
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Drawer({ open, onOpenChange, title, description, children, footer, headerActions, modal = true }: Common & { headerActions?: ReactNode; modal?: boolean }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <RadixDialog.Portal>
        {modal ? <RadixDialog.Overlay className="overlay drawer-overlay" /> : null}
        <RadixDialog.Content className="drawer" onInteractOutside={modal ? undefined : (event) => event.preventDefault()}>
          <div className="sheet-handle" aria-hidden />
          <div className="drawer-header">
            <RadixDialog.Title className="spacer truncate" style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{title}</RadixDialog.Title>
            {headerActions}
            <RadixDialog.Close asChild><IconButton label="Close"><X size={18} /></IconButton></RadixDialog.Close>
          </div>
          <RadixDialog.Description className="visually-hidden">{description ?? (typeof title === 'string' ? title : 'Details')}</RadixDialog.Description>
          <div className="drawer-body">{children}</div>
          {footer ? <div className="drawer-footer">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, busy, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm" footer={<>
      <Button onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} autoFocus>{confirmLabel}</Button>
    </>}>
      {children}
    </Modal>
  );
}
