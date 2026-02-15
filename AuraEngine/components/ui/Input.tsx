import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, icon, className = '', ...props }, ref) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 [&>svg]:w-4 [&>svg]:h-4">{icon}</div>
      )}
      <input
        ref={ref}
        className={`w-full h-9 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-150 ease-out focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-500 ${icon ? 'pl-10' : ''} ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''} ${className}`}
        {...props}
      />
    </div>
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
));

Input.displayName = 'Input';
