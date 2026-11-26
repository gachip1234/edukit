import React from 'react';
import type { ToolId } from '../tools/registry';

/** Hình thu nhỏ của từng công cụ */
export const ToolThumb: React.FC<{ id: ToolId; className?: string }> = ({ id, className }) => (
  <svg viewBox="0 0 220 150" fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" aria-hidden="true" className={className}>
    {id === 'hinh-phang' ? (
      <>
        <path d="M20 130L80 20l120 110z" />
        <path d="M80 20v110M70 130v-10h10" />
        <circle cx="95" cy="92" r="38" />
      </>
    ) : (
      <>
        <path d="M110 10L30 120h120l45-40zM110 10l40 110M110 10l85 70" />
        <path d="M30 120l45-40h120M75 80l35-70" strokeDasharray="7 6" />
      </>
    )}
  </svg>
);
