import React from 'react';

export type NoticeTone = 'warn' | 'info';

interface NoticeToastProps {
  text: string | null;
  tone: NoticeTone;
  testId: string;
}

// Fixed to the viewport on purpose: a strip that pushes the board down by ~50 px every time a
// refusal appears reads as the whole game jumping.
export const NoticeToast: React.FC<NoticeToastProps> = ({ text, tone, testId }) => {
  if (!text) return null;

  const warn = tone === 'warn';

  return (
    <div
      data-testid={testId}
      data-tone={tone}
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(18px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        width: 'min(460px, calc(100% - 32px))',
        maxWidth: 'calc(100% - 32px)',
        zIndex: 30,
        padding: '10px 14px',
        borderRadius: 'var(--r2)',
        border: `1px solid ${warn ? 'var(--red)' : 'var(--gold-border)'}`,
        background: warn ? '#fff' : 'var(--gold-tint)',
        color: warn ? 'var(--red-deep)' : 'var(--gold)',
        font: '11px/1.45 var(--mono)',
        boxShadow: warn
          ? '0 8px 24px rgba(143, 29, 20, 0.18)'
          : '0 8px 24px rgba(180, 83, 9, 0.14)',
      }}
    >
      {text}
    </div>
  );
};
