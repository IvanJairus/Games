import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BombermanLobby } from '@/games/bomberman/pages/BombermanLobby';
import { BombermanLocal } from '@/games/bomberman/pages/BombermanLocal';
import { BombermanMatch } from '@/games/bomberman/pages/BombermanMatch';
import { readCharId } from '@/games/bomberman/charPreference';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/bomberman" element={<BombermanLobby />} />
        <Route path="/bomberman/local" element={<BombermanLocal />} />
        <Route path="/bomberman/m/:code" element={<BombermanMatch />} />
      </Routes>
    </MemoryRouter>,
  );

/** The loop is a real rAF loop, so a test has to wait for actual frames. */
const frames = (n: number): Promise<void> =>
  new Promise((done) => {
    let left = n;
    const step = (): void => {
      left -= 1;
      if (left <= 0) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('lobby', () => {
  it('offers every character and reports the one that is selected', async () => {
    renderAt('/bomberman');
    const ids = ['robo', 'tupai', 'radar', 'biskuit', 'lampu', 'sekrup'];
    for (const id of ids) {
      expect(screen.getByTestId(`bomberman-char-${id}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('bomberman-char-sekrup'));
    expect(screen.getByTestId('bomberman-char-sekrup')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Robot baut/)).toBeInTheDocument();
  });

  it('draws the character inside its own tile', () => {
    renderAt('/bomberman');
    const tile = screen.getByTestId('bomberman-char-tupai');
    expect(tile.querySelector('svg')).not.toBeNull();
    expect(tile).toHaveTextContent('Tupai Gudang');
    expect(screen.getByTestId('bomberman-char-random').querySelector('svg')).not.toBeNull();
  });

  it('keeps the chosen character on the device for the room page to claim', () => {
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-char-sekrup'));
    // Read through the app's own store: jsdom has no usable localStorage, and the
    // storage helper falls back to a process-local map, which is what the room page
    // would read in the same situation.
    expect(readCharId()).toBe('sekrup');
  });

  it('shows both arena sizes and grows the large one with the seat count', () => {
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-tab-online'));
    expect(screen.getByTestId('bomberman-size-besar')).toHaveTextContent('Besar 15 x 13');
    expect(screen.queryByTestId('bomberman-size-luas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bomberman-seats-4'));
    expect(screen.getByTestId('bomberman-size-kecil')).toHaveTextContent('Kecil 15 x 11');
    expect(screen.getByTestId('bomberman-size-besar')).toHaveTextContent('Besar 21 x 15');
    expect(screen.getByTestId('bomberman-size-luas')).toHaveTextContent('Luas 25 x 17');
  });

  it('offers the team switch only when four seats are chosen', () => {
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-tab-online'));
    expect(screen.queryByTestId('bomberman-teams')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bomberman-seats-4'));
    expect(screen.getByTestId('bomberman-teams')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bomberman-seats-2'));
    expect(screen.queryByTestId('bomberman-teams')).not.toBeInTheDocument();
  });

  it('keeps online actions unavailable without a game server, and solo reachable', () => {
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-tab-online'));
    expect(screen.getByTestId('bomberman-create')).toBeDisabled();
    expect(screen.getByTestId('bomberman-join')).toBeDisabled();
    fireEvent.click(screen.getByTestId('bomberman-tab-solo'));
    expect(screen.getByTestId('bomberman-lobby-sedang')).toBeInTheDocument();
  });

  it('enables room creation from the Worker door even without Supabase', () => {
    vi.stubEnv('VITE_TRANSPORT', 'cloudflare');
    vi.stubEnv('VITE_CF_ROOMS_URL', 'https://rooms.example');
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-tab-online'));
    expect(screen.getByTestId('bomberman-create')).not.toBeDisabled();
    expect(screen.getByTestId('bomberman-join')).not.toBeDisabled();
  });

  it('normalises a typed code and refuses to send a short one', () => {
    renderAt('/bomberman');
    fireEvent.click(screen.getByTestId('bomberman-tab-online'));
    const box = screen.getByTestId('bomberman-code') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'ab1c2d3e4' } });
    expect(box.value).toHaveLength(6);
    // The room alphabet has no 1, 0, I or O, so a pasted code carrying them is cleaned
    // rather than sent as a code that can never exist.
    expect(box.value).toBe('ABC2D3');
    fireEvent.change(box, { target: { value: 'ooII00' } });
    expect(box.value).toBe('');

    // With no game server configured the join control is inert, so a short code can
    // never reach the router even by accident.
    fireEvent.change(screen.getByTestId('bomberman-name'), { target: { value: 'Ivan' } });
    fireEvent.change(box, { target: { value: 'ABC' } });
    expect(screen.getByTestId('bomberman-join')).toBeDisabled();
    fireEvent.click(screen.getByTestId('bomberman-join'));
    expect(screen.getByTestId('bomberman-lobby')).toBeInTheDocument();
  });
});

describe('solo arena', () => {
  it('starts from the setup screen and paints the arena', async () => {
    renderAt('/bomberman/local');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    const board = await waitFor(() => {
      const el = screen.getByTestId('bomberman-board');
      expect(el).toBeInTheDocument();
      return el;
    });
    await frames(30);
    expect(board.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(screen.getByTestId('bomberman-status')).toBeInTheDocument();
  });

  it('offers four named arrows once a real touch is seen', async () => {
    renderAt('/bomberman/local');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    await waitFor(() => expect(screen.getByTestId('bomberman-board')).toBeInTheDocument());
    // A mouse or a desktop keyboard never sees the arrows: the pad is a touch control.
    expect(screen.queryByTestId('bomberman-dpad')).toBeNull();

    fireEvent.pointerDown(window, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20 });
    await waitFor(() => expect(screen.getByTestId('bomberman-dpad')).toBeInTheDocument());
    for (const dir of ['up', 'down', 'left', 'right']) {
      expect(screen.getByTestId(`bomberman-dir-${dir}`)).toHaveAttribute('data-dir', dir);
    }
    expect(screen.getByLabelText('Kiri')).toBeInTheDocument();
    expect(screen.getByTestId('bomberman-bom')).toBeInTheDocument();
  });

  it('plays the large board when the setup asks for it', async () => {
    renderAt('/bomberman/local?size=besar');
    expect(screen.getByTestId('bomberman-size-besar')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    const board = await waitFor(() => {
      const el = screen.getByTestId('bomberman-board');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(board).toHaveAttribute('viewBox', '0 0 600 520');
    await frames(20);
  });

  it('grows the arena with the seat count it was paired with', async () => {
    renderAt('/bomberman/local');
    fireEvent.click(screen.getByTestId('bomberman-seats-4'));
    fireEvent.click(screen.getByTestId('bomberman-size-besar'));
    fireEvent.click(screen.getByTestId('bomberman-start'));
    const board = await waitFor(() => {
      const el = screen.getByTestId('bomberman-board');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(board).toHaveAttribute('viewBox', '0 0 840 600');
    await frames(20);
  });

  it('plays the widest board when four seats ask for it', async () => {
    renderAt('/bomberman/local?seats=4&size=luas');
    expect(screen.getByTestId('bomberman-size-luas')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    const board = await waitFor(() => {
      const el = screen.getByTestId('bomberman-board');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(board).toHaveAttribute('viewBox', '0 0 1000 680');
    await frames(20);
  });

  it('plants one bomb per press and never more than the quota', async () => {
    renderAt('/bomberman/local?bot=sedang');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    await waitFor(() => expect(screen.getByTestId('bomberman-board')).toBeInTheDocument());
    await frames(30);

    for (let i = 0; i < 30; i++) fireEvent.keyDown(window, { code: 'Space' });
    await frames(10);
    // Seat 0 is the human, and it never moved, so no bomb power could have raised its
    // quota above the starting one. Bots plant their own bombs and are counted separately.
    const bombs = document.querySelectorAll('[data-sig^="bomb:0"]');
    expect(bombs.length).toBeLessThanOrEqual(1);
  });

  it('clears held keys on blur so the runner does not walk on its own', async () => {
    renderAt('/bomberman/local');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    await waitFor(() => expect(screen.getByTestId('bomberman-board')).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    await frames(40);
    fireEvent.blur(window);
    await frames(5);
    const before = document.querySelector('[data-sig^="player"]')?.getAttribute('transform');
    await frames(120);
    const after = document.querySelector('[data-sig^="player"]')?.getAttribute('transform');
    expect(after).toBe(before);
  });

  it('stops its loop on unmount', async () => {
    const { unmount } = renderAt('/bomberman/local');
    fireEvent.click(screen.getByTestId('bomberman-start'));
    await waitFor(() => expect(screen.getByTestId('bomberman-board')).toBeInTheDocument());
    expect(() => unmount()).not.toThrow();
  });
});

describe('online room', () => {
  it('explains that a room needs a server instead of crashing', async () => {
    renderAt('/bomberman/m/ABC123');
    await waitFor(() => expect(screen.getByTestId('bomberman-match-error')).toBeInTheDocument());
    expect(screen.getByText(/Server main belum dikonfigurasi/)).toBeInTheDocument();
  });
});

describe('paint order', () => {
  it('keeps the control layer and banner above the board', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/games/bomberman/bomberman.css'), 'utf8');
    for (const selector of ['.bm-banner', '.bm-pad', '.bm-actions']) {
      const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      expect(block, `${selector} needs a stacking order`).toMatch(/z-index:\s*[1-9]\d*/);
    }
  });

  it('reserves the status slot so the board cannot jump', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/games/bomberman/bomberman.css'), 'utf8');
    const block = /\.bm-status\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/min-height:\s*44px/);
  });
});
