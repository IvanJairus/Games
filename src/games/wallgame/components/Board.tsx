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
  disabled?: boolean;
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  wallOrientation,
  onSelectMove,
  onPlaceWall,
  disabled = false,
}) => {
  const { gridSize, corePosition, players, walls, activePlayerIndex, phase } = gameState;
  const activePlayer = players[activePlayerIndex];

  const [hoveredIntersection, setHoveredIntersection] = useState<{ x: number; y: number } | null>(null);

  // Board dimensions
  const cellSize = 50;
  const grooveThickness = 10;
  const padding = 20;

  const totalSize = padding * 2 + gridSize * cellSize + (gridSize - 1) * grooveThickness;

  const getCellX = (x: number) => padding + x * (cellSize + grooveThickness);
  const getCellY = (y: number) => padding + y * (cellSize + grooveThickness);

  // Valid moves for active player
  const validMoves = useMemo(() => {
    if (disabled || phase !== 'ACTION') return [];
    return getValidMoves(gameState);
  }, [disabled, phase, gameState]);

  const validMovesMap = useMemo(() => {
    const map = new Map<string, Position>();
    for (const m of validMoves) {
      map.set(`${m.x}:${m.y}`, m);
    }
    return map;
  }, [validMoves]);

  // Preview Wall Candidate
  const previewWallCandidate: Wall | null = useMemo(() => {
    if (disabled || phase !== 'ACTION' || !hoveredIntersection || activePlayer.wallsRemaining <= 0) {
      return null;
    }
    const candidate: Wall = {
      orientation: wallOrientation,
      x: hoveredIntersection.x,
      y: hoveredIntersection.y,
    };
    return candidate;
  }, [disabled, phase, hoveredIntersection, wallOrientation, activePlayer.wallsRemaining]);

  const isPreviewValid = useMemo(() => {
    if (!previewWallCandidate) return false;
    return isValidWallPlacement(gameState, previewWallCandidate);
  }, [gameState, previewWallCandidate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        style={{
          width: '100%',
          maxWidth: '620px',
          height: 'auto',
          background: 'var(--bg-stage)',
          borderRadius: 'var(--r4)',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 24px 38px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(217, 163, 94, 0.1)',
        }}
      >
        <defs>
          {/* Subtle gold glow filter */}
          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Board Background Border Texture */}
        <rect
          x={padding - 6}
          y={padding - 6}
          width={totalSize - (padding - 6) * 2}
          height={totalSize - (padding - 6) * 2}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />

        {/* Tiles / Grid Cells */}
        {Array.from({ length: gridSize }).map((_, y) =>
          Array.from({ length: gridSize }).map((_, x) => {
            const isCore = x === corePosition.x && y === corePosition.y;
            const isMoveValid = validMovesMap.has(`${x}:${y}`);
            const px = getCellX(x);
            const py = getCellY(y);

            return (
              <g
                key={`tile-${x}-${y}`}
                onClick={() => {
                  if (isMoveValid && !disabled) {
                    onSelectMove({ x, y });
                  }
                }}
                style={{ cursor: isMoveValid && !disabled ? 'pointer' : 'default' }}
              >
                {/* Tile Base */}
                <rect
                  x={px}
                  y={py}
                  width={cellSize}
                  height={cellSize}
                  rx={3}
                  fill={isCore ? 'rgba(212, 175, 55, 0.12)' : isMoveValid ? 'rgba(212, 175, 55, 0.08)' : 'var(--bg-tile)'}
                  stroke={isCore ? 'var(--gold)' : isMoveValid ? 'var(--gold-bright)' : 'rgba(217, 163, 94, 0.1)'}
                  strokeWidth={isCore ? 2 : isMoveValid ? 1.5 : 1}
                  strokeDasharray={isMoveValid ? '4 2' : 'none'}
                />

                {/* Golden Core Emblem in the center */}
                {isCore && (
                  <g pointerEvents="none">
                    <circle
                      cx={px + cellSize / 2}
                      cy={py + cellSize / 2}
                      r={14}
                      fill="none"
                      stroke="var(--gold)"
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                    />
                    <circle
                      cx={px + cellSize / 2}
                      cy={py + cellSize / 2}
                      r={6}
                      fill="var(--gold)"
                      opacity={0.85}
                    />
                    {/* Concentric Golden Ring */}
                    <circle
                      cx={px + cellSize / 2}
                      cy={py + cellSize / 2}
                      r={cellSize * 0.45}
                      fill="none"
                      stroke="var(--gold)"
                      strokeWidth="0.8"
                      opacity={0.35}
                    />
                  </g>
                )}

                {/* Valid Move Indicator Dot */}
                {isMoveValid && !isCore && (
                  <circle
                    cx={px + cellSize / 2}
                    cy={py + cellSize / 2}
                    r={4}
                    fill="var(--gold)"
                    opacity={0.8}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })
        )}

        {/* Existing Placed 2-Segment Walls */}
        {walls.map((wall, index) => {
          const isH = wall.orientation === 'H';
          const wx = isH ? getCellX(wall.x) : getCellX(wall.x) + cellSize;
          const wy = isH ? getCellY(wall.y) + cellSize : getCellY(wall.y);
          const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
          const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

          return (
            <g key={`wall-${index}`}>
              {/* Drop Shadow */}
              <rect
                x={wx + 1}
                y={wy + 1}
                width={wWidth}
                height={wHeight}
                rx={2}
                fill="rgba(0,0,0,0.7)"
              />
              {/* Polished Brass / Wood Wall Bar */}
              <rect
                x={wx}
                y={wy}
                width={wWidth}
                height={wHeight}
                rx={2}
                fill="url(#wallBrassGradient)"
                stroke="var(--gold)"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Wall Gradient */}
        <defs>
          <linearGradient id="wallBrassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d4af37" />
            <stop offset="50%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
        </defs>

        {/* Interactive Wall Placement Intersections (0 <= wx, wy < gridSize - 1) */}
        {phase === 'ACTION' && !disabled && activePlayer.wallsRemaining > 0 && (
          <g>
            {Array.from({ length: gridSize - 1 }).map((_, wy) =>
              Array.from({ length: gridSize - 1 }).map((_, wx) => {
                const ix = getCellX(wx) + cellSize;
                const iy = getCellY(wy) + cellSize;

                // Interactive target area around intersection
                return (
                  <rect
                    key={`slot-${wx}-${wy}`}
                    x={ix - cellSize / 2}
                    y={iy - cellSize / 2}
                    width={cellSize + grooveThickness}
                    height={cellSize + grooveThickness}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredIntersection({ x: wx, y: wy })}
                    onMouseLeave={() => setHoveredIntersection(null)}
                    onClick={() => {
                      if (previewWallCandidate && isPreviewValid) {
                        onPlaceWall(previewWallCandidate);
                        setHoveredIntersection(null);
                      }
                    }}
                  />
                );
              })
            )}

            {/* Ghost / Preview Wall Bar */}
            {previewWallCandidate && (
              <g pointerEvents="none">
                {(() => {
                  const isH = previewWallCandidate.orientation === 'H';
                  const wx = isH ? getCellX(previewWallCandidate.x) : getCellX(previewWallCandidate.x) + cellSize;
                  const wy = isH ? getCellY(previewWallCandidate.y) + cellSize : getCellY(previewWallCandidate.y);
                  const wWidth = isH ? cellSize * 2 + grooveThickness : grooveThickness;
                  const wHeight = isH ? grooveThickness : cellSize * 2 + grooveThickness;

                  return (
                    <rect
                      x={wx}
                      y={wy}
                      width={wWidth}
                      height={wHeight}
                      rx={2}
                      fill={isPreviewValid ? 'var(--gold)' : '#b42318'}
                      opacity={isPreviewValid ? 0.75 : 0.65}
                      stroke={isPreviewValid ? '#fff' : '#ef4444'}
                      strokeWidth={1}
                      strokeDasharray={isPreviewValid ? 'none' : '3 2'}
                    />
                  );
                })()}
              </g>
            )}
          </g>
        )}

        {/* Players Seals / Pawns */}
        {players.map((p, idx) => {
          const isActive = idx === activePlayerIndex && phase !== 'GAME_OVER';
          const px = getCellX(p.position.x) + cellSize / 2;
          const py = getCellY(p.position.y) + cellSize / 2;
          const radius = cellSize * 0.35;

          return (
            <g key={`pawn-${p.id}`} pointerEvents="none">
              {/* Active Player Breathing Aura */}
              {isActive && (
                <circle
                  cx={px}
                  cy={py}
                  r={radius + 7}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${px} ${py}`}
                    to={`360 ${px} ${py}`}
                    dur="12s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Shadow */}
              <circle
                cx={px}
                cy={py + 3}
                r={radius}
                fill="rgba(0,0,0,0.6)"
              />

              {/* Pawn Base */}
              <circle
                cx={px}
                cy={py}
                r={radius}
                fill={p.theme.hex}
                stroke={isActive ? '#ffffff' : p.theme.border}
                strokeWidth={isActive ? 2 : 1.5}
              />

              {/* Number Monogram */}
              <text
                x={px}
                y={py + 4}
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
