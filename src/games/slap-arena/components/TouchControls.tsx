import React, { useEffect, useRef } from 'react';
import { CHARGE_MAX_TIME, DASH_COOLDOWN, SLAP_COOLDOWN } from '../engine/physics';
import type { SlapSim } from '../engine/sim';
import { unlockAudio } from '../../common/audio';
import { buzz } from '../../common/haptics';

interface TouchControlsProps {
  sim: SlapSim;
  localId: string;
  onMove: (x: number, z: number) => void;
  /** Finger down: starts the wind-up. The page owns when the slap actually lands. */
  onSlapStart: () => void;
  /** Finger up: spends whatever charge the sim banked. */
  onSlapEnd: () => void;
  onDash: () => void;
  /** Called on unmount so a lifted-but-unreleased drag cannot outlive the round. */
  onRelease: () => void;
}

const STICK_RADIUS = 46;

/**
 * Floating stick: the base appears under the thumb instead of waiting in a corner,
 * which is the difference between "works on a phone" and "plays well on a phone".
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  sim,
  localId,
  onMove,
  onSlapStart,
  onSlapEnd,
  onDash,
  onRelease,
}) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const slapCdRef = useRef<HTMLDivElement>(null);
  const dashCdRef = useRef<HTMLDivElement>(null);
  const slapTxtRef = useRef<HTMLSpanElement>(null);
  const dashTxtRef = useRef<HTMLSpanElement>(null);
  const chargeRef = useRef<HTMLSpanElement>(null);
  const slapBtnRef = useRef<HTMLButtonElement>(null);
  const pointerId = useRef<number | null>(null);
  const slapPointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  // This layer unmounts between rounds. Without a release here the last drag
  // vector stays latched and the next round starts walking on its own.
  useEffect(() => onRelease, [onRelease]);

  // An anchored base from the previous orientation would sit off-screen after a
  // rotation, so hand control back to the CSS defaults whenever the viewport changes.
  useEffect(() => {
    const reset = () => {
      const stick = stickRef.current;
      if (!stick) return;
      stick.style.left = '';
      stick.style.top = '';
      stick.style.bottom = '';
      stick.style.opacity = '0.35';
      pointerId.current = null;
      onMove(0, 0);
    };
    window.addEventListener('resize', reset);
    window.addEventListener('orientationchange', reset);
    return () => {
      window.removeEventListener('resize', reset);
      window.removeEventListener('orientationchange', reset);
    };
  }, [onMove]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const me = sim.players[localId];
      const slap = me?.slapCooldown ?? 0;
      const dash = me?.dashCooldown ?? 0;
      if (slapCdRef.current) {
        const p = Math.max(0, Math.min(1, slap / SLAP_COOLDOWN));
        slapCdRef.current.style.height = `${p * 100}%`;
        if (slapTxtRef.current) slapTxtRef.current.textContent = slap > 0.05 ? slap.toFixed(1) : '';
      }
      if (dashCdRef.current) {
        const p = Math.max(0, Math.min(1, dash / DASH_COOLDOWN));
        dashCdRef.current.style.height = `${p * 100}%`;
        if (dashTxtRef.current) dashTxtRef.current.textContent = dash > 0.05 ? dash.toFixed(1) : '';
      }
      // The wind-up meter is the only proof on a phone that holding is doing something.
      const ring = chargeRef.current;
      if (ring) {
        const c = me && me.chargeT >= 0 ? Math.min(1, me.chargeT / CHARGE_MAX_TIME) : 0;
        ring.style.transform = `scale(${0.55 + c * 0.55})`;
        ring.style.opacity = c > 0 ? `${0.2 + c * 0.8}` : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, localId]);

  /** Parks the base under the thumb once, clamped so it never hangs off screen. */
  const anchor = (clientX: number, clientY: number) => {
    const stick = stickRef.current;
    const zone = zoneRef.current;
    if (!stick || !zone) return;
    const rect = zone.getBoundingClientRect();
    const half = (stick.offsetWidth || 136) / 2;
    const cx = Math.max(half + 8, Math.min(rect.width - half - 8, clientX - rect.left));
    const cy = Math.max(half + 8, Math.min(rect.height - half - 8, clientY - rect.top));
    stick.style.left = `${cx - half}px`;
    stick.style.top = `${cy - half}px`;
    stick.style.bottom = 'auto';
    stick.style.opacity = '1';
    origin.current = { x: rect.left + cx, y: rect.top + cy };
  };

  const place = (clientX: number, clientY: number) => {
    if (!knobRef.current) return;
    let dx = clientX - origin.current.x;
    let dy = clientY - origin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const power = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
    if (power < 0.12) {
      onMove(0, 0);
      return;
    }
    const len = Math.hypot(dx, dy) || 1;
    onMove((dx / len) * power, (dy / len) * power);
  };

  const handleDown = (e: React.PointerEvent) => {
    if (pointerId.current !== null) return;
    unlockAudio();
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    anchor(e.clientX, e.clientY);
    place(e.clientX, e.clientY);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    place(e.clientX, e.clientY);
  };

  const handleUp = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    onMove(0, 0);
    onRelease();
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
    if (stickRef.current) stickRef.current.style.opacity = '0.35';
  };

  const slapReady = (sim.players[localId]?.slapCooldown ?? 0) <= 0;
  const dashReady = (sim.players[localId]?.dashCooldown ?? 0) <= 0;

  return (
    <div className="sa-pad" data-testid="slap-touch">
      <div
        ref={zoneRef}
        className="sa-stick-zone"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        aria-hidden="true"
      >
        <div ref={stickRef} className="sa-stick" style={{ opacity: 0.35 }}>
          <div ref={knobRef} className="sa-stick__knob" />
        </div>
      </div>

      <div className="sa-actions">
        <button
          type="button"
          className="sa-action sa-action--dash"
          data-testid="slap-btn-dash"
          aria-label={`Terjang ${dashReady ? 'siap' : 'sedang isi ulang'}`}
          onPointerDown={() => {
            unlockAudio();
            if (!dashReady) return;
            buzz(14);
            onDash();
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ position: 'absolute', top: 9 }}>
            <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
          </svg>
          <span ref={dashTxtRef} className="sa-action__cdtext" />
          <span ref={dashCdRef} className="sa-action__cd" style={{ height: 0 }} />
        </button>

        <button
          type="button"
          ref={slapBtnRef}
          className="sa-action sa-action--slap"
          data-testid="slap-btn-slap"
          aria-label={`Tampar ${slapReady ? 'siap' : 'sedang isi ulang'}`}
          onPointerDown={(e) => {
            unlockAudio();
            if (!slapReady) return;
            buzz(22);
            onSlapStart();
            slapPointer.current = e.pointerId;
            // Capture keeps the release even when the thumb slides off the button,
            // which is exactly when a charged slap should still land.
            slapBtnRef.current?.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (e.pointerId !== slapPointer.current) return;
            slapPointer.current = null;
            onSlapEnd();
          }}
          onPointerCancel={(e) => {
            if (e.pointerId !== slapPointer.current) return;
            slapPointer.current = null;
            onSlapEnd();
          }}
        >
          <span ref={chargeRef} className="sa-action__charge" aria-hidden="true" />
          <span className="sa-action__label">TAMPAR</span>
          <span ref={slapTxtRef} className="sa-action__cdtext" style={{ position: 'absolute', top: 4 }} />
          <span ref={slapCdRef} className="sa-action__cd" style={{ height: 0 }} />
        </button>
      </div>
    </div>
  );
};
