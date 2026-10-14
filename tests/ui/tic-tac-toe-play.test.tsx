import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicTacToeLocal } from '@/games/tic-tac-toe/pages/TicTacToeLocal';

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
    expect(screen.getByRole('button', { name: /ronde berikutnya/i })).toBeInTheDocument();
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
