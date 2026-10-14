import React, { useRef, useState, useCallback } from 'react';

interface VirtualJoystickProps {
  onMove: (vector: { x: number; z: number }) => void;
  onSlap: () => void;
  onDash: () => void;
  slapCooldown: number;
  dashCooldown: number;
  maxSlapCooldown?: number;
  maxDashCooldown?: number;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onMove,
  onSlap,
  onDash,
  slapCooldown,
  dashCooldown,
  maxSlapCooldown = 0.48,
  maxDashCooldown = 2.2,
}) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSlapPressed, setIsSlapPressed] = useState(false);
  const [isDashPressed, setIsDashPressed] = useState(false);

  const radius = 55; // Max displacement radius in pixels

  const handlePointerDown = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateVector(e.clientX, e.clientY);
  };

  const updateVector = (clientX: number, clientY: number) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist <= 0.001) {
      setKnobPos({ x: 0, y: 0 });
      onMove({ x: 0, z: 0 });
      return;
    }

    const clampedDist = Math.min(dist, radius);
    const nx = dx / dist;
    const ny = dy / dist;

    setKnobPos({
      x: nx * clampedDist,
      y: ny * clampedDist,
    });

    const normalizedPower = clampedDist / radius;
    onMove({
      x: nx * normalizedPower,
      z: ny * normalizedPower,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerIdRef.current) return;
    updateVector(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    onMove({ x: 0, z: 0 });
  };

  const triggerSlap = useCallback(() => {
    if (slapCooldown > 0) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(20);
      } catch {}
    }
    onSlap();
  }, [slapCooldown, onSlap]);

  const triggerDash = useCallback(() => {
    if (dashCooldown > 0) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
    onDash();
  }, [dashCooldown, onDash]);

  const slapProgress = slapCooldown > 0 ? slapCooldown / maxSlapCooldown : 0;
  const dashProgress = dashCooldown > 0 ? dashCooldown / maxDashCooldown : 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '190px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: '0 24px 24px 24px',
        pointerEvents: 'none',
        zIndex: 50,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Left zone: Analog joystick */}
      <div
        ref={baseRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '130px',
          height: '130px',
          borderRadius: '50%',
          backgroundColor: 'rgba(28, 25, 23, 0.45)',
          border: '2px solid rgba(254, 243, 199, 0.25)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        {/* Subtle center crosshair guide */}
        <div
          style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
          }}
        />

        {/* Movable thumb knob */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            backgroundColor: '#f59e0b',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.4)',
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            transition: pointerIdRef.current === null ? 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#b45309',
            }}
          />
        </div>
      </div>

      {/* Right zone: Action buttons (Slap + Dash) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          pointerEvents: 'auto',
        }}
      >
        {/* Dash Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onPointerDown={() => {
              setIsDashPressed(true);
              triggerDash();
            }}
            onPointerUp={() => setIsDashPressed(false)}
            onPointerCancel={() => setIsDashPressed(false)}
            disabled={dashCooldown > 0}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: dashCooldown > 0 ? '#451a03' : '#0284c7',
              color: '#ffffff',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              boxShadow: isDashPressed
                ? '0 2px 4px rgba(0, 0, 0, 0.5)'
                : '0 6px 14px rgba(0, 0, 0, 0.4), inset 0 2px 3px rgba(255, 255, 255, 0.4)',
              transform: isDashPressed ? 'scale(0.92)' : 'scale(1)',
              transition: 'transform 0.08s ease, background-color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: dashCooldown > 0 ? 'not-allowed' : 'pointer',
              touchAction: 'none',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-label="Dash button"
          >
            {dashCooldown > 0 ? (
              <span style={{ font: '700 13px/1 var(--mono, monospace)' }}>
                {dashCooldown.toFixed(1)}s
              </span>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}

            {/* Cooldown overlay */}
            {dashCooldown > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${dashProgress * 100}%`,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </button>
          <span style={{ font: '600 11px/1 sans-serif', color: 'rgba(255, 255, 255, 0.85)' }}>
            DASH
          </span>
        </div>

        {/* Slap Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onPointerDown={() => {
              setIsSlapPressed(true);
              triggerSlap();
            }}
            onPointerUp={() => setIsSlapPressed(false)}
            onPointerCancel={() => setIsSlapPressed(false)}
            disabled={slapCooldown > 0}
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              backgroundColor: slapCooldown > 0 ? '#78350f' : '#dc2626',
              color: '#ffffff',
              border: '3px solid rgba(255, 255, 255, 0.4)',
              boxShadow: isSlapPressed
                ? '0 2px 4px rgba(0, 0, 0, 0.6)'
                : '0 8px 18px rgba(220, 38, 38, 0.45), inset 0 3px 5px rgba(255, 255, 255, 0.5)',
              transform: isSlapPressed ? 'scale(0.92)' : 'scale(1)',
              transition: 'transform 0.08s ease, background-color 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: slapCooldown > 0 ? 'not-allowed' : 'pointer',
              touchAction: 'none',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-label="Slap button"
          >
            {/* Boxing glove icon */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 8c0-2.2-1.8-4-4-4-1.2 0-2.3.5-3 1.4C11.3 4.5 10.2 4 9 4 6.8 4 5 5.8 5 8c0 1.2.5 2.3 1.4 3C5.5 11.7 5 12.8 5 14c0 2.2 1.8 4 4 4h6c2.2 0 4-1.8 4-4 0-1.2-.5-2.3-1.4-3 .9-.7 1.4-1.8 1.4-3zM8 19h8v2H8v-2z" />
            </svg>
            <span style={{ font: '900 11px/1 sans-serif', letterSpacing: '0.04em', marginTop: '2px' }}>
              SLAP!
            </span>

            {/* Cooldown overlay */}
            {slapCooldown > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${slapProgress * 100}%`,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </button>
          <span style={{ font: '700 11px/1 sans-serif', color: '#ffffff' }}>
            SERANG
          </span>
        </div>
      </div>
    </div>
  );
};
