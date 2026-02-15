import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

const variantClasses = {
  text: 'h-4 rounded-lg',
  circular: 'rounded-full',
  rectangular: 'rounded-2xl',
};

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'text' }) => (
  <div className={`animate-pulse bg-gray-100 ${variantClasses[variant]} ${className}`} />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white border border-gray-200 rounded-2xl p-6 space-y-4 ${className}`}>
    <Skeleton variant="text" className="w-1/3 h-5" />
    <Skeleton variant="text" className="w-full" />
    <Skeleton variant="text" className="w-2/3" />
  </div>
);
