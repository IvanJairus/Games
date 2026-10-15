import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('WallGo board tap to place', () => {
  // jsdom has no layout, so the board's own rect is stubbed to its real 570 unit size. Without it
  // every pointer coordinate fails to resolve to a slot and the tap never reaches the staging code.
  const BOARD_UNITS = 20 * 2 + 9 * 50 + 8 * 10;
  const CROSS_0_0 = { x: 20 + 50, y: 20 + 50 };

  const tapCross = () => {
    const svg = screen.getByTestId('wallgame-board-svg');
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: BOARD_UNITS,
        height: BOARD_UNITS,
        x: 0,
        y: 0,
        right: BOARD_UNITS,
        bottom: BOARD_UNITS,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerDown(svg, { clientX: CROSS_0_0.x, clientY: CROSS_0_0.y, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(svg, { clientX: CROSS_0_0.x, clientY: CROSS_0_0.y, pointerId: 1, isPrimary: true });
    fireEvent.click(screen.getByTestId('groove-cross-0-0'));
  };

  const renderEmpty = () => {
    const onPlaceWall = vi.fn();
    render(
      <Board
        gameState={createGame({ playerCount: 2, gridSize: 9 })}
        wallOrientation="H"
        onSelectMove={() => {}}
        onPlaceWall={onPlaceWall}
      />
    );
    return onPlaceWall;
  };

  it('stages on the first tap and does not place', () => {
    const onPlaceWall = renderEmpty();

    tapCross();

    expect(screen.getByTestId('staged-wall-preview')).toBeInTheDocument();
    expect(onPlaceWall).not.toHaveBeenCalled();
  });

  it('places on the second tap of the same slot', () => {
    const onPlaceWall = renderEmpty();

    tapCross();
    tapCross();

    expect(onPlaceWall).toHaveBeenCalledTimes(1);
    expect(onPlaceWall).toHaveBeenCalledWith({ orientation: 'H', x: 0, y: 0 });
  });

  it('places through the dock button after a single staging tap', () => {
    const onPlaceWall = renderEmpty();

    tapCross();
    fireEvent.click(screen.getByTestId('confirm-wall-btn'));

    expect(onPlaceWall).toHaveBeenCalledTimes(1);
    expect(onPlaceWall).toHaveBeenCalledWith({ orientation: 'H', x: 0, y: 0 });
  });

  it('gives every groove wing a 44px touch band', () => {
    renderEmpty();

    const cross = screen.getByTestId('groove-cross-0-0');
    expect(cross.getAttribute('width')).toBe('44');
    expect(cross.getAttribute('height')).toBe('44');

    const wings = cross.parentElement!.querySelectorAll('rect');
    // Order in the slot group: H left, H right, V top, V bottom, cross.
    expect(wings[0].getAttribute('height')).toBe('44');
    expect(wings[2].getAttribute('width')).toBe('44');
  });
});
