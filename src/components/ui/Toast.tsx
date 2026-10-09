'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

// Lightweight toasts announced through an ARIA live region. Errors use
// role="alert"; everything else is polite. Toasts with an action (e.g. Undo)
// stay a little longer.

export type ToastTone = 'info' | 'success' | 'error';
export type ToastInput = { message: string; tone?: ToastTone; action?: { label: string; onClick: () => void }; duration?: number };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((items) => [...items.filter((item) => item.message !== toast.message).slice(-2), { ...toast, id }]);
    const duration = toast.duration ?? (toast.action ? 7000 : toast.tone === 'error' ? 8000 : 4000);
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toaster" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
          return (
            <div key={toast.id} className={`toast${toast.tone === 'error' ? ' toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
              <Icon className="toast-icon" size={18} aria-hidden />
              <span className="toast-message">{toast.message}</span>
              {toast.action ? <button type="button" className="toast-action" onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}>{toast.action.label}</button> : null}
              <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
}
