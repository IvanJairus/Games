import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Share2,
  Clock,
  HelpCircle,
  Trophy,
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
  const joinAttemptedRef = useRef<boolean>(false);

  // Join room on mount with single execution guard
  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured() || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;

    let isMounted = true;
    joinOnlineRoom({ roomCode, playerName })
      .then(() => {
        if (isMounted) {
          setStoredPlayerName(playerName);
          setJoinError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          // Clean user-friendly message
          setJoinError(err.message || 'Tidak dapat bergabung ke room');
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
        if (data.myPlayerIndex >= 0) {
          setJoinError(null);
        }
        if (data.match.status === 'abandoned' && data.match.game_state?.abandonedReason) {
          setOpponentLeftNotice(data.match.game_state.abandonedReason);
        }
      },
      () => {
        // Move broadcast received
      },
      (leavePayload) => {
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

    const isOpponentGone = Boolean(
      opponentLeftNotice ||
      syncData.match.status === 'abandoned' ||
      syncData.players.length < 2
    );

    if (isOpponentGone) {
      setActionError('Pemain lawan telah meninggalkan room. Tidak dapat mengulang pertandingan.');
      return;
    }

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
      <div style={{ maxWidth: '580px', margin: '40px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 'var(--r3)', padding: '36px 20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 10px' }}>Supabase Belum Dikonfigurasi</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', lineHeight: 1.5, marginBottom: '20px' }}>
            Kredensial API Supabase belum terdeteksi. Silakan periksa file .env.local.
          </p>
          <Link
            to="/wall-game"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
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

  // Only display join error if player is genuinely NOT joined in syncData
  if (joinError && (!syncData || syncData.myPlayerIndex < 0)) {
    return (
      <div style={{ maxWidth: '580px', margin: '40px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 'var(--r3)', padding: '36px 20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>
            Tidak Dapat Bergabung
          </h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', lineHeight: 1.5, marginBottom: '20px' }}>
            {joinError}
          </p>
          <Link
            to="/wall-game"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: 'var(--ink)',
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
      <div style={{ maxWidth: '580px', margin: '60px auto', textAlign: 'center' }}>
        <Clock size={28} color="var(--gold)" style={{ margin: '0 auto 12px' }} />
        <p style={{ font: '13px/1 var(--mono)', color: 'var(--ink-dim)' }}>
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
    <div style={{ maxWidth: '640px', margin: '20px auto', padding: '0 12px' }}>
      {/* Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            <h1 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              WallGo <span style={{ fontWeight: 400, color: 'var(--ink-dim)' }}>· Room {roomCode}</span>
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', marginTop: '2px' }}>
              {match.status === 'waiting'
                ? `Menunggu Pemain (${players.length}/${match.max_players})`
                : `Putaran #${game?.turn || 1} · ${players.length} Pemain`}
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
              gap: '5px',
              padding: '6px 10px',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              background: '#ffffff',
              color: 'var(--ink-dim)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            <HelpCircle size={13} /> Aturan
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
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

      {/* Opponent Left Alert Banner */}
      {isAbandoned && (
        <div
          style={{
            background: didIWinByAbandon ? 'var(--gold-tint)' : '#fafaf9',
            border: `1px solid ${didIWinByAbandon ? 'var(--gold-border)' : 'var(--line)'}`,
            borderRadius: 'var(--r2)',
            padding: '16px',
            textAlign: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
            {didIWinByAbandon ? <Trophy size={18} color="var(--gold)" /> : <AlertCircle size={18} color="var(--ink-dim)" />}
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
              {didIWinByAbandon ? 'Lawan Menyerah — Anda Menang!' : 'Pertandingan Dibatalkan'}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-dim)', margin: '0 0 14px' }}>
            {opponentLeftNotice || 'Pemain lawan telah keluar dari room pertandingan.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/wall-game')}
            style={{
              padding: '8px 16px',
              background: 'var(--ink)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r2)',
              font: '11.5px/1 var(--mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Kembali ke Lobby
          </button>
        </div>
      )}

      {/* Arena Status Bar (While Waiting or Before Start) */}
      {match.status === 'waiting' && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
              {players.length >= match.max_players
                ? `Semua pemain telah bergabung (${players.length}/${match.max_players})`
                : `Menunggu lawan (${players.length}/${match.max_players})`}
            </div>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '3px' }}>
              Pemain: {players.map((p) => `${p.name}${p.player_index === myPlayerIndex ? ' (Anda)' : ''}`).join(', ')}
            </div>
          </div>

          <div>
            {isHost ? (
              <button
                type="button"
                onClick={handleStartGame}
                disabled={players.length < 2 || isSubmitting}
                style={{
                  padding: '8px 16px',
                  background: players.length >= 2 ? 'var(--gold)' : 'var(--line-strong)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--r2)',
                  font: '11.5px/1 var(--mono)',
                  fontWeight: 700,
                  cursor: players.length >= 2 && !isSubmitting ? 'pointer' : 'not-allowed',
                }}
              >
                Mulai Pertandingan
              </button>
            ) : (
              <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)' }}>
                Menunggu Host memulai...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Active Turn Banner (When Playing) */}
      {match.status === 'playing' && game && activePlayer && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            border: `1.5px solid ${isMyTurn ? 'var(--gold)' : activePlayer.theme.hex}`,
            marginBottom: '12px',
            minHeight: '52px',
            boxSizing: 'border-box',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: activePlayer.theme.hex,
                border: `2px solid ${activePlayer.theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activePlayer.theme.text,
                fontWeight: 700,
                fontSize: '12px',
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}
            >
              {activePlayer.id + 1}
            </div>
            <div>
              <div style={{ font: '10px/1 var(--mono)', color: isMyTurn ? 'var(--gold)' : 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {isMyTurn ? 'Giliran Anda!' : `Giliran: ${activePlayer.name}`}
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                {activePlayer.name} {game.activePlayerIndex === myPlayerIndex && '(Anda)'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', font: 'var(--mono)', fontSize: '11px', flexShrink: 0 }}>
            <div>
              <span style={{ color: 'var(--ink-faint)' }}>Jarak: </span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{activePlayer.distanceToCore} langkah</span>
            </div>
            <div>
              <span style={{ color: 'var(--ink-faint)' }}>Dinding: </span>
              <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{activePlayer.wallsRemaining}</span>
            </div>
          </div>
        </div>
      )}

      {/* The Arena Board (Always centered, zero-shift position) */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
        <Board
          gameState={game}
          wallOrientation={wallOrientation}
          onSelectMove={handleSelectMove}
          onPlaceWall={handlePlaceWall}
          onOrientationChange={setWallOrientation}
          disabled={!isMyTurn || isSubmitting || match.status !== 'playing'}
          statusNotice={!isMyTurn ? `Menunggu giliran ${activePlayer?.name || 'lawan'}...` : undefined}
        />
      </div>

      {actionError && (
        <div
          style={{
            padding: '7px 12px',
            borderRadius: 'var(--r2)',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '11.5px',
            marginBottom: '10px',
            fontFamily: 'var(--mono)',
            textAlign: 'center',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Roster Cards */}
      {game && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${game.playerCount}, 1fr)`,
            gap: '6px',
          }}
        >
          {game.players.map((p, idx) => {
            const isTurn = idx === game.activePlayerIndex && match.status === 'playing';
            const isMe = idx === myPlayerIndex;
            return (
              <div
                key={p.id}
                style={{
                  padding: '7px 8px',
                  borderRadius: 'var(--r2)',
                  background: '#ffffff',
                  border: isTurn ? `1.5px solid ${p.theme.hex}` : '1px solid var(--line)',
                  font: 'var(--mono)',
                  fontSize: '10.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: p.theme.hex,
                    }}
                  />
                  <strong style={{ color: 'var(--ink)' }}>
                    {p.name} {isMe && '(Anda)'}
                  </strong>
                </div>
                <div style={{ color: 'var(--ink-faint)' }}>
                  Sisa: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{p.wallsRemaining}</span> dinding
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          borderRadius: 'var(--r3)',
          padding: '24px',
          background: '#ffffff',
          boxShadow: '0 12px 32px rgba(28, 25, 23, 0.12)',
          maxWidth: '500px',
          width: 'calc(100% - 32px)',
          color: 'var(--ink)',
        }}
      >
        <h2 id="rules-title" style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>
          Aturan WallGo (Quoridor Core)
        </h2>
        <ul style={{ fontSize: '13px', lineHeight: 1.6, paddingLeft: '18px', color: 'var(--ink-dim)', margin: '0 0 18px' }}>
          <li>
            <strong>Tujuan:</strong> Bidak pertama yang mencapai <em>The Golden Core</em> (petak tengah berlingkaran emas) memenangkan pertandingan.
          </li>
          <li>
            <strong>Tindakan Giliran:</strong> Setiap giliran, pemain memilih <em>melangkah 1 petak</em> (ke atas, bawah, kiri, kanan) ATAU <em>memasang 1 balok dinding</em>.
          </li>
          <li>
            <strong>Melompati Lawan:</strong> Jika berhadapan langsung dengan bidak lawan tanpa terhalang dinding, Anda dapat melompati bidak tersebut.
          </li>
          <li>
            <strong>Fair Rule:</strong> Pemasangan dinding yang mengunci total akses ke Core dilarang (divalidasi oleh BFS pathfinder).
          </li>
        </ul>
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.close()}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r2)',
              border: '1px solid var(--line-strong)',
              background: 'var(--bg-stage)',
              color: 'var(--ink)',
              font: '11.5px/1 var(--mono)',
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
