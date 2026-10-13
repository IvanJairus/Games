import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Hub } from '@/pages/Hub';
import { WallgameLocal } from '@/games/wall-game/pages/WallgameLocal';
import { TicTacToeLocal } from '@/games/tic-tac-toe/pages/TicTacToeLocal';

describe('Desktop Viewport Automation Suite (1024px)', () => {
  beforeEach(() => {
    // Simulate desktop dimensions
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
    window.dispatchEvent(new Event('resize'));
  });

  it('renders Games Hub with all registered games on desktop', () => {
    render(
      <MemoryRouter>
        <Hub />
      </MemoryRouter>
    );

    expect(screen.getByText('Mini-Games & Arena Strategi.')).toBeInTheDocument();
    expect(screen.getByTestId('game-card-wall-game')).toBeInTheDocument();
    expect(screen.getByTestId('game-card-tic-tac-toe')).toBeInTheDocument();
    expect(screen.getByText(/WallGo · Race to the Golden Core/)).toBeInTheDocument();
    expect(screen.getByText(/Tic Tac Toe · Mode No-Draw/)).toBeInTheDocument();
  });

  it('starts a Wall Game on desktop and interacts with tiles and wall placement', () => {
    render(
      <MemoryRouter>
        <WallgameLocal />
      </MemoryRouter>
    );

    // Initial setup screen
    expect(screen.getByText('Pilih Jumlah Pemain')).toBeInTheDocument();
    const startBtn = screen.getByTestId('start-game-btn');
    expect(startBtn).toBeInTheDocument();

    // Start game
    fireEvent.click(startBtn);

    // In-game board rendered
    expect(screen.getByTestId('wallgame-board-svg')).toBeInTheDocument();
    expect(screen.getByTestId('turn-banner')).toBeInTheDocument();
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Pemain 1/);

    // Pawn 1 at start (South: x=4, y=8). Move candidate at (4, 7) should exist
    const moveNorth = screen.getByTestId('move-candidate-4-7');
    expect(moveNorth).toBeInTheDocument();

    // Click candidate tile to move (100% full-area clickable)
    fireEvent.click(moveNorth);

    // Turn should advance to Player 2
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Putaran #2/);
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Pemain 2/);

    // 2-Step Wall Placement (Preview & Confirm):
    // First click on groove cross stages preview
    const grooveCross = screen.getByTestId('groove-cross-2-2');
    fireEvent.click(grooveCross);

    // Staged wall confirmation bar appears
    expect(screen.getByTestId('staged-wall-bar')).toBeInTheDocument();
    const confirmBtn = screen.getByTestId('confirm-wall-btn');
    expect(confirmBtn).toBeInTheDocument();

    // Confirm wall placement
    fireEvent.click(confirmBtn);

    // Turn should advance to Putaran #3
    expect(screen.getByTestId('turn-banner')).toHaveTextContent(/Putaran #3/);
  });

  it('plays a complete Tic Tac Toe match to victory on desktop', () => {
    render(
      <MemoryRouter>
        <TicTacToeLocal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('tictactoe-board')).toBeInTheDocument();
    expect(screen.getByTestId('tictactoe-scoreboard')).toBeInTheDocument();

    // Player X plays 0
    fireEvent.click(screen.getByTestId('cell-0'));
    expect(screen.getByTestId('cell-0')).toHaveTextContent('X');

    // Player O plays 3
    fireEvent.click(screen.getByTestId('cell-3'));
    expect(screen.getByTestId('cell-3')).toHaveTextContent('O');

    // Player X plays 1
    fireEvent.click(screen.getByTestId('cell-1'));
    expect(screen.getByTestId('cell-1')).toHaveTextContent('X');

    // Player O plays 4
    fireEvent.click(screen.getByTestId('cell-4'));
    expect(screen.getByTestId('cell-4')).toHaveTextContent('O');

    // Player X plays 2 -> Row 0 win [0, 1, 2]
    fireEvent.click(screen.getByTestId('cell-2'));
    expect(screen.getByTestId('cell-2')).toHaveTextContent('X');

    // Victory status banner
    expect(screen.getByTestId('tictactoe-status-banner')).toHaveTextContent(/Pemain X Memenangkan Ronde Ini/);
    expect(screen.getByTestId('tictactoe-next-round-btn')).toBeInTheDocument();

    // Advance to next round
    fireEvent.click(screen.getByTestId('tictactoe-next-round-btn'));
    expect(screen.getByTestId('cell-0')).toHaveTextContent('');
    expect(screen.getByTestId('tictactoe-status-banner')).toHaveTextContent(/Giliran Aktif/);
  });

  it('demonstrates vanishing piece mechanic when 4th piece is played in Tic Tac Toe', () => {
    render(
      <MemoryRouter>
        <TicTacToeLocal />
      </MemoryRouter>
    );

    // X: 0, O: 3, X: 1, O: 4, X: 8, O: 7
    fireEvent.click(screen.getByTestId('cell-0')); // X at 0
    fireEvent.click(screen.getByTestId('cell-3')); // O at 3
    fireEvent.click(screen.getByTestId('cell-1')); // X at 1
    fireEvent.click(screen.getByTestId('cell-4')); // O at 4
    fireEvent.click(screen.getByTestId('cell-8')); // X at 8
    fireEvent.click(screen.getByTestId('cell-7')); // O at 7

    // Now X has 3 pieces (at 0, 1, 8). Cell 0 is the oldest and marked as expiring
    expect(screen.getByTestId('expiring-indicator-0')).toBeInTheDocument();
    expect(screen.getByText(/Bidak tertua di petak #1 akan lenyap/)).toBeInTheDocument();

    // X places 4th piece at cell 6
    fireEvent.click(screen.getByTestId('cell-6'));

    // Cell 0 must now be empty (vanished)!
    expect(screen.getByTestId('cell-0')).toHaveTextContent('');
    // Cell 6 has X
    expect(screen.getByTestId('cell-6')).toHaveTextContent('X');
  });
});
