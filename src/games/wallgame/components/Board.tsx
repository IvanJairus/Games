import React, { useMemo, useState } from 'react';
import {
  GameState,
  Position,
  Wall,
  WallOrientation,
  getValidMoves,
  isValidWallPlacement,
} from '../../../../supabase/functions/_shared/wallgame/engine';

interface BoardProps {
  gameState: GameState;
  wallOrientation: WallOrientation;
  onSelectMove: (target: Position) => void;
  onPlaceWall: (wall: Wall) => void;
  onOrientationChange?: (orientation: WallOrientation) => void;
  selectedWallCandidate?: Wall | null;
  onSelectWallCandidate?: (wall: Wall | null) => void;
  disabled?: boolean;
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  wallOrientation,
  onSelectMove,
  onPlaceWall,
  onOrientationChange,
  selectedWallCandidate,
  onSelectWallCandidate,
  disabled = false,
}) => {
  const { gridSize, corePosition, players, walls, activePlayerIndex, phase } = gameState;
  const activePlayer = players[activePlayerIndex];

  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);

  const cellSize = 50;
  const grooveThickness = 10;
  const padding = 20;

  const totalSize = padding * 2 + gridSize * cellSize + (gridSize - 1) * grooveThickness;

  const getCellX = (x: number) => padding + x * (cellSize + grooveThickness);
  const getCellY = (y: number) => padding + y * (cellSize + grooveThickness);

  const validMoves = useMemo(() => {
    if (disabled || phase !== 'ACTION') return [];
    return getValidMoves(gameState);
  }, [disabled, phase, gameState]);

  // Active wall candidate is either touch-selected (mobile) or mouse-hovered (desktop)
  const activeCandidate: Wall | null = useMemo(() => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) {
      return null;
    }
    return selectedWallCandidate || hoveredWall;
  }, [disabled, phase, activePlayer.wallsRemaining, selectedWallCandidate, hoveredWall]);

  const isCandidateValid = useMemo(() => {
    if (!activeCandidate) return false;
    return isValidWallPlacement(gameState, activeCandidate);
  }, [gameState, activeCandidate]);

  const handleHoverSlot = (orientation: WallOrientation, wx: number, wy: number) => {
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;
    setHoveredWall({ orientation, x: wx, y: wy });
    onOrientationChange?.(orientation);
  };

  const handleSlotClick = (
    orientation: WallOrientation,
    wx: number,
    wy: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (disabled || phase !== 'ACTION' || activePlayer.wallsRemaining <= 0) return;

    const candidate: Wall = { orientation, x: wx, y: wy };
    const isValid = isValidWallPlacement(gameState, candidate);
    const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    if (isTouchDevice) {
      // Mobile / touch screen: tap to preview & select, tap again at same spot to rotate
      if (selectedWallCandidate && selectedWallCandidate.x === wx && selectedWallCandidate.y === wy) {
        const nextOri: WallOrientation = selectedWallCandidate.orientation === 'H' ? 'V' : 'H';
        const toggled: Wall = { ...candidate, orientation: nextOri };
        onSelectWallCandidate?.(toggled);
        onOrientationChange?.(nextOri);
      } else {
        onSelectWallCandidate?.(candidate);
        onOrientationChange?.(orientation);
      }
    } else {
      // Desktop: single-click direct placement if valid
      if (isValid) {
        onPlaceWall(candidate);
        setHoveredWall(null);
        onSelectWallCandidate?.(null);
      }
    }
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
    onOrientationChange?.(orientation);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        onMouseLeave={() => setHoveredWall(null)}
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
      >
        {/* Outer border guide */}
        <rect
          x={padding - 6}
          y={padding - 6}
          width={totalSize - (padding - 6) * 2}
          height={totalSize - (padding - 6) * 2}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />

        {/* Base Board Tiles */}
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
                />

                {/* Central Golden Core emblem */}
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

        {/* Placed 2-Segment Walls */}
        {walls.map((wall, index) => {
          const isH = wall.orientation === 'H';
          const wx = isH ? getCellX(wall.x) : getCellX(wall.x) + cellSize;
          const wy = isH ? getCellY(wall.y) + cellSize : getCellY(wall.y);
          const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
          const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

          return (
            <g key={`wall-${index}`}>
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

        {/* Wall Slots & Hover Preview (Tightly bounded to groove so tiles remain accessible) */}
        {phase === 'ACTION' && !disabled && activePlayer.wallsRemaining > 0 && (
          <g>
            {Array.from({ length: gridSize - 1 }).map((_, wy) =>
              Array.from({ length: gridSize - 1 }).map((_, wx) => {
                const ix = getCellX(wx) + cellSize;
                const iy = getCellY(wy) + cellSize;

                return (
                  <g key={`groove-slot-${wx}-${wy}`}>
                    {/* Horizontal Wing (Left) */}
                    <rect
                      x={getCellX(wx)}
                      y={iy - 3}
                      width={cellSize}
                      height={grooveThickness + 6}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Horizontal Wing (Right) */}
                    <rect
                      x={ix + grooveThickness}
                      y={iy - 3}
                      width={cellSize}
                      height={grooveThickness + 6}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('H', wx, wy)}
                      onClick={(e) => handleSlotClick('H', wx, wy, e)}
                    />

                    {/* Vertical Wing (Top) */}
                    <rect
                      x={ix - 3}
                      y={getCellY(wy)}
                      width={grooveThickness + 6}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Vertical Wing (Bottom) */}
                    <rect
                      x={ix - 3}
                      y={iy + grooveThickness}
                      width={grooveThickness + 6}
                      height={cellSize}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => handleHoverSlot('V', wx, wy)}
                      onClick={(e) => handleSlotClick('V', wx, wy, e)}
                    />

                    {/* Crossroads Center Box (Dynamic Angle Follower & Click-to-Rotate) */}
                    <rect
                      x={ix - 3}
                      y={iy - 3}
                      width={grooveThickness + 6}
                      height={grooveThickness + 6}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseMove={(e) => handleCrossMouseMove(wx, wy, e)}
                      onClick={(e) => {
                        const curOri = activeCandidate?.orientation || wallOrientation;
                        handleSlotClick(curOri, wx, wy, e);
                      }}
                    />
                  </g>
                );
              })
            )}

            {/* Ghost Wall Bar with Click-to-Rotate Affordance */}
            {activeCandidate && (
              <g
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const nextOri: WallOrientation = activeCandidate.orientation === 'H' ? 'V' : 'H';
                  const toggled: Wall = { ...activeCandidate, orientation: nextOri };
                  if (onSelectWallCandidate) {
                    onSelectWallCandidate(toggled);
                  } else {
                    setHoveredWall(toggled);
                  }
                  onOrientationChange?.(nextOri);
                }}
              >
                {(() => {
                  const isH = activeCandidate.orientation === 'H';
                  const wx = isH ? getCellX(activeCandidate.x) : getCellX(activeCandidate.x) + cellSize;
                  const wy = isH ? getCellY(activeCandidate.y) + cellSize : getCellY(activeCandidate.y);
                  const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
                  const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

                  return (
                    <rect
                      x={wx}
                      y={wy}
                      width={wWidth}
                      height={wHeight}
                      rx={1}
                      fill={isCandidateValid ? 'var(--gold)' : '#b42318'}
                      opacity={0.65}
                      stroke={isCandidateValid ? 'var(--gold-deep)' : '#8f1d14'}
                      strokeWidth={1.5}
                      strokeDasharray={isCandidateValid ? 'none' : '3 2'}
                    />
                  );
                })()}
              </g>
            )}
          </g>
        )}

        {/* Interactive Move Candidate Squares (Top Layer: 100% full-area clickable) */}
        {validMoves.map((m) => {
          const px = getCellX(m.x);
          const py = getCellY(m.y);
          const isCore = m.x === corePosition.x && m.y === corePosition.y;

          return (
            <g
              key={`candidate-${m.x}-${m.y}`}
              className="move-candidate-group"
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  onSelectWallCandidate?.(null);
                  setHoveredWall(null);
                  onSelectMove(m);
                }
              }}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
            >
              {/* Full tile hit area and visual indicator */}
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

              {/* Pip indicator */}
              {!isCore && (
                <circle
                  cx={px + cellSize / 2}
                  cy={py + cellSize / 2}
                  r={4}
                  fill="var(--gold)"
                  pointerEvents="none"
                />
              )}

              {/* Central Golden Core win emblem overlay */}
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
            <g key={`pawn-${p.id}`} pointerEvents="none">
              {/* Static ring indicator on active pawn */}
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

              {/* Pawn Base */}
              <circle
                cx={px}
                cy={py}
                r={radius}
                fill={p.theme.hex}
                stroke={p.theme.border}
                strokeWidth={1.5}
              />

              {/* Number Label */}
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
    </div>
  );
};
