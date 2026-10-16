import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Hub } from '@/pages/Hub';
import { GAMES_REGISTRY } from '@/games/registry';

const renderHub = () =>
  render(
    <MemoryRouter>
      <Hub />
    </MemoryRouter>
  );

const cardOf = (id: string) => screen.getByTestId(`game-card-${id}`);

describe('Hub lobby preload on card intent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warms the lobby chunk when the pointer enters the first card', () => {
    const first = GAMES_REGISTRY[0];
    const spy = vi.spyOn(GAMES_REGISTRY[0], 'preload').mockResolvedValue({});

    renderHub();
    fireEvent.pointerEnter(cardOf(first.id));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('warms the lobby chunk when the card takes keyboard focus', () => {
    const target = GAMES_REGISTRY.find((g) => g.id === 'wall-game')!;
    const spy = vi.spyOn(target, 'preload').mockResolvedValue({});

    renderHub();
    fireEvent.focus(cardOf(target.id));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('warms the lobby chunk on the first touch', () => {
    const target = GAMES_REGISTRY.find((g) => g.id === 'battleship')!;
    const spy = vi.spyOn(target, 'preload').mockResolvedValue({});

    renderHub();
    fireEvent.touchStart(cardOf(target.id));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps the hub usable when a preload rejects', async () => {
    const target = GAMES_REGISTRY.find((g) => g.id === 'tic-tac-toe')!;
    const spy = vi.spyOn(target, 'preload').mockRejectedValue(new Error('chunk gagal diunduh'));

    renderHub();
    fireEvent.pointerEnter(cardOf(target.id));
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cardOf(target.id)).toBeInTheDocument();
    expect(screen.getByText('Mini-Games & Arena Strategi.')).toBeInTheDocument();
  });

  it('still renders a card for every registered game', () => {
    renderHub();
    GAMES_REGISTRY.forEach((game) => {
      expect(cardOf(game.id)).toHaveAttribute('href', game.route);
    });
  });
});
