import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, setMuted, unlockAudio } from './audio';

export function useMuted(): [boolean, () => void] {
  const [muted, setLocal] = React.useState(() => isMuted());
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setLocal(next);
  };
  return [muted, toggle];
}

interface Props {
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
  testId?: string;
}

const DEFAULT_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '30px',
  background: '#ffffff',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--r2)',
  color: 'var(--ink)',
  cursor: 'pointer',
  flexShrink: 0,
};

/**
 * The preference is shared across the hub, so every mount reads the same value.
 * The default skin follows the hub's small buttons; pass `style` to match a game
 * that draws its own.
 */
export const SoundToggle: React.FC<Props> = ({ className, style, iconSize = 14, testId }) => {
  const [muted, toggle] = useMuted();
  return (
    <button
      type="button"
      className={className}
      // A caller that brings its own class already owns the skin; inline defaults
      // would win over it and break that game's button.
      style={className ? style : { ...DEFAULT_STYLE, ...style }}
      aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
      aria-pressed={muted}
      title={muted ? 'Nyalakan suara' : 'Bisukan suara'}
      data-testid={testId ?? 'sound-toggle'}
      onClick={() => {
        unlockAudio();
        toggle();
      }}
    >
      {muted ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
    </button>
  );
};
