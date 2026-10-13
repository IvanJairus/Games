import React, { useMemo, useState } from 'react';
import {
  GameState,
  Position,
  Wall,
  getValidMoves,
  getWallKey,
  isValidWallPlacement,
} from '../../../../supabase/functions/_shared/wallgame/engine';

interface BoardProps {
  gameState: GameState;
  onSelectMove: (target: Position) => void;
  onPlaceWall: (wall: Wall) => void;
  disabled?: boolean;
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  onSelectMove,
  onPlaceWall,
  disabled = false,
}) => {
  const { gridSize, players, walls, activePlayerIndex, phase, territories } = gameState;
  const activePlayer = players[activePlayerIndex];

  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);

  // SVG Geometry Constants
  const cellSize = 54;
  const wallThickness = 10;
  const padding = 20;

  const totalWidth = gridSize * cellSize + (gridSize - 1) * wallThickness + padding * 2;
  const totalHeight = totalWidth;

  const getCellX = (x: number) => padding + x * (cellSize + wallThickness);
  const getCellY = (y: number) => padding + y * (cellSize + wallThickness);

  // Valid moves for active player
  const validMoves = useMemo(() => {
    if (disabled || phase !== 'MOVE') return [];
    return getValidMoves(gameState);
  }, [disabled, phase, gameState]);

  const validMovesSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of validMoves) {
      set.add(`${m.x}:${m.y}`);
    }
    return set;
  }, [validMoves]);

  // Existing walls lookup
  const existingWallsMap = useMemo(() => {
    const map = new Map<string, Wall>();
    for (const w of walls) {
      map.set(getWallKey(w), w);
    }
    return map;
  }, [walls]);

  // Map of claimed cells to owner player
  const cellOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of territories) {
      if (t.playerId !== null) {
        const owner = players.find((p) => p.id === t.playerId);
        if (owner) {
          for (const c of t.cells) {
            map.set(`${c.x}:${c.y}`, owner.color);
          }
        }
      }
    }
    return map;
  }, [territories, players]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{
          width: '100%',
          maxWidth: '640px',
          height: 'auto',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-color)',
        }}
      >
        <defs>
          <radialGradient id="activeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Board Background Grid Cells */}
        {Array.from({ length: gridSize }).map((_, y) =>
          Array.from({ length: gridSize }).map((_, x) => {
            const isMoveValid = validMovesSet.has(`${x}:${y}`);
            const cellOwnerColor = cellOwnerMap.get(`${x}:${y}`);
            const px = getCellX(x);
            const py = getCellY(y);

            return (
              <g
                key={`cell-${x}-${y}`}
                onClick={() => {
                  if (isMoveValid && !disabled) {
                    onSelectMove({ x, y });
                  }
                }}
                style={{ cursor: isMoveValid && !disabled ? 'pointer' : 'default' }}
              >
                {/* Cell Base */}
                <rect
                  x={px}
                  y={py}
                  width={cellSize}
                  height={cellSize}
                  rx={8}
                  fill={
                    cellOwnerColor
                      ? `${cellOwnerColor}28`
                      : isMoveValid
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'var(--bg-card)'
                  }
                  stroke={
                    isMoveValid
                      ? 'var(--accent-blue)'
                      : cellOwnerColor
                      ? `${cellOwnerColor}77`
                      : 'rgba(255, 255, 255, 0.05)'
                  }
                  strokeWidth={isMoveValid ? 2 : 1}
                  strokeDasharray={isMoveValid ? '4 2' : 'none'}
                />

                {/* Move Hint Dot */}
                {isMoveValid && (
                  <circle
                    cx={px + cellSize / 2}
                    cy={py + cellSize / 2}
                    r={7}
                    fill="var(--accent-cyan)"
                    opacity={0.85}
                  />
                )}
              </g>
            );
          })
        )}

        {/* Existing Walls */}
        {walls.map((wall, index) => {
          const isH = wall.orientation === 'H';
          const wx = isH ? getCellX(wall.x) : getCellX(wall.x) + cellSize;
          const wy = isH ? getCellY(wall.y) + cellSize : getCellY(wall.y);
          const wWidth = isH ? cellSize : wallThickness;
          const wHeight = isH ? wallThickness : cellSize;

          return (
            <rect
              key={`wall-placed-${index}`}
              x={wx}
              y={wy}
              width={wWidth}
              height={wHeight}
              rx={3}
              fill="#f43f5e"
              stroke="#be123c"
              strokeWidth={1}
            />
          );
        })}

        {/* Wall Placement Slots (Interactive when phase === 'WALL') */}
        {phase === 'WALL' && !disabled && (
          <g>
            {/* Horizontal wall slots */}
            {Array.from({ length: gridSize - 1 }).map((_, y) =>
              Array.from({ length: gridSize }).map((_, x) => {
                const wall: Wall = { orientation: 'H', x, y };
                const key = getWallKey(wall);
                if (existingWallsMap.has(key)) return null;

                const isValid = isValidWallPlacement(gameState, wall);
                if (!isValid) return null;

                const wx = getCellX(x);
                const wy = getCellY(y) + cellSize;
                const isHovered = hoveredWall?.orientation === 'H' && hoveredWall.x === x && hoveredWall.y === y;

                return (
                  <rect
                    key={`slot-h-${x}-${y}`}
                    x={wx}
                    y={wy}
                    width={cellSize}
                    height={wallThickness}
                    rx={3}
                    fill={isHovered ? (activePlayer?.color || 'var(--accent-cyan)') : 'rgba(255, 255, 255, 0.1)'}
                    opacity={isHovered ? 0.9 : 0.3}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={() => setHoveredWall(wall)}
                    onMouseLeave={() => setHoveredWall(null)}
                    onClick={() => {
                      setHoveredWall(null);
                      onPlaceWall(wall);
                    }}
                  />
                );
              })
            )}

            {/* Vertical wall slots */}
            {Array.from({ length: gridSize }).map((_, y) =>
              Array.from({ length: gridSize - 1 }).map((_, x) => {
                const wall: Wall = { orientation: 'V', x, y };
                const key = getWallKey(wall);
                if (existingWallsMap.has(key)) return null;

                const isValid = isValidWallPlacement(gameState, wall);
                if (!isValid) return null;

                const wx = getCellX(x) + cellSize;
                const wy = getCellY(y);
                const isHovered = hoveredWall?.orientation === 'V' && hoveredWall.x === x && hoveredWall.y === y;

                return (
                  <rect
                    key={`slot-v-${x}-${y}`}
                    x={wx}
                    y={wy}
                    width={wallThickness}
                    height={cellSize}
                    rx={3}
                    fill={isHovered ? (activePlayer?.color || 'var(--accent-cyan)') : 'rgba(255, 255, 255, 0.1)'}
                    opacity={isHovered ? 0.9 : 0.3}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={() => setHoveredWall(wall)}
                    onMouseLeave={() => setHoveredWall(null)}
                    onClick={() => {
                      setHoveredWall(null);
                      onPlaceWall(wall);
                    }}
                  />
                );
              })
            )}
          </g>
        )}

        {/* Players Pawns */}
        {players.map((p, idx) => {
          const isActive = idx === activePlayerIndex && phase !== 'GAME_OVER';
          const px = getCellX(p.position.x) + cellSize / 2;
          const py = getCellY(p.position.y) + cellSize / 2;
          const radius = cellSize * 0.34;

          return (
            <g key={`player-${p.id}`} style={{ transition: 'all 0.25s ease' }}>
              {/* Active Player Halo */}
              {isActive && (
                <circle
                  cx={px}
                  cy={py}
                  r={radius + 8}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  opacity={0.8}
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${px} ${py}`}
                    to={`360 ${px} ${py}`}
                    dur="10s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Player Pawn Body */}
              <circle
                cx={px}
                cy={py}
                r={radius}
                fill={p.color}
                stroke="#ffffff"
                strokeWidth={2.5}
                filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.5))"
              />

              {/* Player Index / Number Label */}
              <text
                x={px}
                y={py + 4}
                textAnchor="middle"
                fontSize={cellSize * 0.28}
                fontWeight="bold"
                fill="#ffffff"
                pointerEvents="none"
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
