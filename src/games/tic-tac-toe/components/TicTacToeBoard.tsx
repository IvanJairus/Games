import React from 'react';
import { CellValue, WinLine, Piece, PlayerSymbol } from '../engine/types';
import { getOldestPiece } from '../engine';

export interface TicTacToeBoardProps {
  board: CellValue[];
  pieces: Piece[];
  currentTurn: PlayerSymbol;
  winningLine: WinLine | null;
  onCellClick: (index: number) => void;
  disabled?: boolean;
}

export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  board,
  pieces,
  currentTurn,
  winningLine,
  onCellClick,
  disabled = false,
}) => {
  const expiringPiece = !winningLine ? getOldestPiece(pieces, currentTurn) : null;

  return (
    <div
      role="grid"
      aria-label="Papan Tic Tac Toe 3 kali 3 Tanpa Seri"
      data-testid="tictactoe-board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
        maxWidth: '380px',
        width: '100%',
        margin: '0 auto',
        padding: '16px',
        background: 'var(--bg-paper)',
        borderRadius: 'var(--r4)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 4px 16px rgba(28, 25, 23, 0.06)',
      }}
    >
      {board.map((cell, idx) => {
        const isWinningCell = winningLine ? winningLine.includes(idx) : false;
        const isExpiringCell = expiringPiece?.cellIndex === idx;
        const isAvailable = cell === null && !disabled;

        // Find piece info for this cell to display sequence badge if present
        const cellPiece = pieces.find((p) => p.cellIndex === idx);
        const playerPieceList = cellPiece
          ? pieces.filter((p) => p.player === cellPiece.player).sort((a, b) => a.order - b.order)
          : [];
        const pieceRank = cellPiece ? playerPieceList.findIndex((p) => p.id === cellPiece.id) + 1 : null;

        return (
          <button
            key={idx}
            type="button"
            role="gridcell"
            aria-label={`Petak ${idx + 1}, ${
              cell
                ? `terisi ${cell}${isExpiringCell ? ' (akan lenyap langkah berikutnya)' : ''}`
                : 'kosong'
            }`}
            data-testid={`cell-${idx}`}
            disabled={!isAvailable}
            onClick={() => onCellClick(idx)}
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              minHeight: '74px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: isWinningCell
                ? 'var(--gold-tint)'
                : isExpiringCell
                ? '#fffbeb'
                : '#ffffff',
              border: isWinningCell
                ? '2px solid var(--gold)'
                : isExpiringCell
                ? '2px dashed var(--gold)'
                : '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              fontSize: 'clamp(32px, 8vw, 44px)',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              cursor: isAvailable ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
              color: cell === 'X' ? '#b45309' : '#451a03',
              boxShadow: isWinningCell
                ? '0 0 12px rgba(180, 83, 9, 0.25)'
                : 'none',
              userSelect: 'none',
            }}
          >
            {/* Symbol X or O */}
            <span
              style={{
                opacity: isExpiringCell ? 0.6 : 1,
                lineHeight: 1,
              }}
            >
              {cell}
            </span>

            {/* Sequence Rank Indicator (1/3, 2/3, 3/3) */}
            {cell && pieceRank && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '6px',
                  fontSize: '9px',
                  fontFamily: 'var(--mono)',
                  letterSpacing: '.04em',
                  color: isExpiringCell ? 'var(--gold)' : 'var(--ink-faint)',
                  fontWeight: 600,
                }}
              >
                #{pieceRank}
              </span>
            )}

            {/* Warning Tag when piece is about to vanish */}
            {isExpiringCell && (
              <span
                data-testid={`expiring-indicator-${idx}`}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  fontSize: '8px',
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  background: 'var(--gold-tint)',
                  padding: '1px 4px',
                  borderRadius: '2px',
                }}
              >
                Akan Lenyap
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
