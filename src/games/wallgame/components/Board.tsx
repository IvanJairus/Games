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

  const validMovesMap = useMemo(() => {
    const map = new Map<string, Position>();
    for (const m of validMoves) {
      map.set(`${m.x}:${m.y}`, m);
    }
    return map;
  }, [validMoves]);

  const previewWallCandidate: Wall | null = useMemo(() => {
    if (disabled || phase !== 'ACTION' || !hoveredIntersection || activePlayer.wallsRemaining <= 0) {
      return null;
    }
    return {
      orientation: wallOrientation,
      x: hoveredIntersection.x,
      y: hoveredIntersection.y,
    };
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

        {/* Board Tiles */}
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
                <rect
                  x={px}
                  y={py}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={isCore ? 'var(--core-bg)' : isMoveValid ? '#fef9c3' : 'var(--bg-tile)'}
                  stroke={isCore ? 'var(--core-border)' : isMoveValid ? 'var(--gold)' : 'var(--line)'}
                  strokeWidth={isCore ? 2 : isMoveValid ? 1.5 : 1}
                  strokeDasharray={isMoveValid ? '3 2' : 'none'}
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

                {/* Step indicator dot */}
                {isMoveValid && !isCore && (
                  <circle
                    cx={px + cellSize / 2}
                    cy={py + cellSize / 2}
                    r={3.5}
                    fill="var(--gold)"
                    pointerEvents="none"
                  />
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

        {/* Wall Slots & Hover Preview */}
        {phase === 'ACTION' && !disabled && activePlayer.wallsRemaining > 0 && (
          <g>
            {Array.from({ length: gridSize - 1 }).map((_, wy) =>
              Array.from({ length: gridSize - 1 }).map((_, wx) => {
                const ix = getCellX(wx) + cellSize;
                const iy = getCellY(wy) + cellSize;

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

            {/* Ghost Wall Bar */}
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
                      rx={1}
                      fill={isPreviewValid ? 'var(--gold)' : '#b42318'}
                      opacity={0.5}
                      stroke={isPreviewValid ? 'var(--gold-deep)' : '#8f1d14'}
                      strokeWidth={1}
                      strokeDasharray={isPreviewValid ? 'none' : '3 2'}
                    />
                  );
                })()}
              </g>
            )}
          </g>
        )}

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
