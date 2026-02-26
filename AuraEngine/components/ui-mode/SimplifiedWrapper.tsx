import React from 'react';
import { useUIMode } from './UIModeProvider';

interface SimplifiedWrapperProps {
  simplified: React.ReactNode;
  advanced: React.ReactNode;
}

export const SimplifiedWrapper: React.FC<SimplifiedWrapperProps> = ({ simplified, advanced }) => {
  const { isSimplified } = useUIMode();
  return <>{isSimplified ? simplified : advanced}</>;
};
