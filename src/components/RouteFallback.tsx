import React from 'react';

export const RouteFallback: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      font: '12px/1 var(--mono)',
      color: 'var(--ink-dim)',
      letterSpacing: '.04em',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        width: '10px',
        height: '10px',
        border: '1px solid var(--line-strong)',
        borderTopColor: 'var(--red)',
        borderRadius: '50%',
        animation: 'ij-spin 900ms linear infinite',
      }}
    />
    {label}
  </div>
);
