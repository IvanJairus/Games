import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Share2, Check, AlertCircle, Home } from 'lucide-react';
import { Board } from '../components/Board';
import { BoardSwitch } from '../components/BoardSwitch';
import { Placer } from '../components/Placer';
import { FleetRail } from '../components/FleetRail';
import { FinishBlock } from '../components/FinishBlock';
import { FinishDialog } from '../components/FinishDialog';
import { BattleshipState, FLEET, Placement, cellLabel, otherSeat } from '../engine/types';
import {
  RevealPayload,
  SeatReport,
  abandonGame,
  applyCommitment,
  createInitialState,
  fireShot,
  judgeShot,
  parseCanonicalLayout,
  resolveShot,
  revealFleet,
  verifyReveals,
} from '../engine';
import { canonicalLayout, computeCommitment } from '../engine/crypto';
import { SecretLayout, clearSecretLayout, loadSecretLayout, saveSecretLayout } from '../engine/store';
import {
  MatchStatus,
  MatchSyncData,
  describeMoveFailure,
  joinOnlineRoom,
  leaveOnlineMatch,
  submitOnlineMove,
  subscribeToMatch,
} from '../../common/multiplayer';
import { watchRoomPeers } from '../../common/roomPresence';
import { RoomPeersNotice } from '../../../components/RoomPeersNotice';
import { getStoredPlayerName, isSupabaseConfigured, setStoredPlayerName } from '../../../lib/supabase';
import { playDefeat, playHit, playMiss, playVictory } from '../../common/audio';
import { buzzTap, buzzThud } from '../../common/haptics';
import { SoundToggle } from '../../common/SoundToggle';

const seatOf = (index: number): 0 | 1 => (index === 1 ? 1 : 0);
const nameForSeat = (seat: number, mine: number): string => (seat === mine ? 'Anda' : 'Lawan');

const revealKey = (reveal: (RevealPayload | null)[]): string =>
  reveal.map((r) => (r ? `${r.seed}:${r.layout.length}` : '-')).join('|');

