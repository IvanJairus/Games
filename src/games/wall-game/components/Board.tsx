import React, { useMemo, useState, useEffect, useRef } from 'react';
import { RotateCw, Check, X } from 'lucide-react';
import {
  GameState,
  Position,
  Wall,
  WallOrientation,
  getValidMoves,
  isValidWallPlacement,
} from '../engine';

export interface BoardProps {
  gameState: GameState;
  wallOrientation: WallOrientation;
  onSelectMove: (target: Position) => void;
  onPlaceWall: (wall: Wall) => void;
  onOrientationChange?: (orientation: WallOrientation) => void;
  disabled?: boolean;
  statusNotice?: string;
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  wallOrientation,
  onSelectMove,
  onPlaceWall,
  onOrientationChange,
  disabled = false,
  statusNotice,
}) => {
  const { gridSize, corePosition, players, walls, activePlayerIndex, phase } = gameState;
  const activePlayer = players[activePlayerIndex];

  const [stagedWall, setStagedWall] = useState<Wall | null>(null);
  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartClientPos = useRef<{ x: number; y: number } | null>(null);

  // A tap raises pointerdown and click in one gesture, so the board cannot tell "second tap to
  // confirm" from "first tap to stage" without a gesture id.
  const gestureRef = useRef(0);
  const stagedByGestureRef = useRef(-1);

  const cellSize = 50;
  const grooveThickness = 10;
  const padding = 20;
  const touchTarget = 44;
  const touchPad = (touchTarget - grooveThickness) / 2;

  const totalSize = padding * 2 + gridSize * cellSize + (gridSize - 1) * grooveThickness;

  const getCellX = (x: number) => padding + x * (cellSize + grooveThickness);
  const getCellY = (y: number) => padding + y * (cellSize + grooveThickness);

  useEffect(() => {
    setStagedWall(null);
    setHoveredWall(null);
    isDraggingRef.current = false;
  }, [activePlayerIndex, phase, disabled]);

  const validMoves = useMemo(() => {
    if (disabled || phase !== 'ACTION') return [];
    return getValidMoves(gameState);
  }, [disabled, phase, gameState]);

  const isStagedValid = useMemo(() => {
    if (!stagedWall) return false;
    return isValidWallPlacement(gameState, stagedWall);
  }, [gameState, stagedWall]);

  const isHoverValid = useMemo(() => {
    if (!hoveredWall) return false;
    return isValidWallPlacement(gameState, hoveredWall);
  }, [gameState, hoveredWall]);

  const getSlotFromPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const scale = totalSize / rect.width;
    const svgX = (clientX - rect.left) * scale;
    const svgY = (clientY - rect.top) * scale;

    const step = cellSize + grooveThickness;
    const rawWx = Math.round((svgX - padding - cellSize - grooveThickness / 2) / step);
    const rawWy = Math.round((svgY - padding - cellSize - grooveThickness / 2) / step);

    const wx = Math.max(0, Math.min(gridSize - 2, rawWx));
    const wy = Math.max(0, Math.min(gridSize - 2, rawWy));

    return { x: wx, y: wy };
  };

  const handleHoverSlot = (orientation: WallOrientation, wx: number, wy: number) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0 || isDraggingRef.current) return;
    setHoveredWall({ orientation, x: wx, y: wy });
  };

  const handleCrossMouseMove = (
    wx: number,
    wy: number,
    e: React.MouseEvent<SVGRectElement>
  ) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0 || isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const orientation: WallOrientation = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V';
    setHoveredWall({ orientation, x: wx, y: wy });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;
    const target = e.target as Element;
    if (target.closest('.move-candidate-group')) return;

    const slot = getSlotFromPointer(e.clientX, e.clientY);
    if (!slot) return;

    const gesture = ++gestureRef.current;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartClientPos.current = { x: e.clientX, y: e.clientY };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore in environments without pointer capture
    }

    // Leaving a preview that already sits on this slot untouched is what lets the following click
    // recognise itself as the confirming tap rather than the one that staged the preview.
    if (stagedWall && stagedWall.x === slot.x && stagedWall.y === slot.y) return;

    stagedByGestureRef.current = gesture;
    setStagedWall({ orientation: stagedWall?.orientation || wallOrientation, x: slot.x, y: slot.y });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    const start = dragStartClientPos.current;
    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > 8) {
        dragMovedRef.current = true;
      }
    }

    const slot = getSlotFromPointer(e.clientX, e.clientY);
    if (!slot) return;

    const orientation = stagedWall?.orientation || wallOrientation;
    if (stagedWall && stagedWall.x === slot.x && stagedWall.y === slot.y && stagedWall.orientation === orientation) {
      return;
    }

    // Gliding the preview to a new slot is still the same gesture, so it must not arm a confirm.
    stagedByGestureRef.current = gestureRef.current;
    setStagedWall({ orientation, x: slot.x, y: slot.y });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleSlotClick = (
    orientation: WallOrientation,
    wx: number,
    wy: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;

    if (
      stagedWall &&
      stagedWall.x === wx &&
      stagedWall.y === wy &&
      stagedWall.orientation === orientation
    ) {
      if (stagedByGestureRef.current !== gestureRef.current && isStagedValid) {
        onPlaceWall(stagedWall);
        setStagedWall(null);
        setHoveredWall(null);
      }
      return;
    }

    stagedByGestureRef.current = gestureRef.current;
    setStagedWall({ orientation, x: wx, y: wy });
    onOrientationChange?.(orientation);
  };

  const handleConfirmStaged = () => {
    if (!stagedWall || disabled || phase !== 'ACTION') return;
    if (isStagedValid) {
      onPlaceWall(stagedWall);
      setStagedWall(null);
      setHoveredWall(null);
    }
  };

  // Tapping the preview happens to raise a pointerdown on the board first, so the gesture guard
  // belongs here and not in handleConfirmStaged: the dock button must always confirm.
  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stagedByGestureRef.current === gestureRef.current) return;
    handleConfirmStaged();
  };

  const handleRotateStaged = () => {
    if (!stagedWall) return;
    const nextOri: WallOrientation = stagedWall.orientation === 'H' ? 'V' : 'H';
    const updated: Wall = { ...stagedWall, orientation: nextOri };
    setStagedWall(updated);
    onOrientationChange?.(nextOri);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || phase !== 'ACTION') return;
      if (e.key === 'r' || e.key === 'R' || e.code === 'Space') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (stagedWall) {
          handleRotateStaged();
        } else {
          onOrientationChange?.(wallOrientation === 'H' ? 'V' : 'H');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, phase, stagedWall, wallOrientation, onOrientationChange]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={() => setHoveredWall(null)}
        onClick={() => {
          if (!dragMovedRef.current && stagedWall) {
            // Clicking empty canvas dismisses preview if not dragging
          }
        }}
        style={{
          width: '100%',
          maxWidth: '600px',
          height: 'auto',
          background: 'var(--bg-paper)',
          borderRadius: 'var(--r4)',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 4px 12px rgba(28, 25, 23, 0.06)',
          touchAction: disabled || phase !== 'ACTION' ? 'auto' : 'none',
        }}
        role="region"
        aria-label="Papan permainan WallGo"
        data-testid="wallgame-board-svg"
      >
        <rect
          x={padding - 6}
          y={padding - 6}
          width={totalSize - (padding - 6) * 2}
          height={totalSize - (padding - 6) * 2}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />

        {Array.from({ length: gridSize }).map((_, y) =>
          Array.from({ length: gridSize }).map((_, x) => {
            const isCore = x === corePosition.x && y === corePosition.y;
            const px = getCellX(x);
            const py = getCellY(y);

            return (
              <g key={`tile-${x}-${y}`}>
                <rect
                  x={px}
                  y={py}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={isCore ? 'var(--core-bg)' : 'var(--bg-tile)'}
                  stroke={isCore ? 'var(--core-border)' : 'var(--line)'}
                  strokeWidth={isCore ? 2 : 1}
                  data-testid={`tile-${x}-${y}`}
                />

                {isCore && (
                  <g pointerEvents="none">
                    <circle
                      cx={px + cellSize / 2}
                      cy={py + cellSize / 2}
                      r={14}
                      fill="none"
                      stroke="var(--core-border)"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={px + cellSize / 2}
                      cy={py + cellSize / 2}
                      r={5}
                      fill="var(--core-border)"
                    />
                  </g>
                )}
              </g>
            );
          })
        )}

        {/* Placed 2-Segment Walls, painted in the colour of the seat that placed them */}
        {walls.map((wall, index) => {
          const isH = wall.orientation === 'H';
          const wx = isH ? getCellX(wall.x) : getCellX(wall.x) + cellSize;
          const wy = isH ? getCellY(wall.y) + cellSize : getCellY(wall.y);
          const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
          const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;
          const owner = wall.owner === undefined ? undefined : players.find((p) => p.id === wall.owner);

          return (
            <g key={`wall-${index}`} data-testid={`placed-wall-${wall.orientation}-${wall.x}-${wall.y}`}>
              <rect
                x={wx + 1}
                y={wy + 1}
                width={wWidth}
                height={wHeight}
                rx={1}
                fill="var(--wall-placed-shadow, rgba(15, 23, 42, 0.18))"
              />
              <rect
                x={wx}
                y={wy}
                width={wWidth}
                height={wHeight}
                rx={1}
                fill={owner ? owner.theme.hex : 'var(--wall-unowned, #78716c)'}
                stroke="var(--wall-keyline, rgba(28, 25, 23, 0.45))"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {phase === 'ACTION' && !disabled && activePlayer.wallsRemaining > 0 && (
          <g data-testid="wall-slots-layer">
            {Array.from({ length: gridSize - 1 }).map((_, wy) =>
              Array.from({ length: gridSize - 1 }).map((_, wx) => {
                const ix = getCellX(wx) + cellSize;
                const iy = getCellY(wy) + cellSize;

                return (
                  <g key={`groove-slot-${wx}-${wy}`}>
                    {/* Horizontal Wing (Left) with a 44px touch band */}
                    <rect
                      x={getCellX(wx)}
                      y={iy - touchPad}
                      width={cellSize}
                      height={touchTarget}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Horizontal Wing (Right) with a 44px touch band */}
                    <rect
                      x={ix + grooveThickness}
                      y={iy - touchPad}
                      width={cellSize}
                      height={touchTarget}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Vertical Wing (Top) with a 44px touch band */}
                    <rect
                      x={ix - touchPad}
                      y={getCellY(wy)}
                      width={touchTarget}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Vertical Wing (Bottom) with a 44px touch band */}
                    <rect
                      x={ix - touchPad}
                      y={iy + grooveThickness}
                      width={touchTarget}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Crossroads box: covers both bands near the junction and picks the axis the
                         finger is furthest along, so a tap never depends on DOM stacking order */}
                    <rect
                      x={ix - touchPad}
                      y={iy - touchPad}
                      width={touchTarget}
                      height={touchTarget}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      data-testid={`groove-cross-${wx}-${wy}`}
                      onMouseMove={(e) => handleCrossMouseMove(wx, wy, e)}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dx = Math.abs(e.clientX - (rect.left + rect.width / 2));
                        const dy = Math.abs(e.clientY - (rect.top + rect.height / 2));
                        handleSlotClick(dx >= dy ? 'H' : 'V', wx, wy, e);
                      }}
                    />
                  </g>
                );
              })
            )}

            {/* Desktop mouse hover ghost (when nothing is staged) */}
            {!stagedWall && hoveredWall && (
              <g pointerEvents="none" opacity={0.45}>
                {(() => {
                  const isH = hoveredWall.orientation === 'H';
                  const wx = isH ? getCellX(hoveredWall.x) : getCellX(hoveredWall.x) + cellSize;
                  const wy = isH ? getCellY(hoveredWall.y) + cellSize : getCellY(hoveredWall.y);
                  const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
                  const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

                  return (
                    <rect
                      x={wx}
                      y={wy}
                      width={wWidth}
                      height={wHeight}
                      rx={1}
                      fill={isHoverValid ? 'var(--gold)' : '#dc2626'}
                      stroke={isHoverValid ? 'var(--gold-deep)' : '#991b1b'}
                      strokeWidth={1}
                      strokeDasharray="3 2"
                    />
                  );
                })()}
              </g>
            )}

            {/* Staged Wall Preview (Tap to stage, Drag to glide, Tap 2x or button to confirm) */}
            {stagedWall && (
              <g
                data-testid="staged-wall-preview"
                style={{ cursor: isStagedValid ? 'grab' : 'not-allowed' }}
                onClick={handlePreviewClick}
              >
                {(() => {
                  const isH = stagedWall.orientation === 'H';
                  const wx = isH ? getCellX(stagedWall.x) : getCellX(stagedWall.x) + cellSize;
                  const wy = isH ? getCellY(stagedWall.y) + cellSize : getCellY(stagedWall.y);
                  const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
                  const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

                  return (
                    <>
                      {/* Aura glow */}
                      <rect
                        x={wx - 3}
                        y={wy - 3}
                        width={wWidth + 6}
                        height={wHeight + 6}
                        rx={3}
                        fill={isStagedValid ? 'rgba(217, 119, 6, 0.25)' : 'rgba(220, 38, 38, 0.22)'}
                      />
                      {/* Wall Body */}
                      <rect
                        x={wx}
                        y={wy}
                        width={wWidth}
                        height={wHeight}
                        rx={1.5}
                        fill={isStagedValid ? 'var(--gold)' : '#dc2626'}
                        opacity={0.92}
                        stroke={isStagedValid ? 'var(--gold-deep)' : '#991b1b'}
                        strokeWidth={1.5}
                        strokeDasharray={isStagedValid ? 'none' : '4 2'}
                      />
                      {/* Confirmation micro-badge / drag hint */}
                      {isStagedValid && (
                        <text
                          x={wx + wWidth / 2}
                          y={wy + wHeight / 2 + 3}
                          textAnchor="middle"
                          fontSize={isH ? 9 : 8}
                          fontFamily="var(--mono)"
                          fontWeight="700"
                          fill="#ffffff"
                          pointerEvents="none"
                        >
                          {isH ? '✓ TAP LAGI' : '✓'}
                        </text>
                      )}
                    </>
                  );
                })()}
              </g>
            )}
          </g>
        )}

        {/* Valid pawn moves (always highest layer and clickable) */}
        {validMoves.map((m) => {
          const px = getCellX(m.x);
          const py = getCellY(m.y);
          const isCore = m.x === corePosition.x && m.y === corePosition.y;

          return (
            <g
              key={`candidate-${m.x}-${m.y}`}
              className="move-candidate-group"
              data-testid={`move-candidate-${m.x}-${m.y}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  setStagedWall(null);
                  setHoveredWall(null);
                  onSelectMove(m);
                }
              }}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
            >
              <rect
                x={px}
                y={py}
                width={cellSize}
                height={cellSize}
                rx={3}
                className="move-candidate-tile"
                fill={isCore ? 'var(--core-bg)' : '#fef9c3'}
                stroke="var(--gold)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />

              {!isCore && (
                <circle
                  cx={px + cellSize / 2}
                  cy={py + cellSize / 2}
                  r={4}
                  fill="var(--gold)"
                  pointerEvents="none"
                />
              )}

              {isCore && (
                <g pointerEvents="none">
                  <circle
                    cx={px + cellSize / 2}
                    cy={py + cellSize / 2}
                    r={14}
                    fill="none"
                    stroke="var(--core-border)"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={px + cellSize / 2}
                    cy={py + cellSize / 2}
                    r={5}
                    fill="var(--core-border)"
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Player Pawns */}
        {players.map((p, idx) => {
          const isActive = idx === activePlayerIndex && phase !== 'GAME_OVER';
          const px = getCellX(p.position.x) + cellSize / 2;
          const py = getCellY(p.position.y) + cellSize / 2;
          const radius = cellSize * 0.34;

          return (
            <g key={`pawn-${p.id}`} pointerEvents="none" data-testid={`player-pawn-${p.id}`}>
              {isActive && (
                <circle
                  cx={px}
                  cy={py}
                  r={radius + 4}
                  fill="none"
                  stroke={p.theme.hex}
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              )}

              <circle
                cx={px}
                cy={py}
                r={radius}
                fill={p.theme.hex}
                stroke={p.theme.border}
                strokeWidth={1.5}
              />

              <text
                x={px}
                y={py + 3.5}
                textAnchor="middle"
                fontSize={cellSize * 0.28}
                fontFamily="var(--mono)"
                fontWeight="700"
                fill={p.theme.text}
              >
                {p.id + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Rock-solid Action Dock: Invariant 44px height to eliminate all layout jumping */}
      <div
        data-testid="board-action-dock"
        style={{
          width: '100%',
          maxWidth: '600px',
          height: '44px',
          minHeight: '44px',
          margin: '10px 0 0 0',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {disabled || phase !== 'ACTION' ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-stage)',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line)',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              color: 'var(--ink-faint)',
            }}
          >
            {statusNotice || 'Menunggu giliran lawan...'}
          </div>
        ) : stagedWall ? (
          <div
            data-testid="staged-wall-bar"
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              background: isStagedValid ? 'var(--gold-tint)' : '#fef2f2',
              borderRadius: 'var(--r2)',
              border: `1px solid ${isStagedValid ? 'var(--gold-border)' : '#f87171'}`,
              boxSizing: 'border-box',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                data-testid="rotate-staged-wall-btn"
                onClick={handleRotateStaged}
                title="Putar orientasi dinding"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: '#ffffff',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RotateCw size={11} /> {stagedWall.orientation === 'H' ? 'Vertikal (|)' : 'Horizontal (―)'}
              </button>
              <button
                type="button"
                data-testid="cancel-staged-wall-btn"
                onClick={() => setStagedWall(null)}
                title="Batal pratinjau"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: '#ffffff',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--ink-faint)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <X size={11} /> Batal
              </button>
            </div>

            <button
              type="button"
              data-testid="confirm-wall-btn"
              disabled={!isStagedValid}
              onClick={handleConfirmStaged}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 14px',
                background: isStagedValid ? 'var(--ink)' : '#e5e7eb',
                color: isStagedValid ? '#ffffff' : '#9ca3af',
                border: 'none',
                borderRadius: 'var(--r2)',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: isStagedValid ? 'pointer' : 'not-allowed',
              }}
            >
              <Check size={12} /> {isStagedValid ? 'Pasang Dinding' : 'Jalan Terkunci'}
            </button>
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              background: 'var(--bg-stage)',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line)',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              data-testid="orientation-toggle"
              onClick={() => onOrientationChange?.(wallOrientation === 'H' ? 'V' : 'H')}
              disabled={activePlayer.wallsRemaining <= 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                background: '#ffffff',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r2)',
                color: 'var(--ink)',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: activePlayer.wallsRemaining > 0 ? 'pointer' : 'not-allowed',
                opacity: activePlayer.wallsRemaining > 0 ? 1 : 0.5,
              }}
            >
              <RotateCw size={11} /> Orientasi: {wallOrientation === 'H' ? 'Horizontal (―)' : 'Vertikal (|)'}
            </button>

            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                color: 'var(--ink-faint)',
                letterSpacing: '.01em',
              }}
            >
              {activePlayer.wallsRemaining > 0
                ? 'Tap celah untuk pratinjau, tap lagi atau tahan-geser untuk mengatur'
                : 'Dinding habis'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
