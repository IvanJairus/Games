import { useEffect, useRef } from 'react';

import type { Facing } from '../engine/types';
import { buzzTap } from '../../common/haptics';

interface DirectionPadProps {
  dirRef: React.MutableRefObject<Facing | null>;
  onBomb: () => void;
  disabled: boolean;
}

const PAD_DIRS: { dir: Facing; label: string; glyph: string }[] = [
  { dir: 'up', label: 'Atas', glyph: 'M12 5 20 18H4z' },
  { dir: 'left', label: 'Kiri', glyph: 'M6 12 18 4v16z' },
  { dir: 'right', label: 'Kanan', glyph: 'M18 12 6 20V4z' },
  { dir: 'down', label: 'Bawah', glyph: 'M12 19 4 6h16z' },
];

const isFacing = (raw: string | null | undefined): raw is Facing =>
  raw === 'up' || raw === 'down' || raw === 'left' || raw === 'right';

/**
 * Four buttons for a field that has four directions.
 *
 * A thumb pad has to translate a diagonal push into one of four headings, and near 45
 * degrees that answer flips on a pixel of jitter: the runner steps sideways, then up, and
 * reads as lost. The arrows remove the question. The container owns the pointer so a
 * finger can slide from one arrow to the next without lifting, which is how a physical
 * D-pad behaves.
 */
export function DirectionPad({ dirRef, onBomb, disabled }: DirectionPadProps) {
  const held = useRef(new Map<number, Facing>());

  const apply = (): void => {
    const last = [...held.current.values()].pop() ?? null;
    dirRef.current = last;
  };

  /* The layer unmounts between matches; an orphaned hold would start the next round
     walking on its own. */
  useEffect(() => {
    return () => {
      dirRef.current = null;
    };
  }, [dirRef]);

  useEffect(() => {
    const reset = (): void => {
      held.current.clear();
      dirRef.current = null;
    };
    window.addEventListener('blur', reset);
    return () => window.removeEventListener('blur', reset);
  }, [dirRef]);

  useEffect(() => {
    if (disabled) {
      held.current.clear();
      dirRef.current = null;
    }
  }, [disabled, dirRef]);

  /* The event target answers a press that lands on an arrow, which is almost all of them.
     elementFromPoint is only needed while a captured finger slides from one arrow to the
     next, because capture keeps sending the moves to the container. */
  const dirAt = (e: React.PointerEvent<HTMLDivElement>): Facing | null => {
    const target = (e.target as HTMLElement).closest?.('[data-dir]');
    let raw = target?.getAttribute('data-dir') ?? null;
    if (!raw) {
      const el = document.elementFromPoint?.(e.clientX, e.clientY) as HTMLElement | null;
      raw = el?.closest('[data-dir]')?.getAttribute('data-dir') ?? null;
    }
    return isFacing(raw) ? raw : null;
  };

  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const dir = dirAt(e);
    if (!dir) return;
    e.preventDefault();
    // jsdom has no pointer capture; the arrows still work there without it.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    held.current.set(e.pointerId, dir);
    apply();
    buzzTap();
  };

  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!held.current.has(e.pointerId)) return;
    const dir = dirAt(e);
    if (dir) held.current.set(e.pointerId, dir);
    else held.current.delete(e.pointerId);
    apply();
  };

  const up = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!held.current.delete(e.pointerId)) return;
    apply();
  };

  return (
    <div className="bm-pad">
      <div
        className="bm-dpad"
        role="group"
        aria-label="Arah"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        data-testid="bomberman-dpad"
      >
        {PAD_DIRS.map(({ dir, label, glyph }) => (
          <button
            key={dir}
            type="button"
            className={`bm-dir bm-dir--${dir}`}
            data-dir={dir}
            aria-label={label}
            data-testid={`bomberman-dir-${dir}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={glyph} fill="currentColor" stroke="#2a1b33" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
      <div className="bm-actions">
        <button
          type="button"
          className="bm-action bm-action--bom"
          aria-label="Tanam bom"
          data-testid="bomberman-bom"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            if (disabled) return;
            buzzTap();
            onBomb();
          }}
        >
          BOM
        </button>
      </div>
    </div>
  );
}
