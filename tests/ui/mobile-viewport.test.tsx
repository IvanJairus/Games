import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WallgameLocal } from '@/games/wall-game/pages/WallgameLocal';
import { VictoryModal } from '@/games/wall-game/components/VictoryModal';
import { ComponentErrorBoundary } from '@/components/ErrorBoundary';

describe('Mobile Viewport Automation Suite (375px)', () => {
  beforeEach(() => {
    // Simulate typical mobile device (iPhone / modern Android 375x667)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 667 });
    window.dispatchEvent(new Event('resize'));
  });

  it('renders Wall Game layout adaptively on mobile screen', () => {
    render(
      <MemoryRouter>
        <WallgameLocal />
      </MemoryRouter>
    );

    // Player Count options 2P..6P
    expect(screen.getByTestId('player-count-2')).toBeInTheDocument();
    expect(screen.getByTestId('player-count-4')).toBeInTheDocument();

    // Start with 2 players
    fireEvent.click(screen.getByTestId('start-game-btn'));

    // Board SVG exists and contains 100% responsive viewBox
    const boardSvg = screen.getByTestId('wallgame-board-svg');
    expect(boardSvg).toBeInTheDocument();
    expect(boardSvg).toHaveAttribute('viewBox');

    // Turn banner and orientation toggle button exist and are accessible
    const toggleBtn = screen.getByTestId('orientation-toggle');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent(/Horizontal/);

    // Tap orientation toggle button
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent(/Vertikal/);

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent(/Horizontal/);

    // 2-Step Wall Placement on Mobile:
    // Tap groove cross: stages wall preview without committing prematurely
    const grooveCross = screen.getByTestId('groove-cross-1-1');
    fireEvent.click(grooveCross);

    // Staged preview bar and preview on SVG are visible
    expect(screen.getByTestId('staged-wall-bar')).toBeInTheDocument();
    expect(screen.getByTestId('staged-wall-preview')).toBeInTheDocument();

    // Confirm button is present and clickable
    const confirmBtn = screen.getByTestId('confirm-wall-btn');
    expect(confirmBtn).toBeInTheDocument();
    fireEvent.click(confirmBtn);

    // Turn should advance to Player 2
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Putaran #2/);
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Pemain 2/);
  });

  it('triggers Victory Modal upon winning and offers restart, new setup, and home actions', () => {
    const mockRestart = vi.fn();
    const mockNewSetup = vi.fn();
    const mockClose = vi.fn();

    const mockWinner = {
      id: 0,
      name: 'Pemain 1',
      theme: { name: 'Player 1', hex: '#b45309', label: 'Emas Kuningan', border: '#78350f', text: '#ffffff' },
      position: { x: 4, y: 4 },
      wallsRemaining: 6,
      distanceToCore: 0,
      movesTaken: 4,
    };

    render(
      <MemoryRouter>
        <VictoryModal
          isOpen={true}
          winner={mockWinner}
          turn={8}
          gridSize={9}
          onRestart={mockRestart}
          onNewSetup={mockNewSetup}
          onClose={mockClose}
        />
      </MemoryRouter>
    );

    // Modal dialog is present and open
    const modal = screen.getByTestId('victory-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('open');

    // Winner badge & text
    expect(screen.getByText('Pemain 1 Menang!')).toBeInTheDocument();
    expect(screen.getByText(/KEMENANGAN TELAH DIRAIH/)).toBeInTheDocument();

    // Telemetry recap
    expect(screen.getByText('8')).toBeInTheDocument(); // Putaran
    expect(screen.getByText('6')).toBeInTheDocument(); // Sisa Dinding
    expect(screen.getByText('9×9')).toBeInTheDocument(); // Grid

    // Buttons
    const restartBtn = screen.getByTestId('victory-restart-btn');
    const newSetupBtn = screen.getByTestId('victory-new-setup-btn');
    const homeLink = screen.getByTestId('victory-home-link');
    const viewBoardBtn = screen.getByTestId('victory-view-board-btn');

    expect(restartBtn).toBeInTheDocument();
    expect(newSetupBtn).toBeInTheDocument();
    expect(homeLink).toBeInTheDocument();
    expect(viewBoardBtn).toBeInTheDocument();

    // Click Restart
    fireEvent.click(restartBtn);
    expect(mockRestart).toHaveBeenCalledTimes(1);

    // Click New Setup
    fireEvent.click(newSetupBtn);
    expect(mockNewSetup).toHaveBeenCalledTimes(1);

    // Click View Board
    fireEvent.click(viewBoardBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('catches render errors cleanly using ErrorBoundary fallback UI', () => {
    // Silence console error for intentional throw test
    const originalError = console.error;
    console.error = () => {};

    const ProblemChild: React.FC = () => {
      throw new Error('Simulated game runtime failure');
    };

    render(
      <MemoryRouter>
        <ComponentErrorBoundary>
          <ProblemChild />
        </ComponentErrorBoundary>
      </MemoryRouter>
    );

    expect(screen.getByText(/Terjadi Kendala Rendering/)).toBeInTheDocument();
    expect(screen.getByText(/Simulated game runtime failure/)).toBeInTheDocument();
    expect(screen.getByText(/Coba Render Ulang/)).toBeInTheDocument();

    console.error = originalError;
  });
});
