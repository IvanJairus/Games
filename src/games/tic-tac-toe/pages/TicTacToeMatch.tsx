import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Share2,
  Check,
  Trophy,
  Clock,
  AlertCircle,
  Home,
  RotateCw,
} from 'lucide-react';
import {
  applyMove,
  resetRound,
  getPlayerPieces,
  getOldestPiece,
  TicTacToeState,
} from '../engine';
import { TicTacToeBoard } from '../components/TicTacToeBoard';
import {
  subscribeToMatch,
  submitOnlineMove,
  joinOnlineRoom,
  leaveOnlineMatch,
  describeMoveFailure,
  MatchSyncData,
} from '../../common/multiplayer';
import { watchRoomPeers } from '../../common/roomPresence';
import { playDefeat, playPlace, playVictory } from '../../common/audio';
import { buzzTap } from '../../common/haptics';
import { SoundToggle } from '../../common/SoundToggle';
import { RoomPeersNotice } from '../../../components/RoomPeersNotice';
import {
  isSupabaseConfigured,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../../lib/supabase';

export const TicTacToeMatch: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const roomCode = (code || '').toUpperCase();

  const [playerName] = useState(() => getStoredPlayerName() || 'Pemain ' + Math.floor(Math.random() * 900 + 100));
  const [syncData, setSyncData] = useState<MatchSyncData | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [opponentLeftNotice, setOpponentLeftNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'realtime' | 'fallback'>('realtime');
  const [peerTabs, setPeerTabs] = useState(0);

  const victoryDialogRef = useRef<HTMLDialogElement>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) return;

    let isMounted = true;
    joinOnlineRoom({ roomCode, playerName, startWhenFull: true })
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
      () => {},
      (leavePayload) => {
        setOpponentLeftNotice(`${leavePayload?.playerName || 'Lawan'} telah keluar dari pertandingan.`);
      },
      setConnection
    );
    channelRef.current = sub.channel;

    return () => {
      sub.unsubscribe();
    };
  }, [roomCode]);

  // Kursi dikenali dari identitas di penyimpanan bersama, jadi dua jendela pada satu browser memakai kursi yang sama.
  useEffect(() => watchRoomPeers(roomCode, setPeerTabs), [roomCode]);

  const lastSeen = useRef<{ status: string; moves: number } | null>(null);

  useEffect(() => {
    const game = syncData?.match?.game_state as TicTacToeState | undefined;
    const status = game?.status ?? 'IN_PROGRESS';
    const moves = game?.moveCount ?? 0;
    const previous = lastSeen.current;
    // moveCount is the only monotonic signal here: the no-draw rule recycles the
    // oldest piece, so pieces.length plateaus at six.
    if (previous && moves > previous.moves) {
      playPlace();
      buzzTap();
    }
    if (previous && status === 'WIN' && previous.status !== 'WIN') {
      const mySymbol = syncData?.myPlayerIndex === 0 ? 'X' : syncData?.myPlayerIndex === 1 ? 'O' : null;
      if (mySymbol && game?.winner !== mySymbol) playDefeat();
      else playVictory();
    }
    lastSeen.current = { status, moves };

    if (game?.status === 'WIN') {
      victoryDialogRef.current?.showModal();
    } else {
      victoryDialogRef.current?.close();
    }
  }, [syncData?.match?.game_state?.status, syncData?.match?.game_state?.moveCount, syncData?.myPlayerIndex]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExitRoom = async () => {
    if (!syncData) {
      navigate('/tic-tac-toe');
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
        channel: channelRef.current,
      });
    } catch (err) {
      // A seat row left behind by a failed exit is what makes "lawan masih terlihat online" reports
      // impossible to diagnose after the fact, so keep the reason on the console.
      console.warn('keluar room gagal diselesaikan', err);
    }
    navigate('/tic-tac-toe');
  };

  const handleCellClick = async (cellIndex: number) => {
    if (!syncData || isSubmitting) return;
    const game = syncData.match.game_state as TicTacToeState;
    if (game.status !== 'IN_PROGRESS') return;

    // Player 0 is 'X', Player 1 is 'O'
    const expectedTurn = game.currentTurn === 'X' ? 0 : 1;
    if (syncData.myPlayerIndex !== expectedTurn) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      const nextGame = applyMove(game, cellIndex);
      const nextTurnIndex = nextGame.currentTurn === 'X' ? 0 : 1;
      const isWon = nextGame.status === 'WIN';

      const result = await submitOnlineMove({
        matchId: syncData.match.id,
        playerIndex: syncData.myPlayerIndex,
        action: 'MOVE',
        nextState: nextGame,
        nextTurn: nextTurnIndex,
        basedOn: syncData.match.updated_at,
        winnerIndex: isWon ? syncData.myPlayerIndex : null,
        newStatus: isWon ? 'completed' : 'playing',
      });

      if (!result.ok) {
        setActionError(describeMoveFailure(result));
        return;
      }
      if (result.message) setActionError(result.message);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_move',
        payload: { cellIndex },
      });
    } catch (err: any) {
      setActionError(err.message || 'Langkah tidak dapat diproses.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextRound = async () => {
    if (!syncData || isSubmitting) return;

    const isOpponentGone = Boolean(
      opponentLeftNotice ||
      syncData.match.status === 'abandoned' ||
      syncData.players.length < 2
    );

    if (isOpponentGone) {
      // The victory dialog is still open at this point, so a page-level error
      // banner would render behind it. This state is the only visible surface.
      setOpponentLeftNotice('Lawan telah meninggalkan room dan kembali ke lobby. Ronde berikutnya tidak dapat dimulai.');
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError(null);
      victoryDialogRef.current?.close();
      const currentGame = syncData.match.game_state as TicTacToeState;
      const nextGame = resetRound(currentGame);
      const nextTurnIndex = nextGame.currentTurn === 'X' ? 0 : 1;

      const result = await submitOnlineMove({
        matchId: syncData.match.id,
        playerIndex: syncData.myPlayerIndex,
        action: 'NEXT_ROUND',
        nextState: nextGame,
        nextTurn: nextTurnIndex,
        basedOn: syncData.match.updated_at,
        winnerIndex: null,
        newStatus: 'playing',
        expectTurn: false,
        statusGuard: 'completed',
      });

      if (!result.ok) {
        setActionError(describeMoveFailure(result));
      } else if (result.message) {
        setActionError(result.message);
      }
    } catch (err: any) {
      setActionError(err.message || 'Ronde berikutnya tidak dapat dimulai.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line-strong)', borderRadius: 'var(--r4)', padding: '40px 24px' }}>
          <AlertCircle size={40} color="var(--gold)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>Supabase Belum Dikonfigurasi</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Kredensial API Supabase belum terdeteksi. Silakan periksa file .env.local.
          </p>
          <Link
            to="/tic-tac-toe"
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
            Kembali ke Tic-Tac-Toe
          </Link>
        </div>
      </div>
    );
  }

  if (joinError) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line-strong)', borderRadius: 'var(--r4)', padding: '40px 24px' }}>
          <AlertCircle size={40} color="var(--terracotta)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>Tidak Dapat Bergabung</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            {joinError}
          </p>
          <Link
            to="/tic-tac-toe"
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
            Kembali ke Tic-Tac-Toe
          </Link>
        </div>
      </div>
    );
  }

  if (!syncData) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center' }}>
        <Clock size={32} color="var(--gold)" style={{ margin: '0 auto 16px' }} />
        <p style={{ font: '13px/1 var(--mono)', color: 'var(--ink-dim)', letterSpacing: '.05em' }}>
          Menghubungkan ke room Tic-Tac-Toe {roomCode}...
        </p>
      </div>
    );
  }

  const { match, players, myPlayerIndex } = syncData;
  const game = match.game_state as TicTacToeState;
  const mySymbol = myPlayerIndex === 0 ? 'X' : myPlayerIndex === 1 ? 'O' : null;
  const isMyTurn = (match.status === 'playing' || match.status === 'waiting') && game && game.currentTurn === mySymbol;

  const activePlayerPieces = game ? getPlayerPieces(game.pieces, game.currentTurn) : [];
  const activeOldestPiece = game ? getOldestPiece(game.pieces, game.currentTurn) : undefined;

  const p1 = players.find((p) => p.player_index === 0);
  const p2 = players.find((p) => p.player_index === 1);

  const isAbandoned = match.status === 'abandoned';
  const didIWinByAbandon = isAbandoned && match.winner_index === myPlayerIndex;
  const isOpponentLeft = Boolean(
    opponentLeftNotice ||
    isAbandoned ||
    (match.status !== 'waiting' && players.length < 2)
  );

  return (
    <div style={{ maxWidth: '640px', margin: '24px auto', padding: '0 16px' }}>
      {/* Header */}
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
            aria-label="Kembali ke Menu"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.015em' }}>
              Tic Tac Toe · <span style={{ color: 'var(--gold)', fontWeight: 400 }}>Online No-Draw</span>
            </h1>
            <div style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '4px' }}>
              Room: <span style={{ fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink)' }}>{roomCode}</span> · Simbol Anda: <strong style={{ color: mySymbol === 'X' ? 'var(--gold)' : '#292524' }}>{mySymbol || 'Penonton'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <SoundToggle />
          <button
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: copied ? 'var(--gold)' : '#ffffff',
              border: `1px solid ${copied ? 'var(--gold)' : 'var(--line-strong)'}`,
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              color: copied ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {copied ? <Check size={13} /> : <Share2 size={13} />}
            {copied ? 'Tersalin' : 'Bagikan Link'}
          </button>
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: 'var(--terracotta-tint)',
            border: '1px solid var(--terracotta)',
            borderRadius: 'var(--r3)',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'var(--ink)',
          }}
        >
          <AlertCircle size={16} color="var(--terracotta)" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{actionError}</span>
        </div>
      )}

      <RoomPeersNotice peerCount={peerTabs} />

      {connection === 'fallback' && (
        <p
          role="status"
          style={{
            font: '11px/1.4 var(--mono)',
            color: 'var(--ink-dim)',
            margin: '0 0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={13} aria-hidden="true" />
          Koneksi realtime terputus. Papan disinkronkan ulang setiap 5 detik.
        </p>
      )}

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
            {didIWinByAbandon ? 'Selamat! Anda Menang (Lawan Keluar)' : 'Pertandingan Berakhir'}
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-dim)', margin: '0 0 20px', lineHeight: 1.5 }}>
            {opponentLeftNotice || 'Pemain lawan telah keluar dari room pertandingan.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/tic-tac-toe')}
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
              <Home size={13} /> Kembali ke Menu
            </button>
          </div>
        </div>
      )}

      {/* Waiting for opponent banner */}
      {players.length < 2 && (
        <div
          style={{
            background: 'var(--gold-tint)',
            border: '1px solid var(--gold-border)',
            borderRadius: 'var(--r3)',
            padding: '24px 20px',
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          <div style={{ font: '11px/1 var(--mono)', letterSpacing: '.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Menunggu Lawan Bergabung
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>
            Bagikan Kode Room: <span style={{ fontFamily: 'var(--mono)', fontSize: '20px', letterSpacing: '.12em' }}>{roomCode}</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-dim)', margin: 0 }}>
            Permainan akan otomatis dimulai segera setelah lawan masuk ke room ini.
          </p>
        </div>
      )}

      {/* Scoreboard */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Player X */}
        <div
          style={{
            background: game.currentTurn === 'X' ? 'var(--gold-tint)' : '#ffffff',
            border: `1px solid ${game.currentTurn === 'X' ? 'var(--gold)' : 'var(--line-strong)'}`,
            borderRadius: 'var(--r2)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>X</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{p1?.name || 'Pemain 1'}</span>
              {myPlayerIndex === 0 && <span style={{ fontSize: '11px', color: 'var(--ink-dim)' }}>(Anda)</span>}
            </div>
            <div style={{ font: '10.5px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '4px' }}>
              Bidak Aktif: {getPlayerPieces(game.pieces, 'X').length}/3
            </div>
          </div>
          <div style={{ font: '24px/1 var(--mono)', fontWeight: 800, color: 'var(--gold)' }}>
            {game.score.X}
          </div>
        </div>

        {/* Player O */}
        <div
          style={{
            background: game.currentTurn === 'O' ? '#fafaf9' : '#ffffff',
            border: `1px solid ${game.currentTurn === 'O' ? '#292524' : 'var(--line-strong)'}`,
            borderRadius: 'var(--r2)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#292524', fontFamily: 'var(--mono)' }}>O</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{p2?.name || 'Menunggu...'}</span>
              {myPlayerIndex === 1 && <span style={{ fontSize: '11px', color: 'var(--ink-dim)' }}>(Anda)</span>}
            </div>
            <div style={{ font: '10.5px/1 var(--mono)', color: 'var(--ink-dim)', marginTop: '4px' }}>
              Bidak Aktif: {getPlayerPieces(game.pieces, 'O').length}/3
            </div>
          </div>
          <div style={{ font: '24px/1 var(--mono)', fontWeight: 800, color: '#292524' }}>
            {game.score.O}
          </div>
        </div>
      </div>

      {/* Turn & Status Cue */}
      <div
        style={{
          background: isMyTurn ? 'var(--gold-tint)' : '#ffffff',
          border: `1px solid ${isMyTurn ? 'var(--gold-border)' : 'var(--line)'}`,
          borderRadius: 'var(--r2)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isMyTurn ? 'var(--gold)' : 'var(--ink-faint)',
            }}
          />
          <span style={{ font: '12px/1 var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>
            {isMyTurn ? 'Giliran Anda!' : `Menunggu giliran ${game.currentTurn === 'X' ? p1?.name || 'Pemain X' : p2?.name || 'Pemain O'}...`}
          </span>
        </div>

        {activePlayerPieces.length >= 3 && activeOldestPiece && (
          <span style={{ font: '11px/1 var(--mono)', color: 'var(--terracotta)', fontWeight: 600 }}>
            Langkah berikutnya akan menghapus bidak #{activeOldestPiece.order}
          </span>
        )}
      </div>

      {/* Board */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <TicTacToeBoard
          board={game.board}
          pieces={game.pieces}
          currentTurn={game.currentTurn}
          winningLine={game.winningLine}
          onCellClick={handleCellClick}
          disabled={!isMyTurn || isSubmitting || players.length < 2}
        />
      </div>

      {/* Victory Dialog */}
      <dialog
        ref={victoryDialogRef}
        aria-labelledby="ttt-online-victory-title"
        style={{
          margin: 'auto',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          background: '#ffffff',
          padding: '36px 32px',
          maxWidth: '420px',
          width: '90vw',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.15)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--gold-tint)',
            border: '1px solid var(--gold-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--gold)',
          }}
        >
          <Trophy size={28} />
        </div>

        <h2 id="ttt-online-victory-title" style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px', color: 'var(--ink)' }}>
          {isOpponentLeft
            ? 'Pertandingan Selesai'
            : game.winner === mySymbol
            ? 'Selamat, Anda Menang!'
            : `Pemenang: Pemain ${game.winner}!`}
        </h2>

        <p style={{ fontSize: '13.5px', color: 'var(--ink-dim)', marginBottom: '24px', lineHeight: 1.5 }}>
          {isOpponentLeft ? (
            <span style={{ color: 'var(--terracotta)', fontWeight: 600 }}>
              {opponentLeftNotice || 'Lawan telah meninggalkan room dan kembali ke lobby.'}
            </span>
          ) : (
            `Pemain ${game.winner === 'X' ? p1?.name : p2?.name} (${game.winner}) berhasil menyusun 3 bidak segaris.`
          )}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {!isOpponentLeft && (
            <button
              type="button"
              onClick={handleNextRound}
              disabled={isSubmitting}
              data-testid="ttt-next-round-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                background: 'var(--gold)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
              }}
            >
              <RotateCw size={13} /> Ronde Berikutnya
            </button>
          )}
          <button
            type="button"
            onClick={handleExitRoom}
            data-testid="ttt-victory-exit-lobby-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              background: isOpponentLeft ? 'var(--gold)' : '#ffffff',
              color: isOpponentLeft ? '#ffffff' : 'var(--ink)',
              border: isOpponentLeft ? 'none' : '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Home size={13} /> {isOpponentLeft ? 'Kembali ke Lobby' : 'Lobby'}
          </button>
        </div>
      </dialog>
    </div>
  );
};
