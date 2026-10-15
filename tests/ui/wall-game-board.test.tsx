import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Board } from '@/games/wall-game/components/Board';
import { createGame, GameState, Wall } from '@/games/wall-game/engine';

const wallPaint = (testid: string) => {
  const rects = screen.getByTestId(testid).querySelectorAll('rect');
  const visible = rects[1];
  return { fill: visible.getAttribute('fill'), stroke: visible.getAttribute('stroke') };
};

const renderBoard = (walls: Wall[]) =>
  render(
    <Board
      gameState={{ ...createGame({ playerCount: 2, gridSize: 9 }), walls } as GameState}
      wallOrientation="H"
      onSelectMove={() => {}}
      onPlaceWall={() => {}}
    />
  );

describe('WallGo board wall ownership', () => {
  it('paints a wall in the theme of the seat that placed it', () => {
    renderBoard([{ orientation: 'H', x: 1, y: 1, owner: 1 }]);

    expect(wallPaint('placed-wall-H-1-1')).toEqual({ fill: '#1d4ed8', stroke: '#1e40af' });
  });

  it('keeps a wall without an owner neutral, for rooms saved before the field existed', () => {
    renderBoard([{ orientation: 'V', x: 5, y: 5 }]);

    expect(wallPaint('placed-wall-V-5-5')).toEqual({
      fill: 'var(--wall-placed, #1e293b)',
      stroke: 'var(--wall-placed-border, #334155)',
    });
  });
});
