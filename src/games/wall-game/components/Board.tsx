import React, { useMemo, useState, useEffect } from 'react';
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

  const cellSize = 50;
  const grooveThickness = 10;
  const padding = 20;

  const totalSize = padding * 2 + gridSize * cellSize + (gridSize - 1) * grooveThickness;

  const getCellX = (x: number) => padding + x * (cellSize + grooveThickness);
  const getCellY = (y: number) => padding + y * (cellSize + grooveThickness);

  useEffect(() => {
    setStagedWall(null);
    setHoveredWall(null);
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

  const handleHoverSlot = (orientation: WallOrientation, wx: number, wy: number) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;
    setHoveredWall({ orientation, x: wx, y: wy });
  };

  const handleCrossMouseMove = (
    wx: number,
    wy: number,
    e: React.MouseEvent<SVGRectElement>
  ) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const orientation: WallOrientation = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V';
    setHoveredWall({ orientation, x: wx, y: wy });
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
      if (isStagedValid) {
        onPlaceWall(stagedWall);
        setStagedWall(null);
        setHoveredWall(null);
      }
      return;
    }

    const candidate: Wall = { orientation, x: wx, y: wy };
    setStagedWall(candidate);
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
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        onMouseLeave={() => setHoveredWall(null)}
        onClick={() => {
          if (stagedWall) setStagedWall(null);
        }}
        style={{
          width: '100%',
          maxWidth: '600px',
          height: 'auto',
          background: 'var(--bg-paper)',
          borderRadius: 'var(--r4)',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 4px 12px rgba(28, 25, 23, 0.06)',
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

        {walls.map((wall, index) => {
          const isH = wall.orientation === 'H';
          const wx = isH ? getCellX(wall.x) : getCellX(wall.x) + cellSize;
          const wy = isH ? getCellY(wall.y) + cellSize : getCellY(wall.y);
          const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
          const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

          return (
            <g key={`wall-${index}`} data-testid={`placed-wall-${wall.orientation}-${wall.x}-${wall.y}`}>
              <rect
                x={wx + 1}
                y={wy + 1}
                width={wWidth}
                height={wHeight}
                rx={1}
                fill="rgba(28, 25, 23, 0.15)"
              />
              <rect
                x={wx}
                y={wy}
                width={wWidth}
                height={wHeight}
                rx={1}
                fill="var(--gold-deep)"
                stroke="var(--gold)"
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
                    {/* Horizontal Wing (Left) with generous touch hit-box */}
                    <rect
                      x={getCellX(wx)}
                      y={iy - 6}
                      width={cellSize}
                      height={grooveThickness + 12}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Horizontal Wing (Right) with generous touch hit-box */}
                    <rect
                      x={ix + grooveThickness}
                      y={iy - 6}
                      width={cellSize}
                      height={grooveThickness + 12}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Vertical Wing (Top) with generous touch hit-box */}
                    <rect
                      x={ix - 6}
                      y={getCellY(wy)}
                      width={grooveThickness + 12}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Vertical Wing (Bottom) with generous touch hit-box */}
                    <rect
                      x={ix - 6}
                      y={iy + grooveThickness}
                      width={grooveThickness + 12}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Crossroads Center Box */}
                    <rect
                      x={ix - 6}
                      y={iy - 6}
                      width={grooveThickness + 12}
                      height={grooveThickness + 12}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      data-testid={`groove-cross-${wx}-${wy}`}
                      onMouseMove={(e) => handleCrossMouseMove(wx, wy, e)}
                      onClick={(e) => {
                        const curOri = stagedWall?.orientation || hoveredWall?.orientation || wallOrientation;
                        handleSlotClick(curOri, wx, wy, e);
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

            {/* Staged Wall Preview (Tap 1x stages, Tap 2x / button confirms) */}
            {stagedWall && (
              <g
                data-testid="staged-wall-preview"
                style={{ cursor: isStagedValid ? 'pointer' : 'not-allowed' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmStaged();
                }}
              >
                {(() => {
                  const isH = stagedWall.orientation === 'H';
                  const wx = isH ? getCellX(stagedWall.x) : getCellX(stagedWall.x) + cellSize;
                  const wy = isH ? getCellY(stagedWall.y) + cellSize : getCellY(stagedWall.y);
                  const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
                  const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

                  return (
                    <>
                      {/* Aura */}
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
                        opacity={0.9}
                        stroke={isStagedValid ? 'var(--gold-deep)' : '#991b1b'}
                        strokeWidth={1.5}
                        strokeDasharray={isStagedValid ? 'none' : '4 2'}
                      />
                      {/* Confirmation micro-badge */}
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
                  stroke="var(--gold)"
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
              font: '11px/1 var(--mono)',
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
              background: isStagedValid ? '#fffbeb' : '#fef2f2',
              borderRadius: 'var(--r2)',
              border: `1.5px solid ${isStagedValid ? 'var(--gold)' : '#f87171'}`,
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
                  padding: '6px 10px',
                  background: '#ffffff',
                  border: '1px solid var(--gold)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--gold)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  fontWeight: 700,
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
                  padding: '6px 10px',
                  background: '#ffffff',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--ink-dim)',
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
                background: isStagedValid ? 'var(--gold)' : '#e5e7eb',
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
              padding: '0 10px',
              background: 'var(--bg-stage)',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', color: 'var(--ink-dim)', textTransform: 'uppercase' }}>
                Orientasi:
              </span>
              <button
                type="button"
                data-testid="orientation-toggle"
                onClick={() => onOrientationChange?.(wallOrientation === 'H' ? 'V' : 'H')}
                disabled={activePlayer.wallsRemaining <= 0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  background: '#ffffff',
                  border: '1px solid var(--gold)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--gold)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: activePlayer.wallsRemaining > 0 ? 'pointer' : 'not-allowed',
                  opacity: activePlayer.wallsRemaining > 0 ? 1 : 0.5,
                }}
              >
                <RotateCw size={11} /> {wallOrientation === 'H' ? 'Horizontal (―)' : 'Vertikal (|)'}
              </button>
            </div>
            <span style={{ font: '10px/1 var(--mono)', color: 'var(--ink-faint)' }}>
              {activePlayer.wallsRemaining > 0 ? 'Sentuh celah untuk pratinjau' : 'Dinding habis'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
