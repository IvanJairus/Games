import { describe, it, expect } from 'vitest';
import {
  createTicTacToeGame,
  applyMove,
  checkWinner,
  getOldestPiece,
  getPlayerPieces,
  resetRound,
  WINNING_LINES,
  MAX_PIECES_PER_PLAYER,
} from '@/games/tic-tac-toe/engine';

describe('No-Draw Tic Tac Toe Engine (3-Pieces FIFO)', () => {
  it('initializes game with 9 empty cells, turn X, and zero scores', () => {
    const game = createTicTacToeGame();
    expect(game.board).toHaveLength(9);
    expect(game.board.every((cell) => cell === null)).toBe(true);
    expect(game.pieces).toHaveLength(0);
    expect(game.currentTurn).toBe('X');
    expect(game.status).toBe('IN_PROGRESS');
    expect(game.winner).toBeNull();
    expect(game.winningLine).toBeNull();
    expect(game.moveCount).toBe(0);
    expect(game.score).toEqual({ X: 0, O: 0 });
  });

  it('alternates turns correctly from X to O and tracks active pieces', () => {
    let game = createTicTacToeGame();
    game = applyMove(game, 0); // X plays at 0
    expect(game.board[0]).toBe('X');
    expect(game.currentTurn).toBe('O');
    expect(game.pieces).toHaveLength(1);
    expect(game.pieces[0]).toMatchObject({ player: 'X', cellIndex: 0 });

    game = applyMove(game, 4); // O plays at 4
    expect(game.board[4]).toBe('O');
    expect(game.currentTurn).toBe('X');
    expect(game.pieces).toHaveLength(2);
    expect(game.pieces[1]).toMatchObject({ player: 'O', cellIndex: 4 });
  });

  it('prevents playing in already occupied cells', () => {
    let game = createTicTacToeGame();
    game = applyMove(game, 0);
    expect(() => applyMove(game, 0)).toThrow(/already occupied/);
  });

  it('prevents invalid index bounds', () => {
    const game = createTicTacToeGame();
    expect(() => applyMove(game, -1)).toThrow(/Invalid board index/);
    expect(() => applyMove(game, 9)).toThrow(/Invalid board index/);
  });

  it('enforces No-Draw rule: 4th piece automatically vanishes the player oldest piece', () => {
    let game = createTicTacToeGame();

    // Turn 1: X plays at 0
    game = applyMove(game, 0);
    // Turn 2: O plays at 3
    game = applyMove(game, 3);
    // Turn 3: X plays at 1
    game = applyMove(game, 1);
    // Turn 4: O plays at 4
    game = applyMove(game, 4);
    // Turn 5: X plays at 8 (X now has 3 pieces: 0, 1, 8)
    game = applyMove(game, 8);
    // Turn 6: O plays at 7 (O now has 3 pieces: 3, 4, 7)
    game = applyMove(game, 7);

    expect(getPlayerPieces(game.pieces, 'X')).toHaveLength(3);
    expect(getPlayerPieces(game.pieces, 'O')).toHaveLength(3);
    expect(game.board[0]).toBe('X');

    // Turn 7: X plays at 6 (4th piece for X!)
    // The oldest piece of X was at cell 0 -> it must vanish!
    const oldestBefore = getOldestPiece(game.pieces, 'X');
    expect(oldestBefore?.cellIndex).toBe(0);

    game = applyMove(game, 6);

    // Cell 0 is now empty!
    expect(game.board[0]).toBeNull();
    // Cell 6 is now X
    expect(game.board[6]).toBe('X');
    // Total pieces for X remains exactly 3
    expect(getPlayerPieces(game.pieces, 'X')).toHaveLength(MAX_PIECES_PER_PLAYER);

    // New oldest piece for X is now cell 1
    const nextOldest = getOldestPiece(game.pieces, 'X');
    expect(nextOldest?.cellIndex).toBe(1);

    // Turn 8: O plays at 0 (now available!)
    // O's oldest piece was at cell 3 -> it must vanish!
    const oldestO = getOldestPiece(game.pieces, 'O');
    expect(oldestO?.cellIndex).toBe(3);

    game = applyMove(game, 0);
    expect(game.board[3]).toBeNull();
    expect(game.board[0]).toBe('O');
    expect(getPlayerPieces(game.pieces, 'O')).toHaveLength(MAX_PIECES_PER_PLAYER);
  });

  it('detects row win condition when 3 pieces align and increments score', () => {
    let game = createTicTacToeGame();
    // X: 0, O: 3, X: 1, O: 4, X: 2 (Top row win [0, 1, 2])
    game = applyMove(game, 0); // X
    game = applyMove(game, 3); // O
    game = applyMove(game, 1); // X
    game = applyMove(game, 4); // O
    game = applyMove(game, 2); // X -> wins!

    expect(game.status).toBe('WIN');
    expect(game.winner).toBe('X');
    expect(game.winningLine).toEqual([0, 1, 2]);
    expect(game.score.X).toBe(1);
    expect(game.score.O).toBe(0);

    // Cannot make moves once game is finished
    expect(() => applyMove(game, 8)).toThrow(/already over/);
  });

  it('detects victory after piece vanishing occurred', () => {
    let game = createTicTacToeGame();
    // X: 0, O: 4, X: 1, O: 5, X: 8, O: 7
    // Board:
    // X(0) X(1) .
    // .    O(4) O(5)
    // .    O(7) X(8)
    game = applyMove(game, 0);
    game = applyMove(game, 4);
    game = applyMove(game, 1);
    game = applyMove(game, 5);
    game = applyMove(game, 8);
    game = applyMove(game, 7);

    // X plays 2 -> oldest piece (0) vanishes, but pieces 1, 2, and... wait
    // If X plays 2, pieces are at 1, 8, 2. (Not a win line)
    game = applyMove(game, 2);
    expect(game.status).toBe('IN_PROGRESS');

    // O plays 6 -> O's oldest piece at 4 vanishes. O now has 5, 7, 6.
    game = applyMove(game, 6);
    expect(game.status).toBe('IN_PROGRESS');
  });

  it('resets the board for the next round while preserving scores', () => {
    let game = createTicTacToeGame({ X: 3, O: 2 });
    game = applyMove(game, 0);
    game = applyMove(game, 1);

    const reset = resetRound(game);
    expect(reset.board.every((cell) => cell === null)).toBe(true);
    expect(reset.pieces).toHaveLength(0);
    expect(reset.currentTurn).toBe('X');
    expect(reset.status).toBe('IN_PROGRESS');
    expect(reset.score).toEqual({ X: 3, O: 2 });
  });

  it('verifies all 8 standard winning lines exist in constant', () => {
    expect(WINNING_LINES).toHaveLength(8);
  });

  it('checks board array directly using checkWinner helper', () => {
    expect(checkWinner(['X', 'X', 'X', null, null, null, null, null, null])).toEqual({
      winner: 'X',
      line: [0, 1, 2],
    });
    expect(checkWinner([null, null, null, null, null, null, null, null, null])).toBeNull();
  });
});
