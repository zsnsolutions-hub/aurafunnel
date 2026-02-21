// File: AuraEngine/components/IconRenderer.tsx
import React from 'react';
import { icons } from 'lucide-react';

interface IconRendererProps {
  name: string;
  className?: string;
  size?: number;
}

const IconRenderer: React.FC<IconRendererProps> = ({ name, className, size = 16 }) => {
  const Icon = icons[name as keyof typeof icons];
  if (!Icon) return null;
  return <Icon className={className} size={size} />;
};

export default IconRenderer;
