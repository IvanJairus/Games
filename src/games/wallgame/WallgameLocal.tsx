import React, { useState } from 'react';
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
} from '../../../supabase/functions/_shared/wallgame/engine';
import { Board } from './components/Board';
import { Trophy, RotateCw, ArrowLeft, HelpCircle } from 'lucide-react';

export const WallgameLocal: React.FC = () => {
  // Setup configuration state
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
  const [showRules, setShowRules] = useState<boolean>(false);

  // In-game state
  const [game, setGame] = useState<GameState | null>(null);
  const [wallOrientation, setWallOrientation] = useState<WallOrientation>('H');
  const [actionError, setActionError] = useState<string | null>(null);

  const effectiveGridSize =
    gridSizeOption === 'auto'
      ? getRecommendedGridSize(playerCount)
      : parseInt(gridSizeOption, 10);

  const handleStartGame = () => {
    const newGame = createGame({
      playerCount,
      gridSize: effectiveGridSize,
      playerNames: playerNames.slice(0, playerCount),
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
    try {
      setActionError(null);
      const nextState = applyWall(game, wall);
      setGame(nextState);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  // Keyboard shortcut: Space / R to toggle wall orientation
  React.useEffect(() => {
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

  // SETUP VIEW
  if (!game) {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: '840px', margin: '40px auto', padding: '0 24px' }}>
        <div className="paper-bg" />

        {/* Top Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', borderBottom: '1px solid var(--line)', paddingBottom: '14px' }}>
          <Link
            to="/wallgame"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              font: '12px/1 var(--mono)',
              color: 'var(--ink-dim)',
              letterSpacing: '.05em',
            }}
          >
            <ArrowLeft size={14} /> /games/wallgame/
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span
              style={{
                font: '10.5px/1 var(--mono)',
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--gold)',
                border: '1px solid var(--line-strong)',
                borderRadius: '999px',
                padding: '5px 10px',
                background: 'var(--gold-tint)',
              }}
            >
              Mode: Hotseat Lokal
            </span>
            <button
              onClick={() => setShowRules(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-dim)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                font: '12px/1 var(--mono)',
                cursor: 'pointer',
              }}
            >
              <HelpCircle size={14} /> Aturan
            </button>
          </div>
        </header>

        {/* Setup Box */}
        <div
          style={{
            background: 'var(--bg-stage)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            padding: '36px',
            boxShadow: '0 12px 24px -6px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ borderLeft: '3px solid var(--gold)', paddingLeft: '14px', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', letterSpacing: '-0.02em', margin: '0 0 6px', fontWeight: 700 }}>
              WallGo · <span style={{ color: 'var(--gold)' }}>Race to the Golden Core</span>
            </h1>
            <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: '14px', maxWidth: '64ch' }}>
              Balapan menuju petak pusat emas sebelum lawan mengurung atau memutarbalikkan langkahmu dengan dinding 2-petak.
            </p>
          </div>

          {/* Player Count */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '10px' }}>
              Jumlah Pemain (2 s/d 6 Orang)
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[2, 3, 4, 5, 6].map((num) => (
                <button
                  key={`p-count-${num}`}
                  type="button"
                  onClick={() => setPlayerCount(num)}
                  style={{
                    flex: '1',
                    minWidth: '60px',
                    padding: '10px 0',
                    background: playerCount === num ? 'var(--gold)' : 'var(--bg-tile)',
                    border: `1px solid ${playerCount === num ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius: 'var(--r2)',
                    color: playerCount === num ? '#000000' : 'var(--ink)',
                    font: '13px/1 var(--mono)',
                    fontWeight: 700,
                  }}
                >
                  {num}P
                </button>
              ))}
            </div>
          </div>

          {/* Grid Size */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '10px' }}>
              Dimensi Grid Papan
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setGridSizeOption('auto')}
                style={{
                  flex: '2',
                  padding: '10px 14px',
                  background: gridSizeOption === 'auto' ? 'var(--gold-tint)' : 'var(--bg-tile)',
                  border: `1px solid ${gridSizeOption === 'auto' ? 'var(--gold)' : 'var(--line)'}`,
                  color: gridSizeOption === 'auto' ? 'var(--gold)' : 'var(--ink-dim)',
                  borderRadius: 'var(--r2)',
                  font: '12.5px/1 var(--mono)',
                  fontWeight: 600,
                }}
              >
                Rekomendasi Otomatis ({getRecommendedGridSize(playerCount)} × {getRecommendedGridSize(playerCount)})
              </button>
              {[9, 11, 13].map((size) => (
                <button
                  key={`grid-${size}`}
                  type="button"
                  onClick={() => setGridSizeOption(String(size))}
                  style={{
                    flex: '1',
                    padding: '10px',
                    background: gridSizeOption === String(size) ? 'var(--gold-tint)' : 'var(--bg-tile)',
                    border: `1px solid ${gridSizeOption === String(size) ? 'var(--gold)' : 'var(--line)'}`,
                    color: gridSizeOption === String(size) ? 'var(--gold)' : 'var(--ink-dim)',
                    borderRadius: 'var(--r2)',
                    font: '12.5px/1 var(--mono)',
                    fontWeight: 600,
                  }}
                >
                  {size} × {size}
                </button>
              ))}
            </div>
          </div>

          {/* Player Names */}
          <div style={{ marginBottom: '36px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '10px' }}>
              Identitas Pemain
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={`input-p-${idx}`}
                  style={{
                    background: 'var(--bg-tile)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r2)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span
                    style={{
                      font: '11px/1 var(--mono)',
                      color: 'var(--gold)',
                      fontWeight: 700,
                    }}
                  >
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={playerNames[idx]}
                    maxLength={16}
                    onChange={(e) => {
                      const updated = [...playerNames];
                      updated[idx] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      color: 'var(--ink)',
                      font: '13px/1 var(--sans)',
                      outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            type="button"
            onClick={handleStartGame}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'var(--gold)',
              color: '#000000',
              borderRadius: 'var(--r2)',
              border: 'none',
              font: '13px/1 var(--mono)',
              letterSpacing: '.06em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Mulai Permainan · {playerCount} Pemain ({effectiveGridSize} × {effectiveGridSize})
          </button>
        </div>

        {/* Rules Modal */}
        {showRules && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 100,
            }}
          >
            <div
              style={{
                background: 'var(--bg-stage)',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r4)',
                maxWidth: '560px',
                width: '100%',
                padding: '28px',
              }}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gold)', marginBottom: '14px', font: '16px/1.2 var(--mono)' }}>
                ATURAN PERMAINAN
              </h2>
              <ul style={{ paddingLeft: '20px', color: 'var(--ink-dim)', lineHeight: 1.7, fontSize: '13.5px', marginBottom: '24px' }}>
                <li><strong>Tujuan</strong>: Pemain pertama yang mencapai petak pusat <strong>The Golden Core</strong> menang seketika.</li>
                <li><strong>Ekonomi Giliran</strong>: Pilih <em>SATU</em>: Melangkah 1 petak <strong>ATAU</strong> memasang 1 dinding 2-petak.</li>
                <li><strong>Lompat Bidak</strong>: Jika berhadapan langsung dengan lawan, bidak dapat melompat lurus (atau diagonal jika terhalang dinding).</li>
                <li><strong>BFS Anti-Trap Rule</strong>: Dinding dilarang keras menutup total seluruh jalur pemain ke inti.</li>
                <li><strong>Ganti Orientasi</strong>: Tekan tombol <code>[H/V]</code> atau tombol <code>Spasi / R</code> pada keyboard untuk memutar dinding.</li>
              </ul>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg-tile)',
                  border: '1px solid var(--line-strong)',
                  color: 'var(--ink)',
                  borderRadius: 'var(--r2)',
                  font: '12px/1 var(--mono)',
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // IN-GAME VIEW
  const activePlayer = game.players[game.activePlayerIndex];
  const winner = game.winnerId !== null ? game.players[game.winnerId] : null;

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '1040px', margin: '24px auto', padding: '0 20px' }}>
      <div className="paper-bg" />

      {/* Top Telemetry Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={handleExitToSetup}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--ink-dim)',
              font: '12px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} /> Konfigurasi
          </button>
          <span style={{ color: 'var(--line-strong)' }}>|</span>
          <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Grid: {game.gridSize}×{game.gridSize} · Putaran: {game.turn}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Wall Orientation Toggle */}
          <button
            onClick={() => setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tile)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              letterSpacing: '.08em',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Klik atau tekan Spasi / R untuk memutar"
          >
            Orientasi: {wallOrientation === 'H' ? '═ Horizontal' : '║ Vertikal'} [R]
          </button>

          <button
            onClick={handleResetGame}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-tile)',
              border: '1px solid var(--line)',
              color: 'var(--ink-dim)',
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            <RotateCw size={12} /> Reset
          </button>
        </div>
      </header>

      {/* Main Board & HUD Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 1fr) 280px',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left: Turn Banner & Interactive Board */}
        <div>
          {/* Active Turn Banner */}
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--r2)',
              background: 'var(--bg-stage)',
              border: `1px solid ${game.phase === 'GAME_OVER' ? 'var(--gold)' : 'var(--line-strong)'}`,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {game.phase === 'GAME_OVER' && winner ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trophy size={18} color="var(--gold)" />
                <span style={{ font: '13px/1 var(--mono)', fontWeight: 700, color: 'var(--gold)', letterSpacing: '.05em' }}>
                  PEMENANG: {winner.name} ({winner.theme.label})!
                </span>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: activePlayer.theme.hex,
                    }}
                  />
                  <strong style={{ font: '13px/1 var(--mono)', letterSpacing: '.04em' }}>{activePlayer.name}</strong>
                  <span style={{ color: 'var(--ink-faint)', font: '11px/1 var(--mono)' }}>({activePlayer.theme.label})</span>
                </div>
                <div style={{ font: '11.5px/1.4 var(--sans)', color: 'var(--ink-dim)' }}>
                  Pilih: Klik petak bertanda untuk melangkah, atau klik celah untuk pasang dinding 2-petak.
                </div>
              </div>
            )}

            {/* Error badge if move was rejected */}
            {actionError && (
              <span style={{ font: '10.5px/1 var(--mono)', color: '#ef4444', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--r2)' }}>
                {actionError}
              </span>
            )}
          </div>

          {/* SVG Board */}
          <Board
            gameState={game}
            wallOrientation={wallOrientation}
            onSelectMove={handleSelectMove}
            onPlaceWall={handlePlaceWall}
            disabled={game.phase === 'GAME_OVER'}
          />
        </div>

        {/* Right Sidebar: Status & Telemetry */}
        <div
          style={{
            background: 'var(--bg-stage)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r2)',
            padding: '20px',
          }}
        >
          <div style={{ font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
            STATUS BALAPAN
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {game.players.map((p, idx) => {
              const isActive = idx === game.activePlayerIndex && game.phase !== 'GAME_OVER';
              const isWinner = game.winnerId === p.id;

              return (
                <div
                  key={`score-p-${p.id}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--r2)',
                    background: isActive ? 'var(--gold-tint)' : 'var(--bg-tile)',
                    border: `1px solid ${isWinner ? 'var(--gold)' : isActive ? 'var(--line-gold)' : 'var(--line)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: p.theme.hex,
                          color: p.theme.text,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          font: '10px/1 var(--mono)',
                          fontWeight: 700,
                        }}
                      >
                        {p.id + 1}
                      </div>
                      <span style={{ font: '12.5px/1 var(--mono)', fontWeight: isActive ? 700 : 500 }}>
                        {p.name}
                      </span>
                    </div>

                    {isWinner && (
                      <span style={{ font: '10px/1 var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                        JUARA
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', font: '11px/1 var(--mono)', color: 'var(--ink-dim)' }}>
                    <span>Sisa Dinding: <strong style={{ color: p.wallsRemaining > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>{p.wallsRemaining}</strong></span>
                    <span>Jarak: <strong style={{ color: 'var(--ink)' }}>{p.distanceToCore} langkah</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '14px',
              borderTop: '1px solid var(--line)',
              font: '11px/1.6 var(--mono)',
              color: 'var(--ink-faint)',
            }}
          >
            <div>Pusat: The Golden Core</div>
            <div>Dinding terpasang: {game.walls.length}</div>
            <div>Aturan: Move OR Wall</div>
          </div>
        </div>
      </div>
    </div>
  );
};
