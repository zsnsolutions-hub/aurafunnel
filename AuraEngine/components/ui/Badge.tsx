import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const variants = {
  default: 'bg-gray-50 text-gray-600 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border ${variants[variant]} ${className}`}>
    {children}
  </span>
);
