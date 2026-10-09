'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'accent' | 'ghost' | 'soft' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const classes = ['btn', variant !== 'default' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md'; outline?: boolean };

/** An icon-only button. `label` is required: it becomes the accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', outline, className, children, type = 'button', ...rest },
  ref,
) {
  const classes = ['icon-btn', size === 'sm' && 'icon-btn-sm', outline && 'icon-btn-outline', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
});
