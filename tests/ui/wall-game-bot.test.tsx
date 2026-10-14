import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WallgameLocal } from '@/games/wall-game/pages/WallgameLocal';

// Matches the engine's recommended board: 9x9 up to three seats, 11x11 for four.
const coreOf = (playerCount: number) => {
  const size = playerCount <= 3 ? 9 : 11;
  return { x: Math.floor(size / 2), y: Math.floor(size / 2) };
};

const candidates = () =>
  screen
    .queryAllByTestId(/^move-candidate-\d+-\d+$/)
    .map((el) => el.getAttribute('data-testid')!.replace('move-candidate-', '').split('-').map(Number));

const candidateAt = (x: number, y: number) => screen.queryByTestId(`move-candidate-${x}-${y}`);

const distance = (seat: number) => {
  const text = screen.getByTestId(`roster-player-${seat}`).textContent ?? '';
  return parseInt(text.match(/Jarak:\s*(\d+)/)![1], 10);
};

const banner = () => screen.getByTestId('turn-banner').textContent ?? '';
const turn = () => parseInt(banner().match(/Putaran #(\d+)/)![1], 10);
const isHumanTurn = () => banner().includes('Giliran Aktif');

const letBotMove = () =>
  act(() => {
    vi.advanceTimersByTime(600);
  });

const waitHumanTurn = (max = 10) => {
  for (let i = 0; i < max && !isHumanTurn(); i++) letBotMove();
};

const moveHuman = (core: { x: number; y: number }) => {
  const cells = candidates();
  if (cells.length === 0) return false;
  const [x, y] = cells.reduce((best, cell) => {
    const d = (c: number[]) => Math.abs(c[0] - core.x) + Math.abs(c[1] - core.y);
    return d(cell) < d(best) ? cell : best;
  });
  fireEvent.click(candidateAt(x, y)!);
  return true;
};

const startWithBots = (style: 'jalan' | 'agresif', seats = 2, bots?: number) => {
  render(
    <MemoryRouter>
      <WallgameLocal />
    </MemoryRouter>
  );

  if (seats > 2) fireEvent.click(screen.getByTestId(`player-count-${seats}`));
  fireEvent.click(screen.getByTestId(`bot-style-${style}`));
  if (bots !== undefined) fireEvent.click(screen.getByTestId(`bot-count-${bots}`));
  fireEvent.click(screen.getByTestId('start-game-btn'));
};

describe('WallGo against the bots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a plain hotseat game when no style is picked', () => {
    render(
      <MemoryRouter>
        <WallgameLocal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('bot-style-none')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('start-game-btn'));

    expect(screen.queryAllByTestId('bot-tag')).toHaveLength(0);
    fireEvent.click(candidateAt(4, 7)!);
    expect(banner()).toContain('Pemain 2');
    expect(isHumanTurn()).toBe(true);
  });

  it('names the bot seats and holds the tag until a bot is on turn', () => {
    startWithBots('jalan');

    expect(screen.getByTestId('roster-player-1')).toHaveTextContent('Bot 2');
    expect(screen.getByTestId('roster-player-0')).not.toHaveTextContent('Bot');
    expect(screen.queryAllByTestId('bot-tag')).toHaveLength(0);
    expect(banner()).toContain('Giliran Aktif');
  });

  it('takes the bot turn on its own and unlocks the board again', () => {
    startWithBots('jalan');
    const botBefore = distance(1);

    fireEvent.click(candidateAt(4, 7)!);

    expect(banner()).toContain('Giliran Bot');
    expect(screen.getAllByTestId('bot-tag')).toHaveLength(1);
    expect(candidates()).toHaveLength(0);
    expect(screen.getByTestId('board-action-dock')).toHaveTextContent('Giliran Bot 2, papan dikunci...');
    expect(distance(1)).toBe(botBefore);

    letBotMove();

    expect(distance(1)).toBeLessThan(botBefore);
    expect(isHumanTurn()).toBe(true);
    expect(candidates().length).toBeGreaterThan(0);
  });

  it('runs a full game with one human seat against three bots', () => {
    startWithBots('agresif', 4, 3);

    expect(screen.getByTestId('roster-player-1')).toHaveTextContent('Bot 2');
    expect(screen.getByTestId('roster-player-3')).toHaveTextContent('Bot 4');
    expect(screen.getByTestId('roster-player-0')).not.toHaveTextContent('Bot');

    const core = coreOf(4);
    expect([1, 2, 3].map(distance)).toEqual([5, 5, 5]);
    let rounds = 0;

    while (rounds < 40 && !screen.queryByTestId('victory-modal')) {
      expect(moveHuman(core)).toBe(true);
      waitHumanTurn();
      rounds += 1;
    }

    expect(screen.getByTestId('victory-modal')).toBeInTheDocument();
    // A wall can lengthen a path, so plies are the proof the bot seats played, not the distances.
    expect(turn()).toBeGreaterThan(rounds * 2);
  });

  it('carries the bot choice into a restart from the victory modal', () => {
    startWithBots('jalan');
    const core = coreOf(2);
    let rounds = 0;

    while (rounds < 40 && !screen.queryByTestId('victory-modal')) {
      expect(moveHuman(core)).toBe(true);
      waitHumanTurn();
      rounds += 1;
    }

    fireEvent.click(screen.getByTestId('victory-restart-btn'));

    expect(screen.getByTestId('roster-player-1')).toHaveTextContent('Bot 2');
    expect(screen.queryAllByTestId('bot-tag')).toHaveLength(0);
    expect(isHumanTurn()).toBe(true);
  });
});
