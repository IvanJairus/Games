import React from 'react';
import { CellValue, WinLine } from '../engine/types';

export interface TicTacToeBoardProps {
  board: CellValue[];
  winningLine: WinLine | null;
  onCellClick: (index: number) => void;
  disabled?: boolean;
}

export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  board,
  winningLine,
  onCellClick,
  disabled = false,
}) => {
  return (
    <div
      role="grid"
      aria-label="Papan Tic Tac Toe 3 kali 3"
      data-testid="tictactoe-board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        maxWidth: '360px',
        width: '100%',
        margin: '0 auto',
        padding: '12px',
        background: 'var(--bg-paper)',
        borderRadius: 'var(--r4)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 4px 16px rgba(28, 25, 23, 0.06)',
      }}
    >
      {board.map((cell, idx) => {
        const isWinningCell = winningLine ? winningLine.includes(idx) : false;
        const isAvailable = cell === null && !disabled;

        return (
          <button
            key={idx}
            type="button"
            role="gridcell"
            aria-label={`Petak ${idx + 1}, ${cell ? `terisi ${cell}` : 'kosong'}`}
            data-testid={`cell-${idx}`}
            disabled={!isAvailable}
            onClick={() => onCellClick(idx)}
            style={{
              aspectRatio: '1 / 1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isWinningCell ? 'var(--gold-tint)' : '#ffffff',
              border: isWinningCell ? '2px solid var(--gold)' : '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              fontSize: 'clamp(28px, 8vw, 42px)',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              cursor: isAvailable ? 'pointer' : 'default',
              transition: 'background-color 0.15s ease, transform 0.1s ease',
              color: cell === 'X' ? '#b45309' : '#451a03',
              boxShadow: isWinningCell ? '0 0 10px rgba(180, 83, 9, 0.25)' : 'none',
              userSelect: 'none',
            }}
          >
            {cell}
          </button>
        );
      })}
    </div>
  );
};
