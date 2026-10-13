import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, ArrowLeft, Trophy } from 'lucide-react';
import {
  createTicTacToeGame,
  applyMove,
  resetRound,
  TicTacToeState,
} from '../engine';
import { TicTacToeBoard } from '../components/TicTacToeBoard';

export const TicTacToeLocal: React.FC = () => {
  const [game, setGame] = useState<TicTacToeState>(() => createTicTacToeGame());

  const handleCellClick = (index: number) => {
    if (game.status !== 'IN_PROGRESS') return;
    try {
      const next = applyMove(game, index);
      setGame(next);
    } catch {
      // Cell already occupied or illegal
    }
  };

  const handleNextRound = () => {
    setGame((prev) => resetRound(prev));
  };

  const handleResetMatch = () => {
    if (window.confirm('Reset pertandingan dan hapus skor?')) {
      setGame(createTicTacToeGame());
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '32px auto', padding: '0 20px' }}>
      {/* Editorial Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line-strong)',
              background: '#ffffff',
              color: 'var(--ink)',
              textDecoration: 'none',
            }}
            aria-label="Kembali ke Hub"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1
              style={{
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '-0.015em',
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              Tic Tac Toe · Mode Klasik
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              Papan 3 × 3 · Duel Hotseat Lokal
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetMatch}
          data-testid="tictactoe-reset-match-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            color: 'var(--ink-dim)',
            font: '11px/1 var(--mono)',
            cursor: 'pointer',
          }}
        >
          <RotateCw size={13} /> Reset Skor
        </button>
      </header>

      {/* Scoreboard Cards */}
      <div
        data-testid="tictactoe-scoreboard"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '20px',
          textAlign: 'center',
          font: 'var(--mono)',
        }}
      >
        <div
          style={{
            padding: '12px 8px',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            border: game.currentTurn === 'X' && game.status === 'IN_PROGRESS' ? '1.5px solid #b45309' : '1px solid var(--line)',
          }}
        >
          <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Pemain X
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#b45309' }}>{game.score.X}</div>
        </div>

        <div
          style={{
            padding: '12px 8px',
            borderRadius: 'var(--r2)',
            background: 'var(--bg-stage)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Seri (Draw)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink-dim)' }}>{game.score.draws}</div>
        </div>

        <div
          style={{
            padding: '12px 8px',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            border: game.currentTurn === 'O' && game.status === 'IN_PROGRESS' ? '1.5px solid #451a03' : '1px solid var(--line)',
          }}
        >
          <div style={{ fontSize: '10px', color: '#451a03', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Pemain O
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#451a03' }}>{game.score.O}</div>
        </div>
      </div>

      {/* Match Status Banner */}
      <div
        data-testid="tictactoe-status-banner"
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--r3)',
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          textAlign: 'center',
          marginBottom: '20px',
        }}
      >
        {game.status === 'IN_PROGRESS' && (
          <div style={{ font: '13px/1 var(--mono)', color: 'var(--ink)' }}>
            Giliran Aktif:{' '}
            <strong style={{ color: game.currentTurn === 'X' ? '#b45309' : '#451a03' }}>
              Pemain {game.currentTurn}
            </strong>
          </div>
        )}

        {game.status === 'WIN' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, font: '14px/1 var(--mono)' }}>
            <Trophy size={16} /> Pemain {game.winner} Memenangkan Ronde Ini!
          </div>
        )}

        {game.status === 'DRAW' && (
          <div style={{ color: 'var(--ink-dim)', fontWeight: 600, font: '13px/1 var(--mono)' }}>
            Hasil Seri! Papan terisi penuh tanpa pemenang.
          </div>
        )}
      </div>

      {/* 3x3 Board */}
      <TicTacToeBoard
        board={game.board}
        winningLine={game.winningLine}
        onCellClick={handleCellClick}
        disabled={game.status !== 'IN_PROGRESS'}
      />

      {/* Next Round Button if finished */}
      {game.status !== 'IN_PROGRESS' && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            type="button"
            data-testid="tictactoe-next-round-btn"
            onClick={handleNextRound}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--r2)',
              border: 'none',
              background: 'var(--gold)',
              color: '#ffffff',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(180, 83, 9, 0.2)',
            }}
          >
            <RotateCw size={14} /> Ronde Berikutnya →
          </button>
        </div>
      )}
    </div>
  );
};
