import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GameState,
  Position,
  Wall,
  createGame,
  applyMove,
  passMove,
  applyWall,
  getValidMoves,
  getRecommendedGridSize,
} from '../../../supabase/functions/_shared/wallgame/engine';
import { Board } from './components/Board';
import { Trophy, RefreshCw, ArrowLeft, HelpCircle } from 'lucide-react';

export const WallgameLocal: React.FC = () => {
  // Setup state
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [gridSizeOption, setGridSizeOption] = useState<string>('auto');
  const [playerNames, setPlayerNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
  ]);
  const [showRules, setShowRules] = useState<boolean>(false);

  // In-game state
  const [game, setGame] = useState<GameState | null>(null);

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
  };

  const handleResetGame = () => {
    if (window.confirm('Mulai ulang permainan baru? Permainan saat ini akan direset.')) {
      handleStartGame();
    }
  };

  const handleExitToSetup = () => {
    if (window.confirm('Keluar ke menu setup?')) {
      setGame(null);
    }
  };

  const handleSelectMove = (target: Position) => {
    if (!game || game.phase !== 'MOVE') return;
    try {
      const nextState = applyMove(game, target);
      setGame(nextState);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handlePassMove = () => {
    if (!game || game.phase !== 'MOVE') return;
    try {
      const nextState = passMove(game);
      setGame(nextState);
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handlePlaceWall = (wall: Wall) => {
    if (!game || game.phase !== 'WALL') return;
    try {
      const nextState = applyWall(game, wall);
      setGame(nextState);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  // SETUP SCREEN
  if (!game) {
    return (
      <div style={{ maxWidth: '680px', margin: '40px auto', padding: '0 20px' }}>
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link
            to="/wallgame"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
            }}
          >
            <ArrowLeft size={16} /> Kembali ke Lobby
          </Link>
          <button
            onClick={() => setShowRules(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.9rem',
            }}
          >
            <HelpCircle size={16} /> Cara Bermain
          </button>
        </div>

        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
          }}
        >
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>
            WallGo <span style={{ color: 'var(--accent-cyan)' }}>Hotseat Lokal</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '28px', fontSize: '0.95rem' }}>
            Mainkan bersama 2 hingga 6 teman pada satu layar gawai secara bergantian.
          </p>

          {/* Number of Players */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px' }}>
              Jumlah Pemain (2 - 6)
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[2, 3, 4, 5, 6].map((num) => (
                <button
                  key={`p-count-${num}`}
                  type="button"
                  onClick={() => setPlayerCount(num)}
                  style={{
                    flex: '1',
                    minWidth: '50px',
                    padding: '12px 0',
                    background: playerCount === num ? 'var(--accent-blue)' : 'var(--bg-card)',
                    border: `1px solid ${playerCount === num ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                  }}
                >
                  {num}P
                </button>
              ))}
            </div>
          </div>

          {/* Grid Size Selection */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px' }}>
              Ukuran Papan Permainan
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setGridSizeOption('auto')}
                style={{
                  flex: '2',
                  padding: '10px 14px',
                  background: gridSizeOption === 'auto' ? 'var(--accent-cyan)' : 'var(--bg-card)',
                  border: `1px solid ${gridSizeOption === 'auto' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                  color: gridSizeOption === 'auto' ? '#000000' : 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                }}
              >
                Otomatis ({getRecommendedGridSize(playerCount)}x{getRecommendedGridSize(playerCount)})
              </button>
              {[7, 9, 11, 13].map((size) => (
                <button
                  key={`grid-${size}`}
                  type="button"
                  onClick={() => setGridSizeOption(String(size))}
                  style={{
                    flex: '1',
                    padding: '10px',
                    background: gridSizeOption === String(size) ? 'var(--accent-cyan)' : 'var(--bg-card)',
                    border: `1px solid ${gridSizeOption === String(size) ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                    color: gridSizeOption === String(size) ? '#000000' : 'var(--text-primary)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                  }}
                >
                  {size}x{size}
                </button>
              ))}
            </div>
          </div>

          {/* Player Names Input */}
          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px' }}>
              Nama Pemain
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div key={`input-p-${idx}`}>
                  <input
                    type="text"
                    value={playerNames[idx]}
                    maxLength={16}
                    onChange={(e) => {
                      const updated = [...playerNames];
                      updated[idx] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    placeholder={`Player ${idx + 1}`}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleStartGame}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'var(--accent-blue)',
              color: '#ffffff',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              fontWeight: 700,
              fontSize: '1.1rem',
              boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.4)',
            }}
          >
            Mulai Permainan ({playerCount} Pemain - {effectiveGridSize}x{effectiveGridSize})
          </button>
        </div>

        {/* Rules Modal */}
        {showRules && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 100,
            }}
          >
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '540px',
                width: '100%',
                padding: '24px',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '14px', color: 'var(--accent-cyan)' }}>
                Aturan Permainan WallGo
              </h2>
              <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '20px' }}>
                <li>Setiap giliran terdiri dari 2 fase: <strong>Gerakkan Bidak</strong> lalu <strong>Pasang 1 Dinding</strong>.</li>
                <li>Bidak bergerak 1 langkah ortogonal (atas, bawah, kiri, kanan) dan tidak boleh menembus dinding atau petak lawan.</li>
                <li>Dinding dipasang pada garis pemisah petak untuk menyekat ruang dan membatasi lawan.</li>
                <li>Permainan selesai saat <strong>semua pemain terisolasi</strong> ke dalam wilayah tertutup masing-masing.</li>
                <li>Skor dihitung dari jumlah petak di wilayah terisolasi pemain. Pemilik wilayah terluas adalah pemenangnya!</li>
              </ul>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
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

  // IN-GAME SCREEN
  const activePlayer = game.players[game.activePlayerIndex];
  const validMoves = getValidMoves(game);
  const canPassMove = game.phase === 'MOVE' && validMoves.length === 0;

  return (
    <div style={{ maxWidth: '1000px', margin: '20px auto', padding: '0 16px' }}>
      {/* Top Navbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <button
          onClick={handleExitToSetup}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Setup
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleResetGame}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
            }}
          >
            <RefreshCw size={14} /> Restart
          </button>
        </div>
      </div>

      {/* Main Game Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) 260px',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left: Interactive Board & Turn Banner */}
        <div>
          {/* Turn Banner */}
          <div
            style={{
              padding: '14px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: `1px solid ${game.phase === 'GAME_OVER' ? 'var(--accent-emerald)' : activePlayer.color}`,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              {game.phase === 'GAME_OVER' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trophy size={20} color="var(--accent-amber)" />
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-emerald)' }}>
                    Permainan Selesai!
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: activePlayer.color,
                      }}
                    />
                    <strong style={{ fontSize: '1.05rem' }}>{activePlayer.name}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>(P{activePlayer.id + 1})</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {game.phase === 'MOVE' ? (
                      <span>Langkah 1/2: Klik petak terdekat untuk memindahkan bidak.</span>
                    ) : (
                      <span>Langkah 2/2: Klik celah antar-petak untuk memasang dinding.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Pass Move Button if Trapped */}
            {canPassMove && (
              <button
                onClick={handlePassMove}
                style={{
                  padding: '8px 14px',
                  background: 'var(--accent-amber)',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                Lewati Gerak (Terjebak)
              </button>
            )}
          </div>

          {/* SVG Board */}
          <Board
            gameState={game}
            onSelectMove={handleSelectMove}
            onPlaceWall={handlePlaceWall}
            disabled={game.phase === 'GAME_OVER'}
          />
        </div>

        {/* Right Sidebar: Scoreboard & Player List */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', color: 'var(--text-secondary)' }}>
            PAPAN SKOR (WILAYAH)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {game.players.map((p, idx) => {
              const isActive = idx === game.activePlayerIndex && game.phase !== 'GAME_OVER';
              const isWinner = Array.isArray(game.winnerIds) && game.winnerIds.includes(p.id);

              return (
                <div
                  key={`score-p-${p.id}`}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    border: `1px solid ${isActive ? p.color : 'transparent'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: p.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        color: '#ffffff',
                      }}
                    >
                      {p.id + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                      {p.isTrapped && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-amber)' }}>Terjebak</div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{p.score}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>petak</span>
                    {isWinner && (
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                          JUARA!
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>Grid: {game.gridSize} x {game.gridSize}</div>
            <div>Total Dinding Terpasang: {game.walls.length}</div>
            <div>Putaran: {game.turn}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
