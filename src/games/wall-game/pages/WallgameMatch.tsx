import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Play,
  RotateCw,
  Crown,
  Share2,
  Clock,
  AlertCircle,
} from 'lucide-react';
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
import { VictoryModal } from '../components/VictoryModal';
import {
  subscribeToMatch,
  submitOnlineMove,
  startOnlineMatch,
  joinOnlineRoom,
  MatchSyncData,
} from '../../common/multiplayer';
import {
  isSupabaseConfigured,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../../lib/supabase';

export const WallgameMatch: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const roomCode = (code || '').toUpperCase();

  const [playerName] = useState(() => getStoredPlayerName() || 'Pemain ' + Math.floor(Math.random() * 900 + 100));
  const [joinError, setJoinError] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<MatchSyncData | null>(null);
  const [wallOrientation, setWallOrientation] = useState<WallOrientation>('H');
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVictoryModalDismissed, setIsVictoryModalDismissed] = useState(false);

  const channelRef = useRef<any>(null);

  // Attempt to join room on mount
  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) return;

    let isMounted = true;
    joinOnlineRoom({ roomCode, playerName })
      .then(() => {
        if (isMounted) {
          setStoredPlayerName(playerName);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setJoinError(err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomCode, playerName]);

  // Subscribe to room updates
  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) return;

    const sub = subscribeToMatch(
      roomCode,
      (data) => {
        setSyncData(data);
      },
      () => {
        // Quick broadcast sync
      }
    );
    channelRef.current = sub.channel;

    return () => {
      sub.unsubscribe();
    };
  }, [roomCode]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    if (!syncData || !syncData.isHost) return;
    setIsSubmitting(true);
    try {
      const pCount = syncData.players.length;
      const initialGame = createGame({
        playerCount: pCount,
        gridSize: getRecommendedGridSize(pCount),
        playerNames: syncData.players.map((p) => p.name),
      });

      await startOnlineMatch(syncData.match.id, initialGame);
      setIsVictoryModalDismissed(false);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectMove = async (target: Position) => {
    if (!syncData || isSubmitting) return;
    const game = syncData.match.game_state as GameState;
    if (game.phase !== 'ACTION') return;
    if (syncData.myPlayerIndex !== game.activePlayerIndex) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      const nextState = applyMove(game, target);
      const isGameOver = nextState.phase === 'GAME_OVER';

      await submitOnlineMove({
        matchId: syncData.match.id,
        playerIndex: syncData.myPlayerIndex,
        action: 'MOVE',
        nextState,
        nextTurn: nextState.activePlayerIndex,
        winnerIndex: isGameOver ? nextState.winnerId : null,
        newStatus: isGameOver ? 'completed' : 'playing',
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_move',
        payload: { action: 'MOVE', target },
      });
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlaceWall = async (wall: Wall) => {
    if (!syncData || isSubmitting) return;
    const game = syncData.match.game_state as GameState;
    if (game.phase !== 'ACTION') return;
    if (syncData.myPlayerIndex !== game.activePlayerIndex) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      const nextState = applyWall(game, wall);

      await submitOnlineMove({
        matchId: syncData.match.id,
        playerIndex: syncData.myPlayerIndex,
        action: 'WALL',
        nextState,
        nextTurn: nextState.activePlayerIndex,
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_move',
        payload: { action: 'WALL', wall },
      });
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartMatch = async () => {
    if (!syncData) return;
    setIsSubmitting(true);
    try {
      const pCount = syncData.players.length;
      const initialGame = createGame({
        playerCount: pCount,
        gridSize: getRecommendedGridSize(pCount),
        playerNames: syncData.players.map((p) => p.name),
      });

      await startOnlineMatch(syncData.match.id, initialGame);
      setIsVictoryModalDismissed(false);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line-strong)', borderRadius: 'var(--r4)', padding: '40px 24px' }}>
          <AlertCircle size={40} color="var(--gold)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>Supabase Belum Dikonfigurasi</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Kredensial API Supabase belum terdeteksi. Silakan periksa file konfigurasi environment (.env.local).
          </p>
          <Link
            to="/wall-game"
            style={{
              padding: '10px 20px',
              background: 'var(--gold)',
              color: '#ffffff',
              borderRadius: 'var(--r2)',
              textDecoration: 'none',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
            }}
          >
            Kembali ke Lobby
          </Link>
        </div>
      </div>
    );
  }

  if (joinError) {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line-strong)', borderRadius: 'var(--r4)', padding: '40px 24px' }}>
          <AlertCircle size={40} color="var(--terracotta)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>Tidak Dapat Bergabung</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            {joinError}
          </p>
          <Link
            to="/wall-game"
            style={{
              padding: '10px 20px',
              background: 'var(--gold)',
              color: '#ffffff',
              borderRadius: 'var(--r2)',
              textDecoration: 'none',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
            }}
          >
            Kembali ke Lobby
          </Link>
        </div>
      </div>
    );
  }

  if (!syncData) {
    return (
      <div style={{ maxWidth: '640px', margin: '60px auto', textAlign: 'center' }}>
        <Clock size={32} color="var(--gold)" style={{ margin: '0 auto 16px' }} />
        <p style={{ font: '13px/1 var(--mono)', color: 'var(--ink-dim)', letterSpacing: '.05em' }}>
          Menghubungkan ke room {roomCode}...
        </p>
      </div>
    );
  }

  const { match, players, myPlayerIndex, isHost } = syncData;
  const game = match.game_state as GameState;
  const isMyTurn = match.status === 'playing' && game && game.activePlayerIndex === myPlayerIndex;
  const isGameOver = (match.status === 'completed' || game?.phase === 'GAME_OVER') && !isVictoryModalDismissed;
  const winnerPlayer = game && game.winnerId !== null ? game.players[game.winnerId] : null;

  return (
    <div style={{ maxWidth: '840px', margin: '32px auto', padding: '0 20px' }}>
      {/* Editorial Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              WallGo <span style={{ color: 'var(--gold)', fontWeight: 400 }}>· Match Online</span>
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '4px' }}>
              Room: <span style={{ fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink)' }}>{roomCode}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={13} color="var(--gold)" /> : <Share2 size={13} />}
            {copied ? 'Tersalin!' : 'Bagikan Link'}
          </button>
        </div>
      </header>

      {/* Waiting Lobby State */}
      {match.status === 'waiting' && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            padding: '36px 28px',
            boxShadow: '0 4px 16px rgba(28, 25, 23, 0.05)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'var(--gold-tint)',
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--r2)',
              marginBottom: '20px',
            }}
          >
            <span style={{ font: '11px/1 var(--mono)', letterSpacing: '.1em', color: 'var(--gold)', textTransform: 'uppercase' }}>
              Kode Room:
            </span>
            <span style={{ font: '18px/1 var(--mono)', fontWeight: 800, letterSpacing: '.12em', color: 'var(--ink)' }}>
              {roomCode}
            </span>
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>
            Menunggu Pemain Bergabung ({players.length} / {match.max_players})
          </h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', marginBottom: '28px' }}>
            Bagikan kode room di atas kepada teman Anda. Minimal 2 pemain untuk memulai permainan.
          </p>

          {/* Player Roster */}
          <div style={{ maxWidth: '420px', margin: '0 auto 32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: p.player_index === myPlayerIndex ? 'var(--gold-tint)' : 'var(--bg-stage)',
                  border: `1px solid ${p.player_index === myPlayerIndex ? 'var(--gold-border)' : 'var(--line)'}`,
                  borderRadius: 'var(--r2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: idx === 0 ? 'var(--gold)' : '#292524',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>
                    {p.name} {p.player_index === myPlayerIndex && '(Anda)'}
                  </span>
                </div>
                {p.is_host && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      font: '10px/1 var(--mono)',
                      color: 'var(--gold)',
                      background: '#ffffff',
                      border: '1px solid var(--gold-border)',
                      borderRadius: 'var(--r2)',
                      padding: '3px 6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    <Crown size={11} /> Host
                  </span>
                )}
              </div>
            ))}

            {Array.from({ length: Math.max(0, match.max_players - players.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  border: '1px dashed var(--line-strong)',
                  borderRadius: 'var(--r2)',
                  font: '12px/1 var(--mono)',
                  color: 'var(--ink-faint)',
                }}
              >
                Slot Pemain {players.length + i + 1} Kosong...
              </div>
            ))}
          </div>

          {/* Host Controls */}
          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={players.length < 2 || isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 28px',
                background: players.length >= 2 ? 'var(--gold)' : 'var(--line-strong)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r2)',
                font: '13px/1 var(--mono)',
                fontWeight: 700,
                letterSpacing: '.05em',
                cursor: players.length >= 2 && !isSubmitting ? 'pointer' : 'not-allowed',
                textTransform: 'uppercase',
              }}
            >
              <Play size={15} /> Mulai Pertandingan
            </button>
          ) : (
            <div style={{ font: '12px/1 var(--mono)', color: 'var(--ink-dim)', letterSpacing: '.04em' }}>
              Menunggu Host ({players[0]?.name || 'Pemain 1'}) menekan tombol Mulai...
            </div>
          )}
        </div>
      )}

      {/* Active Game State */}
      {(match.status === 'playing' || match.status === 'completed') && game && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          {/* Turn Banner */}
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              background: isMyTurn ? 'var(--gold-tint)' : '#ffffff',
              border: `1px solid ${isMyTurn ? 'var(--gold)' : 'var(--line)'}`,
              borderRadius: 'var(--r3)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isMyTurn ? 'var(--gold)' : 'var(--ink-faint)',
                  boxShadow: isMyTurn ? '0 0 0 3px rgba(180, 83, 9, 0.2)' : 'none',
                }}
              />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                  {isMyTurn ? 'Giliran Anda!' : `Menunggu ${players[game.activePlayerIndex]?.name || 'Lawan'}...`}
                </div>
                <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '3px' }}>
                  Pemain Aktif: {players[game.activePlayerIndex]?.name || `Pemain ${game.activePlayerIndex + 1}`} · Bidak #{game.activePlayerIndex + 1}
                </div>
              </div>
            </div>

            {/* Wall Controls for Active Player */}
            {isMyTurn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: '#ffffff',
                    border: '1px solid var(--gold-border)',
                    borderRadius: 'var(--r2)',
                    font: '11px/1 var(--mono)',
                    color: 'var(--gold)',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  <RotateCw size={13} /> Dinding {wallOrientation === 'H' ? 'Horizontal (H)' : 'Vertikal (V)'}
                </button>
              </div>
            )}
          </div>

          {actionError && (
            <div
              style={{
                width: '100%',
                maxWidth: '680px',
                padding: '10px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 'var(--r2)',
                color: '#991b1b',
                fontSize: '13px',
              }}
            >
              {actionError}
            </div>
          )}

          {/* Interactive SVG Board */}
          <div style={{ overflowX: 'auto', maxWidth: '100%', padding: '8px 0' }}>
            <Board
              gameState={game}
              wallOrientation={wallOrientation}
              onSelectMove={handleSelectMove}
              onPlaceWall={handlePlaceWall}
              onOrientationChange={setWallOrientation}
              disabled={!isMyTurn || isSubmitting}
            />
          </div>

          {/* Victory Modal */}
          {winnerPlayer && (
            <VictoryModal
              isOpen={isGameOver}
              winner={winnerPlayer}
              turn={game.turn}
              gridSize={game.gridSize}
              onRestart={() => {
                if (isHost) {
                  handleRestartMatch();
                }
              }}
              onNewSetup={() => navigate('/wall-game')}
              onClose={() => setIsVictoryModalDismissed(true)}
            />
          )}
        </div>
      )}
    </div>
  );
};
