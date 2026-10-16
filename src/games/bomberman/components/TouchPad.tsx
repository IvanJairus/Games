import { useEffect, useRef, useState } from 'react';

import type { Facing } from '../engine/types';
import { resolvePadAxis, type PadAxis } from '../engine/padAxis';
import { buzzTap } from '../../common/haptics';

const DEADZONE = 12;
/**
 * How much further the other axis has to be pushed before the pad switches to it.
 * The board only has four directions, so a diagonal thumb has to resolve to one of
 * them. Picking the larger axis outright made the choice flip on every pixel of jitter
 * near 45 degrees, and the character stepped one cell up, one cell right, and looked
 * lost. Locking the axis until the other one clearly wins by this factor keeps a
 * diagonal push moving in a straight line.
 */
const AXIS_LOCK = 1.4;
const STICK = 118;
const KNOB = 54;

interface TouchPadProps {
  dirRef: React.MutableRefObject<Facing | null>;
  onBomb: () => void;
  disabled: boolean;
}

/**
 * A thumb pad that re-anchors under the finger, so nobody has to look for a widget in
 * the dark. Movement is grid-stepped, so a drag resolves to one of four directions and
 * keeps that axis until the other one is pushed clearly further.
 */
export function TouchPad({ dirRef, onBomb, disabled }: TouchPadProps) {
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const lockedAxis = useRef<PadAxis>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  /* The layer unmounts between matches; without this the last drag stays latched and
     the next round starts walking on its own. */
  useEffect(() => {
    return () => {
      dirRef.current = null;
    };
  }, [dirRef]);

  useEffect(() => {
    const reset = (): void => {
      dirRef.current = null;
      lockedAxis.current = null;
      setKnob({ x: 0, y: 0 });
      setAnchor(null);
    };
    window.addEventListener('resize', reset);
    window.addEventListener('orientationchange', reset);
    return () => {
      window.removeEventListener('resize', reset);
      window.removeEventListener('orientationchange', reset);
    };
  }, [dirRef]);

  const place = (clientX: number, clientY: number): void => {
    const dx = clientX - origin.current.x;
    const dy = clientY - origin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist < DEADZONE) {
      dirRef.current = null;
      lockedAxis.current = null;
      setKnob({ x: 0, y: 0 });
      return;
    }
    const resolved = resolvePadAxis(dx, dy, lockedAxis.current, AXIS_LOCK);
    lockedAxis.current = resolved.axis;
    dirRef.current = resolved.dir;
    const clamp = STICK / 2 - KNOB / 2;
    const scale = Math.min(dist, STICK / 2) / Math.max(dist, 1);
    setKnob({ x: Math.max(-clamp, Math.min(clamp, dx * scale)), y: Math.max(-clamp, Math.min(clamp, dy * scale)) });
  };

  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = zoneRef.current?.getBoundingClientRect();
    origin.current = { x: e.clientX, y: e.clientY };
    if (rect) setAnchor({ left: e.clientX - rect.left, top: e.clientY - rect.top });
    place(e.clientX, e.clientY);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerId.current !== e.pointerId) return;
    place(e.clientX, e.clientY);
  };

  const up = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    dirRef.current = null;
    lockedAxis.current = null;
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div className="bm-pad" aria-hidden="true">
      <div
        className="bm-stick-zone"
        ref={zoneRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        data-testid="bomberman-stick"
      >
        <div
          className="bm-stick"
          style={anchor ? { left: anchor.left - STICK / 2, top: anchor.top - STICK / 2, bottom: 'auto', transform: 'none' } : undefined}
        >
          <div className="bm-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
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
