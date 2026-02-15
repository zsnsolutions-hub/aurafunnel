import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center py-20 text-center ${className}`}>
    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-5">
      {icon || <Inbox size={22} />}
    </div>
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    {description && <p className="text-sm text-gray-500 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
