/**
 * Terminal Panel - Dockable terminal component
 */

'use client';

import React from 'react';
import { Terminal } from './Terminal';

interface TerminalPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  height?: number;
  className?: string;
}

export function TerminalPanel({ 
  isOpen = true, 
  onClose, 
  height = 35,
  className = '' 
}: TerminalPanelProps) {
  if (!isOpen) return null;

  return (
    <div 
      className={`terminal-panel dockable-panel flex flex-col ${className}`}
      style={{ height: `${height}vh`, minHeight: '200px', maxHeight: '80vh' }}
      role="region"
      aria-label="Quant Terminal"
    >
      <Terminal />
    </div>
  );
}

export default TerminalPanel;