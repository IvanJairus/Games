import { describe, it, expect } from 'vitest';
import {
  createTicTacToeGame,
  applyMove,
  checkWinner,
  resetRound,
  WINNING_LINES,
} from '@/games/tic-tac-toe/engine';

describe('Tic Tac Toe Engine', () => {
  it('initializes game with 9 empty cells, turn X, and zero scores', () => {
    const game = createTicTacToeGame();
    expect(game.board).toHaveLength(9);
    expect(game.board.every((cell) => cell === null)).toBe(true);
    expect(game.currentTurn).toBe('X');
    expect(game.status).toBe('IN_PROGRESS');
    expect(game.winner).toBeNull();
    expect(game.winningLine).toBeNull();
    expect(game.moveCount).toBe(0);
    expect(game.score).toEqual({ X: 0, O: 0, draws: 0 });
  });

  it('alternates turns correctly from X to O and updates moveCount', () => {
    let game = createTicTacToeGame();
    game = applyMove(game, 0); // X plays at 0
    expect(game.board[0]).toBe('X');
    expect(game.currentTurn).toBe('O');
    expect(game.moveCount).toBe(1);

    game = applyMove(game, 4); // O plays at 4
    expect(game.board[4]).toBe('O');
    expect(game.currentTurn).toBe('X');
    expect(game.moveCount).toBe(2);
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

  it('detects row win condition and increments score', () => {
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

  it('detects column and diagonal win conditions', () => {
    // Column 0 win: [0, 3, 6]
    let gCol = createTicTacToeGame();
    gCol = applyMove(gCol, 0); // X
    gCol = applyMove(gCol, 1); // O
    gCol = applyMove(gCol, 3); // X
    gCol = applyMove(gCol, 2); // O
    gCol = applyMove(gCol, 6); // X wins column 0
    expect(gCol.status).toBe('WIN');
    expect(gCol.winningLine).toEqual([0, 3, 6]);

    // Diagonal win: [0, 4, 8]
    let gDiag = createTicTacToeGame();
    gDiag = applyMove(gDiag, 0); // X
    gDiag = applyMove(gDiag, 1); // O
    gDiag = applyMove(gDiag, 4); // X
    gDiag = applyMove(gDiag, 2); // O
    gDiag = applyMove(gDiag, 8); // X wins diagonal
    expect(gDiag.status).toBe('WIN');
    expect(gDiag.winningLine).toEqual([0, 4, 8]);
  });

  it('detects a draw (tie) when all 9 squares are filled with no winner', () => {
    let game = createTicTacToeGame();
    // Sequence producing a draw:
    // X O X
    // X X O
    // O X O
    const moves = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (const m of moves) {
      game = applyMove(game, m);
    }

    expect(game.status).toBe('DRAW');
    expect(game.winner).toBeNull();
    expect(game.winningLine).toBeNull();
    expect(game.moveCount).toBe(9);
    expect(game.score.draws).toBe(1);
  });

  it('resets the board for the next round while preserving scores', () => {
    let game = createTicTacToeGame({ X: 3, O: 2, draws: 1 });
    game = applyMove(game, 0);
    game = applyMove(game, 1);

    const reset = resetRound(game);
    expect(reset.board.every((cell) => cell === null)).toBe(true);
    expect(reset.currentTurn).toBe('X');
    expect(reset.status).toBe('IN_PROGRESS');
    expect(reset.score).toEqual({ X: 3, O: 2, draws: 1 });
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
