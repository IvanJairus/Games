import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicTacToeLocal } from '@/games/tic-tac-toe/pages/TicTacToeLocal';
import { TicTacToeLobby } from '@/games/tic-tac-toe/pages/TicTacToeLobby';

const renderLocal = (query: string) =>
  render(
    <MemoryRouter initialEntries={[`/tic-tac-toe/local${query}`]}>
      <Routes>
        <Route path="/tic-tac-toe/local" element={<TicTacToeLocal />} />
      </Routes>
    </MemoryRouter>
  );

const renderLobby = () =>
  render(
    <MemoryRouter initialEntries={['/tic-tac-toe']}>
      <Routes>
        <Route path="/tic-tac-toe" element={<TicTacToeLobby />} />
      </Routes>
    </MemoryRouter>
  );

const filled = (symbol: 'X' | 'O') =>
  screen
    .getAllByRole('gridcell')
    .filter((cell) => (cell.getAttribute('aria-label') || '').includes(`terisi ${symbol}`));

const letBotThink = () =>
  act(() => {
    vi.advanceTimersByTime(600);
  });

describe('Tic Tac Toe against the bot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the three levels from the lobby as real links', () => {
    renderLobby();
    expect(screen.getByTestId('tictactoe-bot-link-santai')).toHaveAttribute('href', '/tic-tac-toe/local?bot=santai');
    expect(screen.getByTestId('tictactoe-bot-link-sedang')).toHaveAttribute('href', '/tic-tac-toe/local?bot=sedang');
    expect(screen.getByTestId('tictactoe-bot-link-sempurna')).toHaveAttribute(
      'href',
      '/tic-tac-toe/local?bot=sempurna'
    );
    expect(screen.getByTestId('tictactoe-bot-link-sempurna').textContent).toContain('sepuluh langkah');
  });

  it('ignores an unknown level and keeps the game hotseat', () => {
    const { container } = renderLocal('?bot=juara');
    expect(container.textContent).toContain('Hotseat Lokal');
  });

  it('answers the human move with one bot move', () => {
    const { container } = renderLocal('?bot=sedang');
    expect(container.textContent).toContain('Lawan Bot · tingkat sedang');

    fireEvent.click(screen.getByTestId('cell-0'));
    expect(filled('X')).toHaveLength(1);
    expect(filled('O')).toHaveLength(0);

    letBotThink();
    expect(filled('O')).toHaveLength(1);
  });

  it('refuses a second human click while the bot is thinking', () => {
    renderLocal('?bot=santai');

    fireEvent.click(screen.getByTestId('cell-0'));
    fireEvent.click(screen.getByTestId('cell-1'));
    expect(filled('X')).toHaveLength(1);

    letBotThink();
    expect(filled('O')).toHaveLength(1);
  });

  it('names the bot seat and locks the board while it is on turn', () => {
    renderLocal('?bot=sedang');
    fireEvent.click(screen.getByTestId('cell-0'));

    expect(screen.getByTestId('tictactoe-status-banner')).toHaveTextContent('Bot');
    expect(screen.getAllByText('Bot').length).toBeGreaterThan(0);
    screen.getAllByRole('gridcell').forEach((cell) => expect(cell).toBeDisabled());

    letBotThink();

    expect(screen.getByTestId('tictactoe-status-banner')).toHaveTextContent('Pemain X');
    expect(screen.getAllByRole('gridcell').some((cell) => !(cell as HTMLButtonElement).disabled)).toBe(true);
  });

  it('plays a whole game against the perfect bot until somebody wins', () => {
    const { container } = renderLocal('?bot=sempurna');
    let plies = 0;

    while (plies < 40 && !container.textContent?.match(/menang/i)) {
      const free = screen.getAllByRole('gridcell').find((cell) => !(cell as HTMLButtonElement).disabled);
      if (!free) break;
      fireEvent.click(free);
      plies += 1;
      letBotThink();
    }

    expect(container.textContent).toMatch(/menang/i);
    expect(plies).toBeLessThan(40);
  });
});
