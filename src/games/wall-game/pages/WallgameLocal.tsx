import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GameState,
  Position,
  Wall,
  WallOrientation,
  createGame,
  applyMove,
  applyWall,
  getRecommendedGridSize,
} from '../engine';
import { Board } from '../components/Board';
import { WALL_BOT_STYLES, WallBotStyle, chooseWallBotAction, describeWallBotStyle } from '../engine/ai';
import { VictoryModal } from '../components/VictoryModal';
import { RotateCw, ArrowLeft, HelpCircle } from 'lucide-react';

const botStyleChoiceStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 6px',
  borderRadius: 'var(--r2)',
  border: active ? '2px solid var(--gold)' : '1px solid var(--line-strong)',
  background: active ? 'var(--bg-stage)' : '#ffffff',
  color: active ? 'var(--gold)' : 'var(--ink)',
  fontFamily: 'var(--mono)',
  fontSize: '11.5px',
  lineHeight: 1.2,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
});

const botCountChipStyle = (active: boolean): React.CSSProperties => ({
  width: '34px',
  height: '34px',
  flexShrink: 0,
  borderRadius: 'var(--r2)',
  border: active ? '2px solid var(--gold)' : '1px solid var(--line-strong)',
  background: active ? 'var(--bg-stage)' : '#ffffff',
  color: active ? 'var(--gold)' : 'var(--ink)',
  font: '12px/1 var(--mono)',
  cursor: 'pointer',
});

const botTagStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '9px',
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: '.06em',
  color: 'var(--gold)',
  border: '1px solid var(--gold)',
  borderRadius: 'var(--r2)',
  padding: '2px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const BotTag: React.FC = () => <span data-testid="bot-tag" style={botTagStyle}>BOT</span>;