export const BattleshipMatch: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const roomCode = (code || '').toUpperCase();

  const [playerName] = useState(() => getStoredPlayerName() || 'Pemain ' + Math.floor(Math.random() * 900 + 100));
  const [syncData, setSyncData] = useState<MatchSyncData | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'realtime' | 'fallback'>('realtime');
  const [peerTabs, setPeerTabs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastResolved, setLastResolved] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'own' | 'target'>('target');
  const [myLayout, setMyLayout] = useState<SecretLayout | null>(() => loadSecretLayout(roomCode));
  const [reports, setReports] = useState<SeatReport[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [finishDismissed, setFinishDismissed] = useState(false);

  const channelRef = useRef<any>(null);
  const joinedRef = useRef(false);
  const judgedCell = useRef('');
  const revealedOnce = useRef(false);

  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured() || joinedRef.current) return;
    joinedRef.current = true;

    let mounted = true;
    joinOnlineRoom({ roomCode, playerName })
      .then(() => {
        if (mounted) setStoredPlayerName(playerName);
      })
      .catch((err) => {
        if (mounted) setJoinError(err.message);
      });

    return () => {
      mounted = false;
    };
  }, [playerName, roomCode]);

  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) return;
    const sub = subscribeToMatch(
      roomCode,
      (data) => {
        setSyncData(data);
        setJoinError(null);
      },
      undefined,
      (payload) => setActionError(`${payload?.playerName || 'Lawan'} keluar dari room.`),
      setConnection
    );
    channelRef.current = sub.channel;
    return () => sub.unsubscribe();
  }, [roomCode]);

  // Kursi dikenali dari identitas di penyimpanan bersama, jadi dua jendela pada satu browser memakai kursi yang sama.
  useEffect(() => watchRoomPeers(roomCode, setPeerTabs), [roomCode]);

  const game = (syncData?.match.game_state as BattleshipState) || null;
  const mySeat = syncData?.myPlayerIndex ?? -1;
  const opponentSeat = otherSeat(seatOf(mySeat));

  const lastSeen = useRef<{ shots: number; hits: number; phase: string } | null>(null);

  useEffect(() => {
    if (!game) return;
    const shots = game.shotsTaken[0] + game.shotsTaken[1];
    const hits = game.marks.reduce((n, board) => n + Object.values(board).filter((m) => m === 'hit').length, 0);
    const previous = lastSeen.current;
    lastSeen.current = { shots, hits, phase: game.phase };
    if (!previous) return;
    // A rematch (or any reset back out of FINISHED) re-arms this device: the reveal
    // flag, the judged-shot guard and the finish popup must all work for the next game.
    if (previous.phase === 'FINISHED' && game.phase !== 'FINISHED') {
      revealedOnce.current = false;
      judgedCell.current = '';
      setFinishDismissed(false);
      setReports([]);
      setVerifying(false);
    }
    // Both seats react to the same synced verdict, so the defender hears the result
    // of the shot aimed at its own fleet too.
    if (shots > previous.shots) {
      if (hits > previous.hits) {
        playHit();
        buzzThud();
      } else {
        playMiss();
        buzzTap();
      }
    }
    if (game.phase === 'FINISHED' && previous.phase !== 'FINISHED') {
      if (game.winner === null || game.winner === mySeat) playVictory();
      else playDefeat();
    }
  }, [game, mySeat]);

  const push = useCallback(
    async (
      action: string,
      next: BattleshipState,
      opts: {
        nextTurn: 0 | 1;
        summary: Record<string, unknown>;
        status?: 'playing' | 'completed' | 'abandoned';
        expectTurn?: boolean;
        statusGuard?: MatchStatus;
        basedOn?: string;
      }
    ): Promise<boolean> => {
      if (!syncData || mySeat < 0) return false;

      try {
        setBusy(true);
        setActionError(null);

        const result = await submitOnlineMove({
          matchId: syncData.match.id,
          playerIndex: mySeat,
          action,
          nextState: next,
          nextTurn: opts.nextTurn,
          winnerIndex: next.winner,
          newStatus: opts.status,
          moveSummary: opts.summary,
          expectTurn: opts.expectTurn,
          statusGuard: opts.statusGuard,
          basedOn: syncData.match.updated_at,
        });

        if (!result.ok) {
          setActionError(describeMoveFailure(result));
          return false;
        }
        if (result.message) setActionError(result.message);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [mySeat, syncData]
  );

  const lockFleet = async (layout: SecretLayout) => {
    if (!game || mySeat < 0) return;

    saveSecretLayout(roomCode, layout);
    setMyLayout(layout);

    const commitment = await computeCommitment(layout.seed, layout.placements);
    const applied = applyCommitment(game, seatOf(mySeat), commitment);
    if (applied.error) {
      setActionError(applied.error);
      return;
    }

    const ok = await push('COMMIT', applied.state, {
      nextTurn: otherSeat(seatOf(mySeat)),
      status: applied.state.phase === 'BATTLE' ? 'playing' : undefined,
      summary: { phase: applied.state.phase },
    });
    if (ok) setView('target');
  };

  const shoot = async () => {
    if (!game || selected === null || mySeat < 0) return;

    const fired = fireShot(game, seatOf(mySeat), selected);
    if (fired.error) {
      setActionError(fired.error);
      return;
    }

    const ok = await push('SHOT', fired.state, {
      nextTurn: otherSeat(seatOf(mySeat)),
      summary: { shot: cellLabel(selected) },
    });
    if (ok) setSelected(null);
  };

  // The defender judges with the layout on its own device, then writes the verdict.
  useEffect(() => {
    if (!game || !myLayout || mySeat < 0) return;
    if (game.phase !== 'BATTLE' || !game.pendingShot || game.pendingShot.by === mySeat) return;

    const signature = `${game.pendingShot.by}:${game.pendingShot.cell}`;
    if (judgedCell.current === signature) return;
    judgedCell.current = signature;

    const cell = game.pendingShot.cell;
    const verdict = judgeShot({ placements: myLayout.placements, marks: game.marks[mySeat] }, cell);
    const resolved = resolveShot(game, seatOf(mySeat), verdict);
    if (resolved.error) {
      setActionError(resolved.error);
      return;
    }

    setLastResolved(cell);
    void push('RESOLVE', resolved.state, {
      nextTurn: seatOf(mySeat),
      status: resolved.state.phase === 'FINISHED' ? 'completed' : undefined,
      summary: { shot: cellLabel(cell), result: verdict.mark, sunk: verdict.sunk ?? null },
    });
  }, [game, myLayout, mySeat, push]);

  useEffect(() => {
    if (!game || !myLayout || mySeat < 0) return;
    if (game.phase !== 'FINISHED' || game.reveal[seatOf(mySeat)]) return;
    if (revealedOnce.current) return;
    revealedOnce.current = true;

    const payload: RevealPayload = { seed: myLayout.seed, layout: canonicalLayout(myLayout.placements) };
    void revealFleet(game, seatOf(mySeat), payload).then(({ state: next }) => {
      void push('REVEAL', next, {
        nextTurn: otherSeat(seatOf(mySeat)),
        summary: { reveal: true },
      });
    });
  }, [game, myLayout, mySeat, push]);

  const revealsKnown = game ? revealKey(game.reveal) : '';

  useEffect(() => {
    if (!game || game.phase !== 'FINISHED') return;
    const payloads: (RevealPayload | null)[] = game.reveal;
    if (!payloads.some(Boolean)) return;

    let cancelled = false;
    setVerifying(true);
    verifyReveals(game, payloads).then((result) => {
      if (cancelled) return;
      setReports(result);
      setVerifying(false);
    });
    return () => {
      cancelled = true;
    };
  }, [game, revealsKnown]);

  const exitRoom = async (to = '/battleship') => {
    if (syncData && game && game.phase === 'BATTLE' && mySeat >= 0) {
      if (!window.confirm('Keluar saat bertanding menyerahkan kemenangan ke lawan. Lanjutkan?')) return;
      await push(
        'ABANDON',
        abandonGame(game, 'left-while-battle', otherSeat(seatOf(mySeat))),
        {
          nextTurn: otherSeat(seatOf(mySeat)),
          summary: { reason: 'left-while-battle' },
          // The protocol refuses a winner while the row still reads "playing", so the
          // hand-over has to move the status in the same write.
          status: 'abandoned',
          expectTurn: false,
          statusGuard: 'playing',
        }
      );
    }

    if (syncData && mySeat >= 0) {
      try {
        await leaveOnlineMatch({
          matchId: syncData.match.id,
          roomCode,
          playerIndex: mySeat,
          playerName,
          channel: channelRef.current,
        });
      } catch (err) {
        console.warn('keluar room gagal diselesaikan', err);
      }
    }

    clearSecretLayout(roomCode);
    navigate(to);
  };

  // A rematch writes a fresh PLACEMENT state, so this device must forget the fleet it
  // committed and re-arm the reveal guard before the next game.
  useEffect(() => {
    if (!game || mySeat < 0) return;
    if (game.phase === 'PLACEMENT' && !game.commitment[seatOf(mySeat)] && myLayout) {
      clearSecretLayout(roomCode);
      setMyLayout(null);
    }
  }, [game, myLayout, mySeat, roomCode]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Restarting in place: the row goes back to PLACEMENT so both seats keep this room
  // code and simply commit a new fleet.
  const rematch = async () => {
    if (!game || mySeat < 0) return;
    await push('REMATCH', createInitialState(), {
      nextTurn: 0,
      status: 'playing',
      summary: { rematch: true },
      expectTurn: false,
    });
  };

  const revealedPlacements = useMemo<(Placement[] | null)[]>(() => {
    if (!game) return [null, null];
    return game.reveal.map((payload) => (payload ? parseCanonicalLayout(payload.layout) : null));
  }, [game]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="bs-shell">
        <MissingConfig />
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="bs-shell">
        <div className="bs-note" data-tone="alert" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{joinError}</span>
        </div>
        <Link to="/battleship" className="bs-btn" style={{ textDecoration: 'none' }}>
          Kembali ke Battleship
        </Link>
      </div>
    );
  }

  if (!syncData || !game) {
    return (
      <div className="bs-shell">
        <RoomHeader roomCode={roomCode} copied={copied} onCopy={copyLink} onBack={() => void exitRoom()} />
        <p className="bs-turn" role="status">
          <Clock size={13} aria-hidden="true" /> Memuat room {roomCode}
        </p>
      </div>
    );
  }

  const spectator = mySeat < 0;
  const roomOver = syncData.match.status === 'abandoned';
  const readOnly = spectator || roomOver;
  // A rematch needs two seats: an abandoned room or a lone player would only restart
  // into a game nobody can join.
  const canRematch = !spectator && !roomOver && syncData.players.length >= 2;
  // A spectator has no seat, so both fleets are named after the players holding them.
  const seatLabel = (seat: number): string =>
    spectator
      ? syncData.players.find((p) => p.player_index === seat)?.name || `Pemain ${seat + 1}`
      : nameForSeat(seat, mySeat);
  const myTurnToCommit = game.phase === 'PLACEMENT' && !readOnly && game.currentTurn === mySeat;
  const myTurnToShoot = game.phase === 'BATTLE' && !readOnly && game.currentTurn === mySeat && !game.pendingShot;
  const statusLine = spectator
    ? 'Kursi penuh, Anda membaca papan'
    : game.phase === 'PLACEMENT'
      ? myTurnToCommit
        ? 'Saatnya mengunci armada Anda'
        : `Menunggu ${nameForSeat(game.currentTurn, mySeat)} mengunci armada`
      : game.phase === 'BATTLE'
        ? game.pendingShot && game.pendingShot.by !== mySeat
          ? 'Menilai tembakan yang masuk'
          : myTurnToShoot
            ? 'Giliran Anda menembak'
            : 'Lawan sedang menembak'
        : game.winner === null
          ? 'Selesai tanpa pemenang'
          : game.winner === mySeat
            ? 'Armada lawan musnah'
            : 'Armada Anda musnah';

  return (
    <div className="bs-shell">
      <RoomHeader roomCode={roomCode} copied={copied} onCopy={copyLink} onBack={() => void exitRoom()} />

      <div className="bs-head" style={{ marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Battleship Online
          </h1>
          <div className="bs-turn" data-mine={myTurnToShoot || myTurnToCommit || undefined}>{statusLine}</div>
        </div>
        <div style={{ font: '11px/1.6 var(--mono)', color: 'var(--ink-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {game.shotsTaken[0]} : {game.shotsTaken[1]} tembakan
          <br />
          {syncData.players.map((p) => p.name).join(' vs ')}
        </div>
      </div>

      <RoomPeersNotice peerCount={peerTabs} />

      {connection === 'fallback' && (
        <p className="bs-turn" role="status" style={{ marginBottom: '12px' }}>
          <Clock size={13} aria-hidden="true" /> Realtime terputus, papan dicek ulang tiap 5 detik.
        </p>
      )}

      {actionError && (
        <div className="bs-note" data-tone="alert" role="alert">
          {actionError}
        </div>
      )}

      {(spectator || roomOver) && (
        <div className="bs-note" role="status">
          {spectator
            ? 'Kursi room sudah terisi. Papan bisa dibaca tetapi tidak bisa ditembak.'
            : 'Room ini ditinggalkan pemain sehingga papan dikunci. Buat room baru dari halaman Battleship.'}
        </div>
      )}

      {game.phase === 'PLACEMENT' && !readOnly && (
        myTurnToCommit ? (
          <Placer onReady={lockFleet} disabled={busy} />
        ) : myLayout ? (
          <div className="bs-note" role="status">
            Armada Anda terkunci dan komitmennya sudah terkirim. Menunggu lawan mengunci miliknya.
          </div>
        ) : (
          <div className="bs-note" role="status">
            Giliran {nameForSeat(game.currentTurn, mySeat)} mengirim komitmen lebih dulu. Halaman ini tetap
            hidup, tidak perlu dimuat ulang.
          </div>
        )
      )}

      <div className="bs-boards" data-view={view}>
        <BoardSwitch
          value={view}
          onChange={setView}
          ownLabel={`Papan ${nameForSeat(mySeat, mySeat)}`}
          targetLabel={`Papan ${nameForSeat(opponentSeat, mySeat)}`}
        />

        <Board
          variant="own"
          label={`Papan ${nameForSeat(mySeat, mySeat)}`}
          hint={`${game.sunk[mySeat]?.length ?? 0}/${FLEET.length} kapal Anda tenggelam`}
          marks={game.marks[mySeat] || {}}
          ships={myLayout?.placements ?? (revealedPlacements[mySeat] ?? undefined)}
          sunkKinds={game.sunk[mySeat] || []}
          lastResolved={lastResolved}
        />
        <Board
          variant="target"
          label={`Papan ${nameForSeat(opponentSeat, mySeat)}`}
          hint={`${game.sunk[opponentSeat]?.length ?? 0}/${FLEET.length} kapal lawan tenggelam`}
          marks={game.marks[opponentSeat] || {}}
          ships={revealedPlacements[opponentSeat] ?? undefined}
          sunkKinds={game.sunk[opponentSeat] || []}
          selected={selected}
          interactive={myTurnToShoot}
          active={myTurnToShoot}
          lastResolved={lastResolved}
          onPick={(cell) => setSelected(cell)}
        />
      </div>

      <FleetRail sunk={game.sunk[opponentSeat] || []} />

      {myTurnToShoot && (
        <div className="bs-actions">
          <button type="button" className="bs-btn" data-tone="danger" onClick={shoot} disabled={selected === null || busy}>
            {selected === null ? 'Pilih petak target' : `Tembak ${cellLabel(selected)}`}
          </button>
        </div>
      )}

      {game.phase === 'FINISHED' && !finishDismissed && (
        <FinishDialog
          open
          state={game}
          labels={[seatLabel(0), seatLabel(1)]}
          viewAs={spectator ? null : seatOf(mySeat)}
          testId="bs-finish-dialog"
          retry={
            canRematch
              ? { label: 'Rematch di room ini', onClick: () => void rematch(), disabled: busy, testId: 'bs-rematch-btn' }
              : { label: 'Keluar dari room', onClick: () => void exitRoom(), testId: 'bs-finish-exit' }
          }
          secondaryActions={[
            {
              label: 'Lobi Battleship',
              icon: <ArrowLeft size={12} />,
              onClick: () => void exitRoom('/battleship'),
              testId: 'bs-finish-lobby',
            },
            {
              label: 'Halaman utama',
              icon: <Home size={12} />,
              onClick: () => void exitRoom('/'),
              testId: 'bs-finish-home',
            },
          ]}
          onDismiss={() => setFinishDismissed(true)}
        />
      )}

      {game.phase === 'FINISHED' && (
        <FinishBlock
          state={game}
          boards={[0, 1].map((seat) => ({
            seat: seatOf(seat),
            label: seatLabel(seat),
            placements: seat === mySeat ? myLayout?.placements ?? null : revealedPlacements[seat] ?? null,
          }))}
          reports={reports}
          verifying={verifying}
          resetLabel="Kembali ke lobby"
          onReset={() => void exitRoom()}
          waitingNote={
            !game.reveal[opponentSeat]
              ? 'Lawan belum mengungkap armadanya. Bukti armada lawan muncul setelah mereka mengirim reveal.'
              : null
          }
        />
      )}
    </div>
  );
};

const RoomHeader: React.FC<{
  roomCode: string;
  copied: boolean;
  onCopy: () => void;
  onBack: () => void;
}> = ({ roomCode, copied, onCopy, onBack }) => (
  <header className="bs-head">
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
      <button
        type="button"
        onClick={onBack}
        className="bs-btn"
        style={{ flex: '0 0 auto', minWidth: '44px', padding: '8px 10px' }}
        aria-label={`Keluar dari room ${roomCode}`}
      >
        <ArrowLeft size={15} />
      </button>
      <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
        ROOM <strong style={{ color: 'var(--ink)', letterSpacing: '.12em' }}>{roomCode}</strong>
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
      <SoundToggle className="bs-btn" iconSize={15} />
      <button type="button" className="bs-btn" onClick={onCopy}>
        {copied ? <Check size={13} /> : <Share2 size={13} />}
        {copied ? 'Tersalin' : 'Bagikan'}
      </button>
    </div>
  </header>
);

const MissingConfig: React.FC = () => (
  <div style={{ textAlign: 'center', padding: 'clamp(24px, 6vw, 48px) 0' }}>
    <AlertCircle size={36} color="var(--gold)" aria-hidden="true" />
    <h2 style={{ fontSize: '19px', fontWeight: 700, margin: '12px 0 6px' }}>Supabase Belum Dikonfigurasi</h2>
    <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', margin: '0 0 20px', lineHeight: 1.6 }}>
      Room online butuh kredensial Supabase. Mode solo dan dua pemain di satu perangkat tetap jalan tanpa
      server.
    </p>
    <Link
      to="/battleship/local?mode=solo"
      className="bs-btn"
      style={{ textDecoration: 'none', display: 'inline-flex' }}
    >
      Main lokal saja
    </Link>
  </div>
);
