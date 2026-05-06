import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { ReactNode, MouseEventHandler } from 'react';

interface Props {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  icon?: ReactNode;
  className?: string;
  title?: string;
}

export function Button({ children, onClick, disabled, variant = 'primary', icon, className, title }: Props) {
  return (
    <motion.button
      whileHover={!disabled ? { y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(variant === 'primary' ? 'btn-primary' : 'btn-ghost', className)}
    >
      {icon && <span className="flex items-center [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>}
      {children}
    </motion.button>
  );
}
