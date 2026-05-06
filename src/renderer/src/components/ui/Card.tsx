import clsx from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  variant?: 'glass' | 'glassStrong' | 'glassDeep';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className, variant = 'glass', padding = 'md' }: Props) {
  return (
    <div
      className={clsx(
        'rounded-xl',
        variant === 'glass' && 'glass',
        variant === 'glassStrong' && 'glass-strong',
        variant === 'glassDeep' && 'glass-deep',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-5',
        padding === 'lg' && 'p-7',
        className,
      )}
    >
      {children}
    </div>
  );
}
