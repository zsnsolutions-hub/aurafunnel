import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-200',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-200',
  ghost: 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-2 focus-visible:ring-indigo-200',
  destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm focus-visible:ring-2 focus-visible:ring-red-200',
};

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon, children, className = '', ...props }) => (
  <button
    className={`inline-flex items-center justify-center font-medium rounded-xl outline-none transition-all duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
    {...props}
  >
    {icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
    {children}
  </button>
);
