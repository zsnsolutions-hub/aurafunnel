import React from 'react';
import { useUIMode } from './UIModeProvider';

interface AdvancedOnlyProps {
  children: React.ReactNode;
  /** Rendered instead when in simplified mode */
  fallback?: React.ReactNode;
}

export const AdvancedOnly: React.FC<AdvancedOnlyProps> = ({ children, fallback = null }) => {
  const { isAdvanced } = useUIMode();
  return <>{isAdvanced ? children : fallback}</>;
};
