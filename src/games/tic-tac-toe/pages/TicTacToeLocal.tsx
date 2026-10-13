import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, ArrowLeft, Trophy, HelpCircle, Home, Sparkles } from 'lucide-react';
import {
  createTicTacToeGame,
  applyMove,
  resetRound,
  getPlayerPieces,
  getOldestPiece,
  TicTacToeState,
} from '../engine';
import { TicTacToeBoard } from '../components/TicTacToeBoard';

export const TicTacToeLocal: React.FC = () => {
  const [game, setGame] = useState<TicTacToeState>(() => createTicTacToeGame());

  const rulesDialogRef = useRef<HTMLDialogElement>(null);
  const victoryDialogRef = useRef<HTMLDialogElement>(null);

  // Automatically show victory dialog when a player wins
  useEffect(() => {
    if (game.status === 'WIN') {
      victoryDialogRef.current?.showModal();
    }
  }, [game.status]);

  const handleCellClick = (index: number) => {
    if (game.status !== 'IN_PROGRESS') return;
    try {
      const next = applyMove(game, index);
      setGame(next);
    } catch {
      // Cell already occupied
    }
  };

  const handleNextRound = () => {
    victoryDialogRef.current?.close();
    setGame((prev) => resetRound(prev));
  };

  const handleResetMatch = () => {
    if (window.confirm('Reset pertandingan dan hapus skor?')) {
      victoryDialogRef.current?.close();
      setGame(createTicTacToeGame());
    }
  };

  const activePlayerPieces = getPlayerPieces(game.pieces, game.currentTurn);
  const activeOldestPiece = getOldestPiece(game.pieces, game.currentTurn);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  letterSpacing: '-0.015em',
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                Tic Tac Toe · Mode No-Draw
              </h1>
              <span
                style={{
                  font: '9px/1 var(--mono)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  background: 'var(--gold-tint)',
                  border: '1px solid var(--gold-border)',
                  padding: '2px 5px',
                  borderRadius: 'var(--r2)',
                }}
              >
                Tanpa Seri
              </span>
            </div>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              Maks. 3 Bidak Aktif · Bidak Tertua Lenyap Otomatis
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.showModal()}
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
            <HelpCircle size={14} /> Aturan
          </button>

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
            <RotateCw size={13} /> Reset
          </button>
        </div>
      </header>

      {/* Scoreboard Cards */}
      <div
        data-testid="tictactoe-scoreboard"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginBottom: '20px',
          textAlign: 'center',
          font: 'var(--mono)',
        }}
      >
        <div
          style={{
            padding: '12px 10px',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            border: game.currentTurn === 'X' && game.status === 'IN_PROGRESS' ? '2px solid #b45309' : '1px solid var(--line)',
            boxShadow: game.currentTurn === 'X' && game.status === 'IN_PROGRESS' ? '0 2px 8px rgba(180, 83, 9, 0.12)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Pemain X
            </span>
            <span style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
              ({getPlayerPieces(game.pieces, 'X').length}/3 Bidak)
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#b45309' }}>{game.score.X}</div>
        </div>

        <div
          style={{
            padding: '12px 10px',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            border: game.currentTurn === 'O' && game.status === 'IN_PROGRESS' ? '2px solid #451a03' : '1px solid var(--line)',
            boxShadow: game.currentTurn === 'O' && game.status === 'IN_PROGRESS' ? '0 2px 8px rgba(69, 26, 3, 0.12)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', color: '#451a03', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Pemain O
            </span>
            <span style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
              ({getPlayerPieces(game.pieces, 'O').length}/3 Bidak)
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#451a03' }}>{game.score.O}</div>
        </div>
      </div>

      {/* Match Status Banner */}
      <div
        data-testid="tictactoe-status-banner"
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--r3)',
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          textAlign: 'center',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(28, 25, 23, 0.04)',
        }}
      >
        {game.status === 'IN_PROGRESS' && (
          <div>
            <div style={{ font: '13px/1.3 var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>
              Giliran Aktif:{' '}
              <strong style={{ color: game.currentTurn === 'X' ? '#b45309' : '#451a03', fontSize: '15px' }}>
                Pemain {game.currentTurn}
              </strong>{' '}
              · Bidak ke-{activePlayerPieces.length + 1}
            </div>

            {activeOldestPiece && (
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--gold)',
                  background: 'var(--gold-tint)',
                  padding: '4px 10px',
                  borderRadius: 'var(--r2)',
                  display: 'inline-block',
                }}
              >
                <span style={{ fontWeight: 600 }}>Perhatian:</span> Bidak tertua di petak #{activeOldestPiece.cellIndex + 1} akan lenyap saat Anda melangkah.
              </div>
            )}
          </div>
        )}

        {game.status === 'WIN' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, font: '15px/1 var(--mono)' }}>
            <Trophy size={18} /> Pemain {game.winner} Memenangkan Ronde Ini!
          </div>
        )}
      </div>

      {/* 3x3 Board with No-Draw FIFO visual indicators */}
      <TicTacToeBoard
        board={game.board}
        pieces={game.pieces}
        currentTurn={game.currentTurn}
        winningLine={game.winningLine}
        onCellClick={handleCellClick}
        disabled={game.status !== 'IN_PROGRESS'}
      />

      {/* Next Round Button below board */}
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
            <RotateCw size={14} /> Ronde Berikutnya
          </button>
        </div>
      )}

      <dialog
        ref={rulesDialogRef}
        aria-labelledby="tictactoe-rules-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const rect = e.currentTarget.getBoundingClientRect();
            const inContent =
              rect.top <= e.clientY &&
              e.clientY <= rect.top + rect.height &&
              rect.left <= e.clientX &&
              e.clientX <= rect.left + rect.width;
            if (!inContent) {
              rulesDialogRef.current?.close();
            }
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          margin: 'auto',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          padding: '24px',
          background: '#ffffff',
          boxShadow: '0 12px 32px rgba(28, 25, 23, 0.12)',
          maxWidth: '520px',
          width: 'calc(100% - 32px)',
          color: 'var(--ink)',
        }}
      >
        <h2 id="tictactoe-rules-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px', color: 'var(--ink)' }}>
          Aturan No-Draw Tic Tac Toe (Infinite 3-Pieces)
        </h2>
        <ul style={{ fontSize: '13px', lineHeight: 1.6, paddingLeft: '18px', color: 'var(--ink-dim)', margin: '0 0 18px' }}>
          <li>
            <strong>Batas 3 Bidak:</strong> Setiap pemain hanya boleh memiliki maksimal 3 bidak di papan pada saat bersamaan.
          </li>
          <li>
            <strong>Mekanisme Lenyap (FIFO):</strong> Pada giliran ke-4 dan seterusnya, saat Anda meletakkan bidak baru, <em>bidak paling tua</em> milik Anda akan otomatis lenyap dari papan.
          </li>
          <li>
            <strong>Mustahil Seri (No Draw):</strong> Karena petak papan tidak akan pernah terkunci penuh, hasil seri mustahil terjadi. Pertandingan terus bergerak secara dinamis sampai salah satu pemain berhasil menyusun 3 bidak segaris.
          </li>
          <li>
            <strong>Taktik & Prediksi:</strong> Bidak tertua yang akan lenyap ditandai dengan garis putus-putus dan label <em>"Akan Lenyap"</em> agar pemain dapat memperhitungkan langkah berikutnya.
          </li>
        </ul>
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.close()}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line-strong)',
              background: 'var(--bg-stage)',
              color: 'var(--ink)',
              font: '12px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </dialog>

      <dialog
        ref={victoryDialogRef}
        aria-labelledby="tictactoe-victory-title"
        data-testid="tictactoe-victory-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const rect = e.currentTarget.getBoundingClientRect();
            const inContent =
              rect.top <= e.clientY &&
              e.clientY <= rect.top + rect.height &&
              rect.left <= e.clientX &&
              e.clientX <= rect.left + rect.width;
            if (!inContent) {
              victoryDialogRef.current?.close();
            }
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          margin: 'auto',
          border: '1px solid var(--gold-border)',
          borderRadius: 'var(--r4)',
          padding: '0',
          background: '#ffffff',
          boxShadow: '0 20px 40px rgba(180, 83, 9, 0.18), 0 2px 8px rgba(28, 25, 23, 0.08)',
          maxWidth: '420px',
          width: 'calc(100% - 32px)',
          color: 'var(--ink)',
        }}
      >
        <div style={{ padding: '28px 24px 22px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--bg-stage)',
              border: '2px solid var(--gold)',
              color: 'var(--gold)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Sparkles size={28} />
          </div>

          <div
            style={{
              font: '10px/1 var(--mono)',
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              marginBottom: '6px',
            }}
          >
            RONDE SELESAI · NO DRAW ARENA
          </div>

          <h2
            id="tictactoe-victory-title"
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Pemain {game.winner} Menang!
          </h2>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              borderRadius: 'var(--r2)',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line)',
              marginBottom: '18px',
              font: '12px/1 var(--mono)',
              color: 'var(--ink-dim)',
            }}
          >
            Menyusun 3 Garis Lurus Sempurna
          </div>

          {/* Match Score Recap */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r2)',
              padding: '12px 8px',
              marginBottom: '22px',
              font: 'var(--mono)',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                Skor Pemain X
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#b45309' }}>{game.score.X}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#451a03', fontWeight: 700, textTransform: 'uppercase' }}>
                Skor Pemain O
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#451a03' }}>{game.score.O}</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={handleNextRound}
              data-testid="victory-next-round-btn"
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--gold)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <RotateCw size={14} /> Ronde Berikutnya
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={handleResetMatch}
                style={{
                  padding: '10px',
                  background: 'var(--bg-stage)',
                  border: '1px solid var(--line-strong)',
                  color: 'var(--ink)',
                  borderRadius: 'var(--r2)',
                  font: '11px/1 var(--mono)',
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Reset Skor
              </button>

              <Link
                to="/"
                onClick={() => victoryDialogRef.current?.close()}
                style={{
                  padding: '10px',
                  background: 'var(--bg-stage)',
                  border: '1px solid var(--line-strong)',
                  color: 'var(--ink)',
                  borderRadius: 'var(--r2)',
                  font: '11px/1 var(--mono)',
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Home size={12} /> Menu Utama
              </Link>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
};
