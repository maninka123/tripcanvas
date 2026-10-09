'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

type ControlProps = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/**
 * Labels a single form control and wires up hint and error text through
 * `aria-describedby`, so screen readers announce them with the field.
 */
export function Field({ label, hint, error, optional, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; children: ReactElement<ControlProps>; className?: string }) {
  const generated = useId();
  const id = (isValidElement(children) && children.props.id) || generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label className="field-label" htmlFor={id}>{label}{optional ? <span className="optional">Optional</span> : null}</label>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <span id={hintId} className="field-hint">{hint}</span> : null}
      {error ? <span id={errorId} className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, headingLevel = 2 }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon" aria-hidden>{icon}</div> : null}
      <Heading style={{ fontSize: 'var(--text-lg)' }}>{title}</Heading>
      {children ? <div>{children}</div> : null}
      {action}
    </div>
  );
}

export function Skeleton({ width, height = 16, radius, style }: { width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" aria-hidden style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} />;
}
