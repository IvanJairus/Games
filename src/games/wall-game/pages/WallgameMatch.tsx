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
  HelpCircle,
  Trophy,
  Home,
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
  leaveOnlineMatch,
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
  const [opponentLeftNotice, setOpponentLeftNotice] = useState<string | null>(null);

  const rulesDialogRef = useRef<HTMLDialogElement>(null);
  const channelRef = useRef<any>(null);

  // Join room on mount
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
        if (data.match.status === 'abandoned' && data.match.game_state?.abandonedReason) {
          setOpponentLeftNotice(data.match.game_state.abandonedReason);
        }
      },
      () => {
        // Quick move broadcast
      },
      (leavePayload) => {
        // Opponent leave broadcast
        setOpponentLeftNotice(`${leavePayload?.playerName || 'Lawan'} telah keluar dari pertandingan.`);
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

  const handleExitRoom = async () => {
    if (!syncData) {
      navigate('/wall-game');
      return;
    }

    if (syncData.match.status === 'playing') {
      const confirmLeave = window.confirm(
        'Apakah Anda yakin ingin keluar dari room? Pertandingan akan dihentikan dan kemenangan diberikan kepada lawan.'
      );
      if (!confirmLeave) return;
    }

    try {
      await leaveOnlineMatch({
        matchId: syncData.match.id,
        roomCode,
        playerIndex: syncData.myPlayerIndex,
        playerName,
      });
    } catch {
      // Ignore network errors on exit
    } finally {
      navigate('/wall-game');
    }
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
      setOpponentLeftNotice(null);
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
      setOpponentLeftNotice(null);
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
            Kredensial API Supabase belum terdeteksi. Silakan periksa file .env.local.
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
  const activePlayer = game?.players?.[game.activePlayerIndex];
  const isMyTurn = match.status === 'playing' && game && game.activePlayerIndex === myPlayerIndex;
  const isGameOver = (match.status === 'completed' || game?.phase === 'GAME_OVER') && !isVictoryModalDismissed;
  const winnerPlayer = game && game.winnerId !== null ? game.players[game.winnerId] : null;

  const isAbandoned = match.status === 'abandoned';
  const didIWinByAbandon = isAbandoned && match.winner_index === myPlayerIndex;

  return (
    <div style={{ maxWidth: '640px', margin: '24px auto', padding: '0 16px' }}>
      {/* Editorial Header (Consistent with Local Hotseat) */}
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
          <button
            type="button"
            onClick={handleExitRoom}
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
              cursor: 'pointer',
            }}
            aria-label="Kembali ke Lobby"
          >
            <ArrowLeft size={16} />
          </button>
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
              WallGo · Mode Online
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              Papan Catur Halang Rintang · {game ? `${game.playerCount} Pemain` : `${players.length} Pemain`} · Room: <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{roomCode}</span>
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
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              border: `1px solid ${copied ? 'var(--gold)' : 'var(--gold-border)'}`,
              borderRadius: 'var(--r2)',
              background: copied ? 'var(--gold)' : 'var(--gold-tint)',
              color: copied ? '#ffffff' : 'var(--gold)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {copied ? <Check size={13} /> : <Share2 size={13} />}
            {copied ? 'Tersalin' : 'Bagikan'}
          </button>
        </div>
      </header>

      {/* Opponent Left / Abandoned Alert */}
      {isAbandoned && (
        <div
          style={{
            background: didIWinByAbandon ? 'var(--gold-tint)' : '#fef2f2',
            border: `1.5px solid ${didIWinByAbandon ? 'var(--gold)' : '#fecaca'}`,
            borderRadius: 'var(--r3)',
            padding: '24px 20px',
            textAlign: 'center',
            marginBottom: '24px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: didIWinByAbandon ? '#ffffff' : '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              color: didIWinByAbandon ? 'var(--gold)' : '#991b1b',
            }}
          >
            {didIWinByAbandon ? <Trophy size={24} /> : <AlertCircle size={24} />}
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: 'var(--ink)' }}>
            {didIWinByAbandon ? 'Selamat! Anda Menang (Lawan Menyerah)' : 'Pertandingan Dibatalkan'}
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-dim)', margin: '0 0 20px', lineHeight: 1.5 }}>
            {opponentLeftNotice || 'Pemain lawan telah keluar dari room pertandingan.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/wall-game')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                background: 'var(--ink)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Home size={13} /> Kembali ke Lobby
            </button>
          </div>
        </div>
      )}

      {/* Waiting Lobby State */}
      {match.status === 'waiting' && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            padding: '36px 24px',
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

      {/* Active Game State (Exact Layout Matching Local Hotseat) */}
      {(match.status === 'playing' || match.status === 'completed') && game && activePlayer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          {/* Turn Banner with Active Pawn Indicator & Telemetry */}
          <div
            data-testid="turn-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 'var(--r3)',
              background: '#ffffff',
              border: `1.5px solid ${isMyTurn ? 'var(--gold)' : activePlayer.theme.hex}`,
              boxShadow: isMyTurn ? '0 0 0 3px rgba(180, 83, 9, 0.15)' : '0 2px 8px rgba(28, 25, 23, 0.04)',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                <div style={{ font: '10px/1 var(--mono)', color: isMyTurn ? 'var(--gold)' : 'var(--ink-faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {isMyTurn ? 'GILIRAN ANDA!' : `Giliran Aktif · Putaran #${game.turn}`}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                  {activePlayer.name} {game.activePlayerIndex === myPlayerIndex && '(Anda)'}
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

          {/* Quick Wall Mode Selector & Orientation Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff',
              padding: '8px 14px',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line-strong)',
              fontSize: '12px',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', textTransform: 'uppercase' }}>
                Orientasi Dinding:
              </span>
              <button
                type="button"
                data-testid="orientation-toggle"
                onClick={() => setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))}
                disabled={!isMyTurn || activePlayer.wallsRemaining <= 0 || isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  background: 'var(--bg-stage)',
                  border: '1px solid var(--gold)',
                  borderRadius: 'var(--r2)',
                  color: 'var(--gold)',
                  font: '11px/1 var(--mono)',
                  fontWeight: 700,
                  cursor: isMyTurn && activePlayer.wallsRemaining > 0 ? 'pointer' : 'not-allowed',
                  opacity: isMyTurn && activePlayer.wallsRemaining > 0 ? 1 : 0.5,
                }}
              >
                <RotateCw size={12} /> {wallOrientation === 'H' ? 'Horizontal (―)' : 'Vertikal (|)'}
              </button>
              <span style={{ font: '10px/1 var(--mono)', color: 'var(--ink-faint)' }}>
                (Tekan Spasi/R atau sentuh celah)
              </span>
            </div>

            <button
              type="button"
              onClick={handleExitRoom}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-faint)',
                font: '11px/1 var(--mono)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Keluar Room
            </button>
          </div>

          {/* Action Error Flash */}
          {actionError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--r2)',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '12px',
                fontFamily: 'var(--mono)',
              }}
            >
              {actionError}
            </div>
          )}

          {/* Main Interactive Board */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Board
              gameState={game}
              wallOrientation={wallOrientation}
              onSelectMove={handleSelectMove}
              onPlaceWall={handlePlaceWall}
              onOrientationChange={setWallOrientation}
              disabled={!isMyTurn || isSubmitting}
            />
          </div>

          {/* Player Roster Status Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${game.playerCount}, 1fr)`,
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {game.players.map((p, idx) => {
              const isTurn = idx === game.activePlayerIndex;
              const isMe = idx === myPlayerIndex;
              return (
                <div
                  key={p.id}
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
                    <strong style={{ color: 'var(--ink)', fontSize: '11px' }}>
                      {p.name} {isMe && '(Anda)'}
                    </strong>
                  </div>
                  <div style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                    Sisa: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{p.wallsRemaining} dinding</span>
                  </div>
                </div>
              );
            })}
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
              onNewSetup={handleExitRoom}
              onClose={() => setIsVictoryModalDismissed(true)}
            />
          )}
        </div>
      )}

      {/* Rules Dialog (Identical to Local Hotseat) */}
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
    </div>
  );
};
