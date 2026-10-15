import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WallgameLocal } from '@/games/wall-game/pages/WallgameLocal';
import { WallgameLobby } from '@/games/wall-game/pages/WallgameLobby';

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

const startWithBots = (level: 'santai' | 'sedang' | 'sempurna', seats = 2, bots?: number) => {
  render(
    <MemoryRouter>
      <WallgameLocal />
    </MemoryRouter>
  );

  if (seats > 2) fireEvent.click(screen.getByTestId(`player-count-${seats}`));
  fireEvent.click(screen.getByTestId(`bot-level-${level}`));
  if (bots !== undefined) fireEvent.click(screen.getByTestId(`bot-count-${bots}`));
  fireEvent.click(screen.getByTestId('start-game-btn'));
};

describe('WallGo against the bots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps a plain hotseat game when no level is picked', () => {
    render(
      <MemoryRouter>
        <WallgameLocal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('bot-level-none')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('start-game-btn'));

    expect(screen.queryAllByTestId('bot-tag')).toHaveLength(0);
    fireEvent.click(candidateAt(4, 7)!);
    expect(banner()).toContain('Pemain 2');
    expect(isHumanTurn()).toBe(true);
  });

  it('names the bot seats and holds the tag until a bot is on turn', () => {
    startWithBots('sedang');

    expect(screen.getByTestId('roster-player-1')).toHaveTextContent('Bot 2');
    expect(screen.getByTestId('roster-player-0')).not.toHaveTextContent('Bot');
    expect(screen.queryAllByTestId('bot-tag')).toHaveLength(0);
    expect(banner()).toContain('Giliran Aktif');
  });

  it('takes the bot turn on its own and unlocks the board again', () => {
    // A high draw keeps the easy tier on its best-distance branch, so this test is about pacing
    // and the board lock rather than about which square the bot likes.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    startWithBots('santai');
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
    startWithBots('sempurna', 4, 3);

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
    startWithBots('sedang');
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

  it('opens straight into a bot table from the lobby link', () => {
    render(
      <MemoryRouter initialEntries={['/wall-game/local?bot=sempurna&seats=4&bots=3']}>
        <WallgameLocal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('player-count-4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bot-level-sempurna')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bot-count-3')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('start-game-btn'));

    expect(screen.getByTestId('roster-player-0')).toHaveTextContent('Pemain 1');
    expect(screen.getByTestId('roster-player-3')).toHaveTextContent('Bot 4');
    expect(screen.getByText(/tingkat sempurna/)).toBeInTheDocument();
  });

  it('ignores an unknown level in the link and stays hotseat', () => {
    render(
      <MemoryRouter initialEntries={['/wall-game/local?bot=jawara']}>
        <WallgameLocal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('bot-level-none')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('WallGo lobby bot entrance', () => {
  const renderLobby = () =>
    render(
      <MemoryRouter initialEntries={['/wall-game']}>
        <Routes>
          <Route path="/wall-game" element={<WallgameLobby />} />
          <Route path="/wall-game/local" element={<WallgameLocal />} />
        </Routes>
      </MemoryRouter>
    );

  it('offers one link per bot level', () => {
    renderLobby();

    expect(screen.getByTestId('wallgame-bot-link-santai')).toHaveAttribute('href', '/wall-game/local?bot=santai');
    expect(screen.getByTestId('wallgame-bot-link-sedang')).toHaveAttribute('href', '/wall-game/local?bot=sedang');
    expect(screen.getByTestId('wallgame-bot-link-sempurna')).toHaveAttribute(
      'href',
      '/wall-game/local?bot=sempurna'
    );
    expect(screen.getByTestId('wallgame-bot-link-sempurna').textContent).toContain('membalikkan balapan');
  });

  it('walks from the lobby link into a bot table', () => {
    renderLobby();

    fireEvent.click(screen.getByTestId('wallgame-bot-link-sedang'));

    expect(screen.getByTestId('bot-level-sedang')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bot-level-none')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('start-game-btn'));

    expect(screen.getByTestId('roster-player-1')).toHaveTextContent('Bot 2');
    expect(screen.getByTestId('roster-player-0')).not.toHaveTextContent('Bot');
  });
});
