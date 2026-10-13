import React, { useMemo, useState } from 'react';
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
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  wallOrientation,
  onSelectMove,
  onPlaceWall,
  onOrientationChange,
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

  const isPreviewValid = useMemo(() => {
    if (!hoveredWall) return false;
    return isValidWallPlacement(gameState, hoveredWall);
  }, [gameState, hoveredWall]);

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
    if (isValidWallPlacement(gameState, candidate)) {
      onPlaceWall(candidate);
      setHoveredWall(null);
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
        data-testid="wallgame-board-svg"
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
                  data-testid={`tile-${x}-${y}`}
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

        {/* Wall Slots & Hover Preview */}
        {phase === 'ACTION' && !disabled && activePlayer.wallsRemaining > 0 && (
          <g data-testid="wall-slots-layer">
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

                    {/* Crossroads Center Box */}
                    <rect
                      x={ix - 3}
                      y={iy - 3}
                      width={grooveThickness + 6}
                      height={grooveThickness + 6}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      data-testid={`groove-cross-${wx}-${wy}`}
                      onMouseMove={(e) => handleCrossMouseMove(wx, wy, e)}
                      onClick={(e) => {
                        const curOri = hoveredWall?.orientation || wallOrientation;
                        handleSlotClick(curOri, wx, wy, e);
                      }}
                    />
                  </g>
                );
              })
            )}

            {/* Ghost Wall Bar (Clicking directly places the wall) */}
            {hoveredWall && (
              <g
                data-testid="ghost-wall-preview"
                style={{ cursor: isPreviewValid ? 'pointer' : 'not-allowed' }}
                onClick={(e) => {
                  handleSlotClick(hoveredWall.orientation, hoveredWall.x, hoveredWall.y, e);
                }}
              >
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
                      fill={isPreviewValid ? 'var(--gold)' : '#b42318'}
                      opacity={0.65}
                      stroke={isPreviewValid ? 'var(--gold-deep)' : '#8f1d14'}
                      strokeWidth={1.5}
                      strokeDasharray={isPreviewValid ? 'none' : '3 2'}
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
              data-testid={`move-candidate-${m.x}-${m.y}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
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
            <g key={`pawn-${p.id}`} pointerEvents="none" data-testid={`player-pawn-${p.id}`}>
              {/* Ring indicator on active pawn */}
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
