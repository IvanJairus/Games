import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCw, ArrowLeft, Trophy, HelpCircle, Home, Sparkles } from 'lucide-react';
import {
  createTicTacToeGame,
  applyMove,
  resetRound,
  getPlayerPieces,
  getOldestPiece,
  getHoldCell,
  MAX_HOLDS_PER_ROUND,
  TicTacToeState,
  PlayerSymbol,
} from '../engine';
import { TicTacToeBoard } from '../components/TicTacToeBoard';
import { BOT_LEVELS, BotLevel, chooseBotMove } from '../engine/ai';
import { playBlocked, playPlace, playSelect, playVictory, unlockAudio } from '../../common/audio';
import { buzzReject, buzzTap } from '../../common/haptics';
import { SoundToggle } from '../../common/SoundToggle';
import { ResultDialog } from '../../common/ResultDialog';

const BOT_SYMBOL: PlayerSymbol = 'O';

// Long enough that the vanishing square and the bot's new square are seen as two events.
const BOT_THINK_MS = 1200;
const NOTICE_MS = 3400;
// Tall enough for the warning plus the thinking line, measured at 375 px and 598 px viewports.
const HINT_SLOT_MIN_H = 78;

const readBotLevel = (raw: string | null): BotLevel | null =>
  raw && BOT_LEVELS.some((level) => level.id === raw) ? (raw as BotLevel) : null;