export const WallgameLocal: React.FC = () => {
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [gridSizeOption, setGridSizeOption] = useState<string>('auto');
  const [playerNames, setPlayerNames] = useState<string[]>([
    'Pemain 1',
    'Pemain 2',
    'Pemain 3',
    'Pemain 4',
    'Pemain 5',
    'Pemain 6',
  ]);

  const [botStyle, setBotStyle] = useState<WallBotStyle | null>(null);
  const [botCount, setBotCount] = useState(1);

  const [game, setGame] = useState<GameState | null>(null);
  const [wallOrientation, setWallOrientation] = useState<WallOrientation>('H');
  const [actionError, setActionError] = useState<string | null>(null);

  const rulesDialogRef = useRef<HTMLDialogElement>(null);

  const effectiveGridSize =
    gridSizeOption === 'auto'
      ? getRecommendedGridSize(playerCount)
      : parseInt(gridSizeOption, 10);

  const botSeats = botStyle
    ? Array.from({ length: Math.max(0, Math.min(botCount, playerCount - 1)) }, (_, i) => playerCount - 1 - i)
    : [];
  const isBotSeat = (index: number) => botSeats.includes(index);

  // Only a seat still carrying its default label is renamed, so a typed name still wins.
  const namesForGame = () =>
    playerNames.slice(0, playerCount).map((name, idx) => {
      const untouched = !name.trim() || name.trim() === `Pemain ${idx + 1}`;
      return isBotSeat(idx) && untouched ? `Bot ${idx + 1}` : name;
    });

  const handleStartGame = () => {
    const newGame = createGame({
      playerCount,
      gridSize: effectiveGridSize,
      playerNames: namesForGame(),
    });
    setGame(newGame);
    setActionError(null);
  };

  const handleResetGame = () => {
    if (window.confirm('Mulai ulang permainan baru?')) {
      handleStartGame();
    }
  };

  const handleExitToSetup = () => {
    if (window.confirm('Kembali ke menu konfigurasi?')) {
      setGame(null);
    }
  };

  const handleSelectMove = (target: Position) => {
    if (!game || game.phase !== 'ACTION') return;
    if (isBotSeat(game.activePlayerIndex)) return;
    try {
      setActionError(null);
      const nextState = applyMove(game, target);
      setGame(nextState);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handlePlaceWall = (wall: Wall) => {
    if (!game || game.phase !== 'ACTION') return;
    if (isBotSeat(game.activePlayerIndex)) return;
    try {
      setActionError(null);
      const nextState = applyWall(game, wall);
      setGame(nextState);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  useEffect(() => {
    if (!game || game.phase !== 'ACTION' || !botStyle) return;
    if (!isBotSeat(game.activePlayerIndex)) return;

    // The pause is pacing, not search time: it lets a human follow which seat moved.
    const timer = setTimeout(() => {
      setGame((prev) => {
        if (!prev || prev.phase !== 'ACTION' || !isBotSeat(prev.activePlayerIndex)) return prev;
        const action = chooseWallBotAction(prev, botStyle);
        return action.type === 'WALL' ? applyWall(prev, action.wall) : applyMove(prev, action.target);
      });
    }, 520);

    return () => clearTimeout(timer);
  }, [botStyle, game]);

  // Keyboard shortcut: Space or R toggles wall orientation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'r' || e.key === 'R') {
        if (game && game.phase === 'ACTION') {
          e.preventDefault();
          setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game]);

  const activePlayer = game ? game.players[game.activePlayerIndex] : null;
  const winner = game && game.winnerId !== null ? game.players[game.winnerId] : null;
  const botTurn = !!game && game.phase === 'ACTION' && isBotSeat(game.activePlayerIndex);

  return (
    <div style={{ maxWidth: '960px', margin: '24px auto', padding: '0 16px' }}>
      {/* Editorial Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px 12px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <Link
            to="/wall-game"
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
            aria-label="Kembali ke Lobby"
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
              WallGo · {botStyle ? 'Lawan Bot' : 'Mode Hotseat Lokal'}
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              Papan Catur Halang Rintang · {game ? `${game.playerCount} Pemain` : 'Konfigurasi'}
              {botStyle ? ` · ${botSeats.length} bot` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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

          {game && (
            <>
              <button
                type="button"
                onClick={handleExitToSetup}
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
                Setup
              </button>
              <button
                type="button"
                onClick={handleResetGame}
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
            </>
          )}
        </div>
      </header>

      {/* Screen 1: Game Setup Form */}
      {!game && (
        <div
          style={{
            maxWidth: '560px',
            margin: '40px auto',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            padding: '28px 24px',
            background: '#ffffff',
            boxShadow: '0 4px 12px rgba(28, 25, 23, 0.05)',
          }}
        >
          <div style={{ marginBottom: '22px' }}>
            <span
              style={{
                font: '10px/1 var(--mono)',
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--gold)',
              }}
            >
              Langkah 1 dari 1 · Konfigurasi Pertandingan
            </span>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '6px 0 0',
                color: 'var(--ink)',
              }}
            >
              Pilih Jumlah Pemain
            </h2>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                font: '11px/1 var(--mono)',
                textTransform: 'uppercase',
                color: 'var(--ink-dim)',
                marginBottom: '8px',
                letterSpacing: '.05em',
              }}
            >
              Jumlah Pemain (2 - 6)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {[2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  data-testid={`player-count-${num}`}
                  onClick={() => setPlayerCount(num)}
                  style={{
                    padding: '12px 0',
                    textAlign: 'center',
                    borderRadius: 'var(--r2)',
                    border: playerCount === num ? '2px solid var(--gold)' : '1px solid var(--line-strong)',
                    background: playerCount === num ? 'var(--bg-stage)' : '#ffffff',
                    color: playerCount === num ? 'var(--gold)' : 'var(--ink)',
                    fontWeight: playerCount === num ? 700 : 500,
                    fontFamily: 'var(--mono)',
                    fontSize: '14px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {num}P
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                font: '11px/1 var(--mono)',
                textTransform: 'uppercase',
                color: 'var(--ink-dim)',
                marginBottom: '8px',
                letterSpacing: '.05em',
              }}
            >
              Ukuran Papan
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { id: 'auto', label: 'Auto (Seimbang)' },
                { id: '9', label: '9 × 9' },
                { id: '11', label: '11 × 11' },
                { id: '13', label: '13 × 13' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGridSizeOption(opt.id)}
                  style={{
                    padding: '10px 4px',
                    textAlign: 'center',
                    borderRadius: 'var(--r2)',
                    border: gridSizeOption === opt.id ? '2px solid var(--gold)' : '1px solid var(--line-strong)',
                    background: gridSizeOption === opt.id ? 'var(--bg-stage)' : '#ffffff',
                    color: gridSizeOption === opt.id ? 'var(--gold)' : 'var(--ink)',
                    fontSize: '12px',
                    fontWeight: gridSizeOption === opt.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ font: '11px/1.4 var(--mono)', color: 'var(--ink-faint)', marginTop: '8px' }}>
              Ukuran aktif: {effectiveGridSize}×{effectiveGridSize} petak (Pusat Emas di petak{' '}
              {Math.floor(effectiveGridSize / 2)}, {Math.floor(effectiveGridSize / 2)})
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                font: '11px/1 var(--mono)',
                textTransform: 'uppercase',
                color: 'var(--ink-dim)',
                marginBottom: '8px',
                letterSpacing: '.05em',
              }}
            >
              Nama Pemain
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      font: '12px/1 var(--mono)',
                      color: 'var(--ink-faint)',
                      width: '24px',
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={playerNames[idx]}
                    maxLength={20}
                    onChange={(e) => {
                      const updated = [...playerNames];
                      updated[idx] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--r2)',
                      border: '1px solid var(--line-strong)',
                      fontSize: '13px',
                      background: '#ffffff',
                      color: 'var(--ink)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }} role="group" aria-labelledby="wallgame-bot-label">
            <label
              id="wallgame-bot-label"
              style={{
                display: 'block',
                font: '11px/1 var(--mono)',
                textTransform: 'uppercase',
                color: 'var(--ink-dim)',
                marginBottom: '8px',
                letterSpacing: '.05em',
              }}
            >
              Lawan Bot
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                data-testid="bot-style-none"
                aria-pressed={botStyle === null}
                onClick={() => setBotStyle(null)}
                style={botStyleChoiceStyle(botStyle === null)}
              >
                Semua Manusia
              </button>
              {WALL_BOT_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  data-testid={`bot-style-${style.id}`}
                  aria-pressed={botStyle === style.id}
                  onClick={() => setBotStyle(style.id)}
                  style={botStyleChoiceStyle(botStyle === style.id)}
                >
                  {style.label}
                </button>
              ))}
            </div>
            <p style={{ font: '11.5px/1.5 var(--mono)', color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              {botStyle
                ? describeWallBotStyle(botStyle)
                : 'Semua kursi diisi pemain di satu perangkat.'}
            </p>
            {botStyle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>Jumlah bot</span>
                {Array.from({ length: playerCount - 1 }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    data-testid={`bot-count-${num}`}
                    aria-pressed={Math.min(botCount, playerCount - 1) === num}
                    onClick={() => setBotCount(num)}
                    style={botCountChipStyle(Math.min(botCount, playerCount - 1) === num)}
                  >
                    {num}
                  </button>
                ))}
                <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)' }}>
                  kursi terakhir
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="start-game-btn"
            onClick={handleStartGame}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--r2)',
              border: 'none',
              background: 'var(--gold)',
              color: '#ffffff',
              fontWeight: 700,
              font: '13px/1 var(--mono)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(180, 83, 9, 0.2)',
            }}
          >
            Mulai Permainan →
          </button>
        </div>
      )}

      {/* Screen 2: Active Match Hotseat Arena */}
      {game && activePlayer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Turn Banner with Active Pawn Indicator */}
          <div
            data-testid="turn-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 'var(--r3)',
              background: '#ffffff',
              border: `1.5px solid ${activePlayer.theme.hex}`,
              boxShadow: '0 2px 8px rgba(28, 25, 23, 0.04)',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: activePlayer.theme.hex,
                  border: `2px solid ${activePlayer.theme.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: activePlayer.theme.text,
                  fontWeight: 700,
                  font: '13px/1 var(--mono)',
                }}
              >
                {activePlayer.id + 1}
              </div>
              <div>
                <div style={{ font: '10px/1 var(--mono)', color: 'var(--gold)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {botTurn ? 'Giliran Bot' : 'Giliran Aktif'} · Putaran #{game.turn}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activePlayer.name}
                  {isBotSeat(game.activePlayerIndex) && <BotTag />}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', font: 'var(--mono)', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--ink-faint)' }}>Jarak ke Inti: </span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{activePlayer.distanceToCore} langkah</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-faint)' }}>Sisa Dinding: </span>
                <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{activePlayer.wallsRemaining} balok</span>
              </div>
            </div>
          </div>

          {/* Main SVG Board (with integrated zero-shift Action Dock) */}
          <Board
            gameState={game}
            wallOrientation={wallOrientation}
            onSelectMove={handleSelectMove}
            onPlaceWall={handlePlaceWall}
            onOrientationChange={setWallOrientation}
            disabled={game.phase === 'GAME_OVER' || botTurn}
            statusNotice={botTurn ? `Giliran ${activePlayer.name}, papan dikunci...` : undefined}
          />

          {/* Action Error Notice */}
          {actionError && (
            <div
              data-testid="action-error"
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--r2)',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '11.5px',
                fontFamily: 'var(--mono)',
                textAlign: 'center',
              }}
            >
              {actionError}
            </div>
          )}

          {/* Player Roster Status Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(132px, 100%), 1fr))',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {game.players.map((p, idx) => {
              const isTurn = idx === game.activePlayerIndex;
              return (
                <div
                  key={p.id}
                  data-testid={`roster-player-${p.id}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--r2)',
                    background: '#ffffff',
                    border: isTurn ? `1.5px solid ${p.theme.hex}` : '1px solid var(--line)',
                    opacity: isTurn ? 1 : 0.75,
                    font: 'var(--mono)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: p.theme.hex,
                      }}
                    />
                    <strong style={{ color: 'var(--ink)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </strong>
                  </div>
                  <div style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                    Sisa: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{p.wallsRemaining}</span> balok
                  </div>
                  <div style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                    Jarak: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.distanceToCore}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rules Dialog */}
      <dialog
        ref={rulesDialogRef}
        aria-labelledby="rules-title"
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
        <h2 id="rules-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px', color: 'var(--ink)' }}>
          Aturan WallGo (Quoridor Core)
        </h2>
        <ul style={{ fontSize: '13px', lineHeight: 1.6, paddingLeft: '18px', color: 'var(--ink-dim)', margin: '0 0 18px' }}>
          <li>
            <strong>Tujuan:</strong> Bidak pertama yang mencapai <em>The Golden Core</em> (petak tengah berlingkaran emas) langsung memenangkan pertandingan.
          </li>
          <li>
            <strong>Tindakan Giliran:</strong> Setiap giliran, pemain memilih <em>melangkah 1 petak</em> (ke atas, bawah, kiri, kanan) ATAU <em>memasang 1 balok dinding</em> (panjang 2 petak).
          </li>
          <li>
            <strong>Melompati Lawan:</strong> Jika berhadapan langsung dengan bidak lawan tanpa terhalang dinding, Anda dapat melompati bidak tersebut.
          </li>
          <li>
            <strong>Aturan Keadilan (Fair Rule):</strong> Pemasangan dinding yang mengunci total jalan pemain mana pun menuju The Golden Core adalah pelanggaran dan dilarang (diverifikasi oleh BFS pathfinder).
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

      {/* Victory Modal */}
      {game && (
        <VictoryModal
          isOpen={game.phase === 'GAME_OVER' && winner !== null}
          winner={winner}
          turn={game.turn}
          gridSize={game.gridSize}
          onRestart={handleStartGame}
          onNewSetup={() => setGame(null)}
          onClose={() => {}}
        />
      )}
    </div>
  );
};
