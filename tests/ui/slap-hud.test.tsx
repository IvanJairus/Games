import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Hud, type HudSnapshot } from '@/games/slap-arena/components/Hud';

const hud = (over: Partial<HudSnapshot> = {}): HudSnapshot => ({
  round: 1,
  phase: 'WAITING',
  countdown: 0,
  scoreToWin: 3,
  winnerId: null,
  matchWinnerId: null,
  players: [],
  localId: 'me',
  roomCode: 'ABC123',
  peers: 2,
  needed: 2,
  slapCd: 0,
  dashCd: 0,
  ...over,
});

const base = {
  muted: false,
  onToggleMute: () => {},
  onExit: () => {},
  showKeys: false,
  slapCd: 0,
  dashCd: 0,
  fxMode: 'auto' as const,
  fxLevel: 'high' as const,
  onCycleFx: () => {},
};

describe('Slap Arena waiting room HUD', () => {
  it('offers Mulai only to the seat that may start it', () => {
    const onStart = vi.fn();
    const { rerender } = render(<Hud {...base} hud={hud()} canStart onStart={onStart} />);

    fireEvent.click(screen.getByTestId('slap-start'));
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(<Hud {...base} hud={hud()} canStart={false} onStart={onStart} />);
    expect(screen.queryByTestId('slap-start')).toBeNull();
    expect(screen.getByTestId('slap-ready').textContent).toContain('Menunggu tuan rumah');
  });

  it('still asks for another brawler while the room is short', () => {
    render(<Hud {...base} hud={hud({ peers: 1 })} canStart={false} onStart={() => {}} />);
    expect(screen.getByTestId('slap-waiting').textContent).toContain('1 brawler lagi');
    expect(screen.queryByTestId('slap-ready')).toBeNull();
  });

  it('copies the invite URL that already carries the room code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<Hud {...base} hud={hud()} canStart={false} onStart={() => {}} />);
    fireEvent.click(screen.getByTestId('slap-copy-invite'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('/slap-arena/m/ABC123');
    expect(await screen.findByText('TAUTAN TERSALIN')).toBeTruthy();
  });

  it('does not claim the invite was copied when the clipboard refuses', async () => {
    // writeText rejects on an insecure origin and on a denied permission. Reporting
    // success from the rejection handler tells the player to paste something that is not
    // there, which is worse than telling them it failed.
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });

    render(<Hud {...base} hud={hud()} canStart={false} onStart={() => {}} />);
    fireEvent.click(screen.getByTestId('slap-copy-invite'));

    expect(await screen.findByText('GAGAL SALIN')).toBeTruthy();
    expect(screen.queryByText('TAUTAN TERSALIN')).toBeNull();
  });

  it('falls back to execCommand when the async clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });

    render(<Hud {...base} hud={hud()} canStart={false} onStart={() => {}} />);
    fireEvent.click(screen.getByTestId('slap-copy-invite'));

    expect(exec).toHaveBeenCalledWith('copy');
    expect(await screen.findByText('TAUTAN TERSALIN')).toBeTruthy();
    // The scratch textarea must not survive the copy.
    expect(document.querySelector('textarea')).toBeNull();
  });
});
