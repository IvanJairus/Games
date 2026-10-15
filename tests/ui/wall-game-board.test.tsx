import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Board } from '@/games/wall-game/components/Board';
import { createGame, GameState, Wall, PLAYER_GOLD_THEMES } from '@/games/wall-game/engine';

const KEYLINE = 'var(--wall-keyline, rgba(28, 25, 23, 0.45))';
const UNOWNED = 'var(--wall-unowned, #78716c)';

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

    expect(wallPaint('placed-wall-H-1-1')).toEqual({ fill: '#1d4ed8', stroke: KEYLINE });
  });

  it('keeps a wall without an owner neutral, for rooms saved before the field existed', () => {
    renderBoard([{ orientation: 'V', x: 5, y: 5 }]);

    expect(wallPaint('placed-wall-V-5-5')).toEqual({ fill: UNOWNED, stroke: KEYLINE });
  });

  it('keeps the unowned colour clear of every player theme', () => {
    const unowned = '#78716c';
    const palette = PLAYER_GOLD_THEMES.flatMap((theme) => [theme.hex, theme.border]);

    expect(palette).not.toContain(unowned);
    // Batu Basalt is the near-miss: its theme used to be the unowned colour itself.
    expect(unowned).not.toBe(PLAYER_GOLD_THEMES[5].hex);
  });
});
