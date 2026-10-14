import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicTacToeLocal } from '@/games/tic-tac-toe/pages/TicTacToeLocal';

// jsdom ships a window.localStorage without its methods, and the app's own guards
// swallow that failure. Stub the shape so persistence is actually tested.
beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

const renderLocal = (entry = '/tic-tac-toe/local') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/tic-tac-toe/local" element={<TicTacToeLocal />} />
      </Routes>
    </MemoryRouter>
  );

const cell = (index: number) => screen.getByTestId(`cell-${index}`);
const play = (...indexes: number[]) => indexes.forEach((i) => fireEvent.click(cell(i)));
const label = (index: number) => cell(index).getAttribute('aria-label') || '';

describe('Tic Tac Toe played through the real UI', () => {
  it('opens the victory dialog when X lines up three', () => {
    renderLocal();
    play(0, 3, 1, 4, 2);

    expect(screen.getByText(/Menang!/)).toBeInTheDocument();
    // Two of these exist on the page: the scoreboard copy and the dialog's.
    expect(screen.getByTestId('tictactoe-next-round-btn')).toBeInTheDocument();
  });

  it('refuses a second piece on a filled cell by disabling it', () => {
    renderLocal();
    expect(cell(0)).toBeEnabled();
    fireEvent.click(cell(0));
    expect(cell(0)).toBeDisabled();
    expect(label(0)).toContain('terisi');
  });

  it('recycles the oldest piece so four moves never fill the board', () => {
    renderLocal();
    // Neither symbol completes a line along the way, so the rule is what ends it.
    play(0, 4, 1, 5, 3, 6, 8);

    expect(label(8)).toContain('terisi X');
    expect(label(0)).toContain('kosong');
    expect(label(1)).toContain('terisi X');
  });

  it('carries the shared mute preference into this game', () => {
    renderLocal();
    const toggle = screen.getByTestId('sound-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('ij_games_muted')).toBe('1');
  });
});
