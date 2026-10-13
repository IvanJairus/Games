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
  isValidWallPlacement,
  getRecommendedGridSize,
} from '../../../supabase/functions/_shared/wallgame/engine';
import { Board } from './components/Board';
import { RotateCw, ArrowLeft, HelpCircle, Check, X } from 'lucide-react';

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

  const [game, setGame] = useState<GameState | null>(null);
  const [wallOrientation, setWallOrientation] = useState<WallOrientation>('H');
  const [selectedWallCandidate, setSelectedWallCandidate] = useState<Wall | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rulesDialogRef = useRef<HTMLDialogElement>(null);

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
      setSelectedWallCandidate(null);
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
      setSelectedWallCandidate(null);
      const nextState = applyWall(game, wall);
      setGame(nextState);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const isSelectedWallValid = selectedWallCandidate && game
    ? isValidWallPlacement(game, selectedWallCandidate)
    : false;

  const handleToggleCandidateOrientation = () => {
    if (!selectedWallCandidate) return;
    const nextOri: WallOrientation = selectedWallCandidate.orientation === 'H' ? 'V' : 'H';
    setSelectedWallCandidate({ ...selectedWallCandidate, orientation: nextOri });
    setWallOrientation(nextOri);
  };

  const handleConfirmCandidateWall = () => {
    if (!selectedWallCandidate) return;
    handlePlaceWall(selectedWallCandidate);
  };

  const handleCancelCandidate = () => {
    setSelectedWallCandidate(null);
  };

  // Keyboard shortcut: Space or R toggles wall orientation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'r' || e.key === 'R') {
        if (game && game.phase === 'ACTION') {
          e.preventDefault();
          setWallOrientation((prev) => {
            const nextOri = prev === 'H' ? 'V' : 'H';
            if (selectedWallCandidate) {
              setSelectedWallCandidate((cur) => (cur ? { ...cur, orientation: nextOri } : null));
            }
            return nextOri;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game, selectedWallCandidate]);

  // SETUP VIEW
  if (!game) {
    return (
      <div style={{ maxWidth: '840px', margin: '40px auto', padding: '0 24px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', borderBottom: '1px solid var(--line)', paddingBottom: '14px' }}>
          <Link
            to="/wallgame"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              font: '12px/1 var(--mono)',
              color: 'var(--ink-dim)',
              letterSpacing: '.04em',
              textDecoration: 'none',
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
                border: '1px solid var(--gold-border)',
                borderRadius: 'var(--r2)',
                padding: '4px 8px',
                background: 'var(--gold-tint)',
              }}
            >
              Mode: Hotseat Lokal
            </span>
            <button
              onClick={() => rulesDialogRef.current?.showModal()}
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

        <main
          style={{
            background: '#ffffff',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            padding: '36px',
            boxShadow: '0 4px 16px rgba(28, 25, 23, 0.05)',
          }}
        >
          <div style={{ borderLeft: '3px solid var(--gold)', paddingLeft: '14px', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '22px', letterSpacing: '-0.02em', margin: '0 0 6px', fontWeight: 700 }}>
              WallGo · <span style={{ color: 'var(--gold)' }}>Race to the Golden Core</span>
            </h1>
            <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: '13.5px', maxWidth: '64ch' }}>
              Strategi bergiliran untuk 2 hingga 6 pemain. Capai petak pusat emas sebelum lawan menghalangi jalanmu.
            </p>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '8px' }}>
              Jumlah Pemain (2 s/d 6 Orang)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[2, 3, 4, 5, 6].map((num) => (
                <button
                  key={`p-count-${num}`}
                  type="button"
                  onClick={() => setPlayerCount(num)}
                  style={{
                    flex: '1',
                    minWidth: '54px',
                    padding: '8px 0',
                    background: playerCount === num ? 'var(--gold)' : 'var(--bg-stage)',
                    border: `1px solid ${playerCount === num ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius: 'var(--r2)',
                    color: playerCount === num ? '#ffffff' : 'var(--ink)',
                    font: '13px/1 var(--mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {num}P
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '8px' }}>
              Dimensi Papan
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setGridSizeOption('auto')}
                style={{
                  flex: '2',
                  padding: '9px 12px',
                  background: gridSizeOption === 'auto' ? 'var(--gold-tint)' : 'var(--bg-stage)',
                  border: `1px solid ${gridSizeOption === 'auto' ? 'var(--gold)' : 'var(--line)'}`,
                  color: gridSizeOption === 'auto' ? 'var(--gold)' : 'var(--ink-dim)',
                  borderRadius: 'var(--r2)',
                  font: '12px/1 var(--mono)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Otomatis ({getRecommendedGridSize(playerCount)} × {getRecommendedGridSize(playerCount)})
              </button>
              {[9, 11, 13].map((size) => (
                <button
                  key={`grid-${size}`}
                  type="button"
                  onClick={() => setGridSizeOption(String(size))}
                  style={{
                    flex: '1',
                    padding: '9px',
                    background: gridSizeOption === String(size) ? 'var(--gold-tint)' : 'var(--bg-stage)',
                    border: `1px solid ${gridSizeOption === String(size) ? 'var(--gold)' : 'var(--line)'}`,
                    color: gridSizeOption === String(size) ? 'var(--gold)' : 'var(--ink-dim)',
                    borderRadius: 'var(--r2)',
                    font: '12px/1 var(--mono)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {size} × {size}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '36px' }}>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '8px' }}>
              Nama Pemain
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={`input-p-${idx}`}
                  style={{
                    background: 'var(--bg-stage)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r2)',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ font: '11px/1 var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
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

          <button
            type="button"
            onClick={handleStartGame}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--gold)',
              color: '#ffffff',
              borderRadius: 'var(--r2)',
              border: 'none',
              font: '12px/1 var(--mono)',
              letterSpacing: '.06em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Mulai Permainan ({playerCount} Pemain · {effectiveGridSize}×{effectiveGridSize})
          </button>
        </main>

        {/* Native Accessible Dialog (Modern Web Guidance) */}
        <dialog ref={rulesDialogRef} aria-labelledby="dialog-title" style={{ maxWidth: '520px', width: '100%' }}>
          <h2 id="dialog-title" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gold)', margin: '0 0 12px', font: '15px/1.2 var(--mono)' }}>
            ATURAN PERMAINAN
          </h2>
          <ul style={{ paddingLeft: '18px', color: 'var(--ink-dim)', lineHeight: 1.7, fontSize: '13px', margin: '0 0 20px' }}>
            <li><strong>Tujuan</strong>: Pemain pertama yang mencapai petak pusat <strong>The Golden Core</strong> menang seketika.</li>
            <li><strong>Ekonomi Giliran</strong>: Pilih <em>SATU</em>: Melangkah 1 petak <strong>ATAU</strong> memasang 1 dinding 2-petak.</li>
            <li><strong>Lompat Bidak</strong>: Jika berhadapan langsung dengan lawan, bidak dapat melompat lurus (atau diagonal jika terhalang dinding).</li>
            <li><strong>BFS Anti-Trap Rule</strong>: Dinding dilarang keras memutus total seluruh jalur pemain ke inti.</li>
            <li><strong>Ganti Orientasi Dinding</strong>: Tekan tombol <code>[H/V]</code> atau tekan tombol <code>Spasi / R</code> di keyboard.</li>
          </ul>
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.close()}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line-strong)',
              color: 'var(--ink)',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </dialog>
      </div>
    );
  }

  // IN-GAME VIEW
  const activePlayer = game.players[game.activePlayerIndex];
  const winner = game.winnerId !== null ? game.players[game.winnerId] : null;

  return (
    <div style={{ maxWidth: '1040px', margin: '24px auto', padding: '0 20px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          <span style={{ color: 'var(--line)' }}>|</span>
          <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Grid: {game.gridSize}×{game.gridSize} · Putaran: {game.turn}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => {
              const nextOri = wallOrientation === 'H' ? 'V' : 'H';
              setWallOrientation(nextOri);
              if (selectedWallCandidate) {
                setSelectedWallCandidate({ ...selectedWallCandidate, orientation: nextOri });
              }
            }}
            style={{
              padding: '6px 10px',
              background: 'var(--bg-stage)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              letterSpacing: '.06em',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Otomatis mengikuti arah hover kursor (atau klik/tekan R untuk putar)"
          >
            Orientasi: {wallOrientation === 'H' ? '═ Horizontal' : '║ Vertikal'} [R]
          </button>

          <button
            onClick={handleResetGame}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              background: 'var(--bg-stage)',
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

      <div className="game-layout">
        <div>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r2)',
              background: '#ffffff',
              border: `1px solid ${game.phase === 'GAME_OVER' ? 'var(--gold)' : 'var(--line-strong)'}`,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {game.phase === 'GAME_OVER' && winner ? (
              <span style={{ font: '13px/1 var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                PEMENANG: {winner.name} ({winner.theme.label})!
              </span>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: activePlayer.theme.hex,
                    }}
                  />
                  <strong style={{ font: '12.5px/1 var(--mono)' }}>{activePlayer.name}</strong>
                  <span style={{ color: 'var(--ink-faint)', font: '11px/1 var(--mono)' }}>({activePlayer.theme.label})</span>
                </div>
                <div style={{ font: '11.5px/1.3 var(--sans)', color: 'var(--ink-dim)' }}>
                  Pilih: Melangkah ke petak bertanda atau pasang dinding di celah antar-petak.
                </div>
              </div>
            )}

            {actionError && (
              <span style={{ font: '10.5px/1 var(--mono)', color: '#b42318', padding: '3px 6px', background: 'rgba(180,35,24,0.06)', border: '1px solid #b42318', borderRadius: 'var(--r2)' }}>
                {actionError}
              </span>
            )}
          </div>

          <Board
            gameState={game}
            wallOrientation={wallOrientation}
            onOrientationChange={setWallOrientation}
            selectedWallCandidate={selectedWallCandidate}
            onSelectWallCandidate={setSelectedWallCandidate}
            onSelectMove={handleSelectMove}
            onPlaceWall={handlePlaceWall}
            disabled={game.phase === 'GAME_OVER'}
          />

          {/* Mobile & Touch Wall Placement Confirmation Drawer */}
          {selectedWallCandidate && game.phase === 'ACTION' && activePlayer.wallsRemaining > 0 && (
            <div className="mobile-wall-drawer">
              <div className="mobile-wall-info">
                <span className="mobile-wall-tag">
                  {selectedWallCandidate.orientation === 'H' ? '═ HORIZONTAL' : '║ VERTIKAL'}
                </span>
                <span>Posisi Celah: Kolom {selectedWallCandidate.x + 1}, Baris {selectedWallCandidate.y + 1}</span>
                {!isSelectedWallValid && (
                  <span className="mobile-wall-invalid">⚠ Tidak valid (menabrak atau memutus jalan)</span>
                )}
              </div>
              <div className="mobile-wall-buttons">
                <button
                  type="button"
                  onClick={handleToggleCandidateOrientation}
                  className="mobile-btn-rotate"
                >
                  <RotateCw size={13} /> Putar Orientasi
                </button>
                <button
                  type="button"
                  disabled={!isSelectedWallValid}
                  onClick={handleConfirmCandidateWall}
                  className="mobile-btn-confirm"
                >
                  <Check size={14} /> Pasang Dinding
                </button>
                <button
                  type="button"
                  onClick={handleCancelCandidate}
                  className="mobile-btn-cancel"
                >
                  <X size={13} /> Batal
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r2)',
            padding: '16px',
            boxShadow: '0 2px 8px rgba(28, 25, 23, 0.04)',
          }}
        >
          <div style={{ font: '11px/1 var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '12px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
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
                    padding: '8px 10px',
                    borderRadius: 'var(--r2)',
                    background: isActive ? 'var(--gold-tint)' : 'var(--bg-stage)',
                    border: `1px solid ${isWinner ? 'var(--gold)' : isActive ? 'var(--gold-border)' : 'var(--line)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: p.theme.hex,
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          font: '9px/1 var(--mono)',
                          fontWeight: 700,
                        }}
                      >
                        {p.id + 1}
                      </div>
                      <span style={{ font: '12px/1 var(--mono)', fontWeight: isActive ? 700 : 500 }}>
                        {p.name}
                      </span>
                    </div>

                    {isWinner && (
                      <span style={{ font: '9.5px/1 var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                        JUARA
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', font: '10.5px/1 var(--mono)', color: 'var(--ink-dim)' }}>
                    <span>Sisa Dinding: <strong style={{ color: p.wallsRemaining > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>{p.wallsRemaining}</strong></span>
                    <span>Jarak: <strong style={{ color: 'var(--ink)' }}>{p.distanceToCore} langkah</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '10px',
              borderTop: '1px solid var(--line)',
              font: '10.5px/1.6 var(--mono)',
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
