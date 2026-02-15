import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card: React.FC<CardProps> = ({ children, padding = 'md', className = '', ...props }) => (
  <div className={`bg-white border border-gray-200 rounded-xl ${paddingClasses[padding]} ${className}`} {...props}>
    {children}
  </div>
);
