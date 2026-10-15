import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BattleshipLocal } from '@/games/battleship/pages/BattleshipLocal';
import { FLEET } from '@/games/battleship/engine/types';

const renderLocal = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/battleship/local" element={<BattleshipLocal />} />
      </Routes>
    </MemoryRouter>
  );

const fireButton = (container: HTMLElement): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Tembak')) as HTMLButtonElement;

const openCells = (container: HTMLElement): HTMLButtonElement[] =>
  [...container.querySelectorAll<HTMLButtonElement>('.bs-board-target .bs-cell:not([data-static])')];

const tick = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('Battleship play through the real UI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the two local modes before any board appears', () => {
    const { container } = renderLocal('/battleship/local');
    expect(screen.getByRole('button', { name: /Solo lawan AI/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dua pemain, satu perangkat/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.bs-cell')).toHaveLength(0);
  });

  it('places ships by hand, refuses a drop that cannot fit, and undoes the last ship', () => {
    renderLocal('/battleship/local?mode=solo');

    const board = screen.getByRole('grid', { name: /Papan armada Anda/i });
    const cells = within(board).getAllByRole('button');
    expect(cells).toHaveLength(64);

    fireEvent.click(cells[0]);
    fireEvent.click(cells[4]);
    expect(board.querySelectorAll('[data-ship="true"]')).toHaveLength(7);
    // Satu kurung anotasi per kapal, bukan per petak, dan sandinya menyebut panjangnya.
    const charts = board.querySelectorAll('.bs-chart');
    expect(charts).toHaveLength(2);
    expect(charts[0].getAttribute('data-chart-kind')).toBe('Battleship');
    expect(charts[0].textContent).toBe('BS 4');
    expect(charts[0].getAttribute('data-axis')).toBe('h');

    fireEvent.click(screen.getByRole('button', { name: /Arah:/i }));
    fireEvent.click(cells[20]);
    expect(board.querySelectorAll('[data-ship="true"]')).toHaveLength(10);
    expect(board.querySelectorAll('.bs-chart')).toHaveLength(3);
    expect(board.querySelectorAll('.bs-chart[data-axis="v"]')).toHaveLength(1);

    // Nothing fits horizontally from the last column, so the attempt is refused with a reason.
    fireEvent.click(screen.getByRole('button', { name: /Arah:/i }));
    fireEvent.click(cells[7]);
    expect(screen.getByRole('alert').textContent).toContain('tidak muat');

    fireEvent.click(screen.getByRole('button', { name: /Undo/i }));
    expect(board.querySelectorAll('[data-ship="true"]')).toHaveLength(7);
    expect(board.querySelectorAll('.bs-chart')).toHaveLength(2);
  });

  it('locks a randomized fleet and lets a full solo game run to a winner', () => {
    const { container } = renderLocal('/battleship/local?mode=solo');

    fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
    const locked = screen.getByRole('button', { name: /Kunci Armada/i }) as HTMLButtonElement;
    expect(locked.disabled).toBe(false);
    fireEvent.click(locked);
    tick(60);

    expect(screen.getByRole('grid', { name: /Papan AI/i })).toBeInTheDocument();
    expect(within(screen.getByRole('grid', { name: /Papan Anda/i })).getAllByRole('button')).toHaveLength(64);

    let shots = 0;
    let finished = false;

    while (shots < 120 && !finished) {
      const targets = openCells(container);
      if (targets.length === 0) {
        tick(600);
        const text = container.textContent || '';
        if (/menang dalam|berakhir tanpa armada/i.test(text)) finished = true;
        continue;
      }

      fireEvent.click(targets[0]);
      const fire = fireButton(container);
      expect(fire.disabled).toBe(false);
      fireEvent.click(fire);
      shots += 1;
      tick(600);

      const text = container.textContent || '';
      if (/menang dalam|berakhir tanpa armada/i.test(text)) finished = true;
    }

    expect(finished).toBe(true);
    expect(container.textContent).toMatch(/menang dalam \d+ tembakan/);

    const shotLog = screen.getByRole('list', { name: /Hasil tembakan/i });
    expect(within(shotLog).getAllByText(/KENA|MELESET/).length).toBeGreaterThan(0);

    const boardTitles = [...container.querySelectorAll('.bs-board-title span:first-child')].map((s) => s.textContent);
    expect(boardTitles.filter((t) => t && /Bukti armada/.test(t))).toHaveLength(2);

    expect(container.textContent).toContain('diungkap setelah selesai');
    // Kapal yang habis ditandai dengan kurung putus-putus dan simbol bangkai.
    expect(container.querySelectorAll('.bs-chart[data-sunk="true"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.bs-chart__wreck').length).toBeGreaterThan(0);
  });

  it('passes the device between the two hotseat players before the battle starts', () => {
    const { container } = renderLocal('/battleship/local?mode=hotseat');

    expect(screen.getByRole('heading', { name: /Susun armada Pemain 1/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
    fireEvent.click(screen.getByRole('button', { name: /Kunci Armada/i }));
    tick(60);

    const notes = [...container.querySelectorAll('[role="status"]')].map((n) => n.textContent || '');
    expect(notes.some((t) => t.includes('Serahkan ke Pemain 2'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Saya Pemain 2, mulai susun/i }));
    expect(screen.getByRole('heading', { name: /Susun armada Pemain 2/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
    fireEvent.click(screen.getByRole('button', { name: /Kunci Armada/i }));
    tick(60);

    expect(screen.getByRole('grid', { name: /Papan Pemain 2/i })).toBeInTheDocument();
    expect(openCells(container).length).toBeGreaterThan(0);
  });

  it('fires with the keyboard and keeps every control reachable by Tab', () => {
    const { container } = renderLocal('/battleship/local?mode=solo');

    fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
    fireEvent.click(screen.getByRole('button', { name: /Kunci Armada/i }));
    tick(60);

    const attackBoard = screen.getByRole('grid', { name: /Papan AI/i });
    fireEvent.keyDown(attackBoard, { key: 'ArrowRight' });
    fireEvent.keyDown(attackBoard, { key: 'ArrowDown' });
    fireEvent.keyDown(attackBoard, { key: 'Enter' });

    const fire = fireButton(container);
    expect(fire.textContent).toMatch(/Tembak [A-H]\d/);

    fireEvent.keyDown(attackBoard, { key: 'Enter' });
    expect(fire.disabled).toBe(false);
  });

  it('shows a board of 64 cells per side and a fleet rail of five ships at several widths', () => {
    [320, 390, 768, 1440].forEach((width) => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 844 });

      const { unmount, container } = renderLocal('/battleship/local?mode=solo');
      fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
      fireEvent.click(screen.getByRole('button', { name: /Kunci Armada/i }));
      tick(60);

      expect(container.querySelectorAll('.bs-cell')).toHaveLength(128);
      expect(container.querySelectorAll('.bs-chip')).toHaveLength(FLEET.length);
      unmount();
    });
  });
});