export const TicTacToeLocal: React.FC = () => {
  const [params] = useSearchParams();
  const botLevel = readBotLevel(params.get('bot'));
  const [game, setGame] = useState<TicTacToeState>(() => createTicTacToeGame());
  const [victoryOpen, setVictoryOpen] = useState(false);
  // The id restarts the dismiss timer when the same message is raised twice in a row.
  const [notice, setNotice] = useState<{ id: number; text: string; tone: 'warn' | 'info' } | null>(null);
  const noticeSeq = useRef(0);
  const raiseNotice = (text: string, tone: 'warn' | 'info' = 'warn') =>
    setNotice({ id: (noticeSeq.current += 1), text, tone });

  const rulesDialogRef = useRef<HTMLDialogElement>(null);

  const botTurn = !!botLevel && game.currentTurn === BOT_SYMBOL && game.status === 'IN_PROGRESS';
  const holdCell = getHoldCell(game);
  const seatLabel = (symbol: PlayerSymbol | null) =>
    symbol ? (botLevel && symbol === BOT_SYMBOL ? 'Bot' : `Pemain ${symbol}`) : '';

  useEffect(() => {
    setVictoryOpen(game.status === 'WIN');
  }, [game.status]);

  useEffect(() => {
    if (!botLevel || !botTurn) return;

    // The pause is pacing, not search time: the search itself lands in tens of milliseconds.
    // The click sound waits for the piece, so it does not announce a move 1.2s early.
    const timer = setTimeout(() => {
      if (game.status !== 'IN_PROGRESS' || game.currentTurn !== BOT_SYMBOL) return;
      const mover = game.currentTurn;
      const cell = chooseBotMove(game, botLevel);
      const next = applyMove(game, cell);
      setGame(next);

      // A bot hold moves no piece, so it needs naming or it reads as the last frame glitching.
      if (cell === getHoldCell(game)) {
        playSelect();
        raiseNotice(
          `${seatLabel(mover)} menahan bidaknya di petak #${cell + 1} dan menjadikannya bidak ` +
            `paling baru. Sisa tahan ${seatLabel(mover)}: ${next.holdsLeft[mover]}/${MAX_HOLDS_PER_ROUND}.`,
          'info'
        );
      } else {
        playPlace();
      }
    }, BOT_THINK_MS);

    return () => clearTimeout(timer);
  }, [botTurn, botLevel, game]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleCellClick = (index: number) => {
    if (game.status !== 'IN_PROGRESS') return;
    if (botTurn) return;
    try {
      const next = applyMove(game, index);
      unlockAudio();
      buzzTap();
      if (index === holdCell) {
        playSelect();
        raiseNotice(
          `Bidak di petak #${index + 1} ditahan. Ia tetap berdiri dan jadi bidak paling baru. ` +
            `Sisa tahan ${seatLabel(game.currentTurn)}: ${next.holdsLeft[game.currentTurn]}/${MAX_HOLDS_PER_ROUND}.`,
          'info'
        );
      } else {
        playPlace();
        setNotice(null);
      }
      setGame(next);
    } catch {
      // The square is taken. Name it and say when it frees up instead of only beeping.
      const expiring = getOldestPiece(game.pieces, game.currentTurn);
      raiseNotice(
        expiring?.cellIndex === index
          ? `Petak #${index + 1} memegang bidak tertua Anda dan jatah menahannya sudah habis. ` +
              `Ia lenyap begitu Anda melangkah, lalu bebas pada giliran berikutnya.`
          : `Petak #${index + 1} sudah terisi. Hanya petak kosong yang bisa dipilih.`
      );
      playBlocked();
      buzzReject();
    }
  };

  useEffect(() => {
    if (game.status === 'WIN') playVictory();
  }, [game.status]);

  const handleNextRound = () => {
    setVictoryOpen(false);
    setGame((prev) => resetRound(prev));
  };

  const handleResetMatch = () => {
    if (window.confirm('Reset pertandingan dan hapus skor?')) {
      setVictoryOpen(false);
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
            to="/tic-tac-toe"
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
              flexShrink: 0,
            }}
            aria-label="Kembali ke Lobby Tic Tac Toe"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  letterSpacing: '-0.015em',
                  margin: 0,
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                }}
              >
                Tic Tac Toe
              </h1>
              <span
                style={{
                  font: '9.5px/1 var(--mono)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  background: 'var(--gold-tint)',
                  border: '1px solid var(--gold-border)',
                  padding: '2px 6px',
                  borderRadius: 'var(--r2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Mode No-Draw
              </span>
            </div>
            <div style={{ font: '11px/1.3 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              {botLevel
                ? `Lawan Bot · tingkat ${botLevel}`
                : 'Hotseat Lokal · Maksimal 3 Bidak'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <SoundToggle />
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.showModal()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              background: '#ffffff',
              color: 'var(--ink-dim)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
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
              gap: '4px',
              padding: '6px 10px',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              background: '#ffffff',
              color: 'var(--ink-dim)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
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
              {seatLabel('X')}
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
              {seatLabel('O')}
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
          marginBottom: '10px',
          boxShadow: '0 2px 8px rgba(28, 25, 23, 0.04)',
        }}
      >
        {game.status === 'IN_PROGRESS' && (
          <div>
            <div style={{ font: '13px/1.3 var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>
              Giliran Aktif:{' '}
              <strong style={{ color: game.currentTurn === 'X' ? '#b45309' : '#451a03', fontSize: '15px' }}>
                {seatLabel(game.currentTurn)}
              </strong>{' '}
              · Bidak ke-{activePlayerPieces.length + 1}
            </div>

          </div>
        )}

        {game.status === 'WIN' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, font: '15px/1 var(--mono)' }}>
            <Trophy size={18} /> {seatLabel(game.winner)} Memenangkan Ronde Ini!
          </div>
        )}
      </div>

      {/*
        Hint slot. The copy changes with the turn, the box does not: an inline warning that grows
        the banner pushed the board down 47 px the moment a seat reached its third piece.
      */}
      <div
        data-testid="tictactoe-hint"
        style={{
          minHeight: `${HINT_SLOT_MIN_H}px`,
          marginBottom: '10px',
          textAlign: 'center',
        }}
      >
        {activeOldestPiece && (
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: 'var(--gold)',
              background: 'var(--gold-tint)',
              padding: '4px 10px',
              borderRadius: 'var(--r2)',
              display: 'inline-block',
            }}
          >
            <span style={{ fontWeight: 600 }}>Perhatian:</span> Bidak tertua{' '}
            {seatLabel(game.currentTurn)} di petak #{activeOldestPiece.cellIndex + 1} akan lenyap
            setelah {seatLabel(game.currentTurn)} melangkah.{' '}
            {holdCell === null
              ? 'Petak itu baru bisa ditempati pada giliran berikutnya.'
              : `Tap petaknya untuk menahannya. Sisa tahan ${game.holdsLeft[game.currentTurn]}/${MAX_HOLDS_PER_ROUND}.`}
          </div>
        )}

        {botTurn && (
          <div
            data-testid="tictactoe-bot-thinking"
            style={{ marginTop: '6px', font: '11px/1.3 var(--mono)', color: 'var(--ink-faint)' }}
          >
            Bot sedang memikirkan langkah...
          </div>
        )}
      </div>

      {notice && (
        <div
          data-testid="tictactoe-notice"
          data-tone={notice.tone}
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(18px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            width: 'min(460px, calc(100% - 32px))',
            maxWidth: 'calc(100% - 32px)',
            zIndex: 30,
            padding: '10px 14px',
            borderRadius: 'var(--r2)',
            border: `1px solid ${notice.tone === 'warn' ? 'var(--red)' : 'var(--gold-border)'}`,
            background: notice.tone === 'warn' ? '#fff' : 'var(--gold-tint)',
            color: notice.tone === 'warn' ? 'var(--red-deep)' : 'var(--gold)',
            font: '11px/1.45 var(--mono)',
            boxShadow:
              notice.tone === 'warn'
                ? '0 8px 24px rgba(143, 29, 20, 0.18)'
                : '0 8px 24px rgba(180, 83, 9, 0.14)',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* 3x3 Board with No-Draw FIFO visual indicators */}
      <TicTacToeBoard
        board={game.board}
        pieces={game.pieces}
        currentTurn={game.currentTurn}
        winningLine={game.winningLine}
        onCellClick={handleCellClick}
        disabled={game.status !== 'IN_PROGRESS' || botTurn}
        holdCell={holdCell}
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

      {/* Return to Lobby / Online Navigation */}
      <div style={{ marginTop: '28px', textAlign: 'center' }}>
        <Link
          to="/tic-tac-toe"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            font: '12px/1 var(--mono)',
            color: 'var(--ink-dim)',
            textDecoration: 'none',
            padding: '8px 16px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            background: 'var(--bg-stage)',
          }}
        >
          ← Kembali ke Lobby & Mode Online
        </Link>
      </div>

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
            <strong>Taktik &amp; Prediksi:</strong> Bidak tertua yang akan lenyap ditandai dengan garis putus-putus dan label <em>"Akan Lenyap"</em> agar pemain dapat memperhitungkan langkah berikutnya.
          </li>
          <li>
            <strong>Petak yang ditinggalkan:</strong> Petak bidak tertua tetap terisi sampai pemiliknya melangkah, jadi tidak bisa ditimpa lebih dulu. Ia baru bebas pada giliran berikutnya, dan lawan boleh langsung mengambilnya.
          </li>
          <li>
            <strong>Menahan bidak ({MAX_HOLDS_PER_ROUND} kali per ronde):</strong> Tap petak yang memegang bidak tertua Anda untuk menahannya. Bidaknya tetap berdiri dan menjadi bidak paling baru, giliran berpindah, dan jatah tahan kursi itu berkurang satu. Ini satu-satunya cara menyelamatkan bidak yang menutup langkah lawan.
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

      {game.status === 'WIN' && (
        <ResultDialog
          isOpen={victoryOpen}
          testId="tictactoe-victory-modal"
          titleId="tictactoe-victory-title"
          tone="win"
          crest={<Sparkles size={28} />}
          kicker="RONDE SELESAI · NO DRAW ARENA"
          title={`${seatLabel(game.winner)} Menang!`}
          chip="Menyusun 3 garis lurus sempurna"
          stats={[
            { label: `Skor ${seatLabel('X')}`, value: game.score.X, accent: true },
            { label: `Skor ${seatLabel('O')}`, value: game.score.O },
          ]}
          actions={[
            {
              label: 'Ronde Berikutnya',
              icon: <RotateCw size={14} />,
              onClick: handleNextRound,
              testId: 'victory-next-round-btn',
            },
            { label: 'Reset Skor', onClick: handleResetMatch },
          ]}
          links={[{ label: 'Menu Utama', icon: <Home size={12} />, to: '/' }]}
          onDismiss={() => setVictoryOpen(false)}
        />
      )}

    </div>
  );
};
