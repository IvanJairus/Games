import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../slap-arena.css';
import { Arena3D, type Arena3DHandle } from '../components/Arena3D';
import { ArenaModal, Hud, useMuted, type HudSnapshot } from '../components/Hud';
import { TouchControls } from '../components/TouchControls';
import { SlapSim } from '../engine/sim';
import { ArenaNet, type InputMessage } from '../engine/net';
import type { InputState, SimEvent } from '../engine/types';
import {
  playCountTick,
  playDashSound,
  playFallSound,
  playKnockbackSound,
  playMatchWinSound,
  playRoundWinSound,
  playSlapSound,
  unlockAudio,
} from '../engine/audio';
import { getSupabase, getPlayerSessionId, getStoredPlayerName } from '../../../lib/supabase';
import {
  joinOnlineRoom,
  leaveOnlineMatch,
  startOnlineMatch,
  subscribeToMatch,
  type MatchSyncData,
} from '../../common/multiplayer';

const BOT_CONFIGS = [
  { name: 'Bob', color: '#ff5d5d' },
  { name: 'Sam', color: '#6fe3b0' },
  { name: 'Sue', color: '#b197fc' },
];

const HIT_STOP_MS = 70;
const AUTO_NEXT_ROUND_MS = 3800;

const COMICS = ['PAF!', 'SUIT!', 'BUK!', 'TAMPAR!', 'DAR!'];
const pickComic = () => COMICS[Math.floor(Math.random() * COMICS.length)];

function readColor(): string {
  try {
    const raw = window.localStorage.getItem('slap_player_color');
    return raw && /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#4dabf7';
  } catch {
    return '#4dabf7';
  }
}

function blankHud(localId: string, roomCode: string | null): HudSnapshot {
  return {
    round: 1,
    phase: 'WAITING',
    countdown: 0,
    scoreToWin: 3,
    winnerId: null,
    matchWinnerId: null,
    players: [],
    localId,
    roomCode,
    peers: 1,
    needed: 2,
    slapCd: 0,
    dashCd: 0,
  };
}

export const SlapArenaMatch: React.FC = () => {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const roomCode = code && code !== 'solo' ? code.toUpperCase() : null;
  const isSolo = roomCode === null;

  const localId = useRef(getPlayerSessionId()).current;
  const playerName = useRef(getStoredPlayerName() || 'Brawler').current;
  const playerColor = useRef(readColor()).current;
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ).current;

  const [usesTouch, setUsesTouch] = useState(false);
  const [muted, toggleMute] = useMuted();
  const [hud, setHud] = useState<HudSnapshot>(() => blankHud(localId, roomCode));
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(isSolo);
  const [disconnected, setDisconnected] = useState<string | null>(null);

  const arenaRef = useRef<Arena3DHandle>(null);
  const inputRef = useRef<InputState>({ x: 0, z: 0, slap: false, dash: false });
  const stickRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const fxQueue = useRef<SimEvent[]>([]);
  const hitStopUntil = useRef(0);
  const matchIdRef = useRef<string | null>(null);
  const lastCount = useRef(0);
  const netStatsRef = useRef<ArenaNet | null>(null);

  const sim = useMemo(() => {
    const s = new SlapSim({ localId, authoritative: isSolo, scoreToWin: 3 });
    s.onEvent = (event) => {
      if (s.authoritative) fxQueue.current.push(event);
      handleSimEvent(event, s, arenaRef.current, reducedMotion, () => {
        hitStopUntil.current = performance.now() + HIT_STOP_MS;
      });
    };
    return s;
  }, [localId, isSolo, reducedMotion]);

  // ---- solo setup ---------------------------------------------------------
  useEffect(() => {
    if (!isSolo) return;
    sim.addPlayer({ id: localId, name: playerName, color: playerColor, isHost: true });
    BOT_CONFIGS.forEach((bot, i) => sim.addPlayer({ id: `bot_${i + 1}`, name: bot.name, color: bot.color, isBot: true }));
    sim.startCountdown(0.4);
  }, [isSolo, sim, localId, playerName, playerColor]);

  // Dev-only handle so the headless harness (and you, in the console) can read the
  // authoritative world instead of guessing from pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __slapSim?: SlapSim; __slapNet?: { current: ArenaNet | null } };
    w.__slapSim = sim;
    w.__slapNet = netStatsRef;
    return () => {
      if (w.__slapSim === sim) delete w.__slapSim;
      if (w.__slapNet === netStatsRef) delete w.__slapNet;
    };
  }, [sim]);

  // ---- reveal touch controls on first real touch --------------------------
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setUsesTouch(true);
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        unlockAudio();
        inputRef.current.slap = true;
      } else if (e.key === 'Shift') {
        e.preventDefault();
        unlockAudio();
        inputRef.current.dash = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    const reset = () => {
      keysRef.current = {};
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);

  // ---- multiplayer --------------------------------------------------------
  useEffect(() => {
    if (isSolo) return;
    if (!getSupabase()) {
      setFatal('Mode online butuh server permainan. Supabase belum dikonfigurasi untuk build ini.');
      return;
    }

    let cancelled = false;
    let sub: ReturnType<typeof subscribeToMatch> | null = null;
    let net: ArenaNet | null = null;

    const applySync = (sync: MatchSyncData) => {
      if (cancelled) return;
      matchIdRef.current = sync.match.id;
      const me = sync.players.find((p) => p.session_id === localId);
      const host = !!me?.is_host;
      setIsHost(host);
      sim.authoritative = host;

      if (sync.match.status === 'abandoned') {
        const reason = sync.match.game_state?.abandonedReason;
        setDisconnected(typeof reason === 'string' ? reason : 'Lawan meninggalkan arena.');
        return;
      }

      const seen = new Set<string>();
      for (const row of sync.players) {
        seen.add(row.session_id);
        const existing = sim.players[row.session_id];
        if (!existing) {
          sim.addPlayer({
            id: row.session_id,
            name: row.name,
            color: row.session_id === localId ? playerColor : '#ff8c66',
            isHost: row.is_host,
          });
        } else {
          existing.name = row.name;
        }
      }
      for (const id of sim.listIds()) if (!seen.has(id)) sim.removePlayer(id);

      const roster = Object.keys(sim.players).length;
      setHud((prev) => ({ ...prev, peers: roster, needed: 2 }));

      if (host && roster >= 2 && sim.state.phase === 'WAITING') {
        void startOnlineMatch(sync.match.id).catch((err) => console.warn('[slap-arena] gagal memulai match', err));
        sim.startCountdown(0.6);
      }
      if (roster < 2 && sim.state.phase !== 'WAITING') {
        setDisconnected('Menunggu brawler lain kembali ke pulau.');
      }
    };

    (async () => {
      try {
        await joinOnlineRoom({ roomCode: roomCode!, playerName });
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : 'Gagal bergabung ke room.');
        return;
      }
      if (cancelled) return;

      sub = subscribeToMatch(
        roomCode!,
        applySync,
        undefined,
        (payload: { playerName?: string }) => {
          setDisconnected(`${payload?.playerName ?? 'Lawan'} keluar dari arena.`);
        },
        {
          presence: {
            onChange: () => {
              const channel = sub?.channel;
              if (!channel || !sim.authoritative) return;
              const state = channel.presenceState<{ id?: string }>();
              const online = new Set<string>();
              for (const entries of Object.values(state)) {
                for (const entry of entries) {
                  const id = (entry as { id?: string }).id;
                  if (id) online.add(id);
                }
              }
              if (online.size === 0) return;
              setHud((prev) => ({ ...prev, peers: online.size }));
              for (const id of Object.keys(sim.players)) {
                if (online.has(id)) continue;
                const gone = sim.players[id];
                setNotice(`${gone?.name ?? 'Seorang brawler'} terputus dari pertandingan.`);
                sim.removePlayer(id);
              }
            },
          },
          onStatus: (status) => {
            if (cancelled) return;
            const channel = sub?.channel;
            if (status === 'SUBSCRIBED' && channel) {
              void channel.track({ id: localId, name: playerName });
              net = new ArenaNet({
                channel,
                isHost: () => sim.authoritative,
                localId,
                playerName,
                playerColor,
                getInput: () => inputRef.current,
                getSnapshot: () => sim.snapshot(),
                drainFx: () => {
                  const batch = fxQueue.current;
                  fxQueue.current = [];
                  return batch;
                },
                onInput: (msg: InputMessage) => {
                  const p = sim.players[msg.id] ?? sim.addPlayer({ id: msg.id, name: msg.name });
                  p.name = msg.name;
                  sim.setColor(msg.id, msg.color);
                  sim.setInput(msg.id, { x: msg.x, z: msg.z, slap: msg.slap, dash: msg.dash });
                },
                onSnapshot: (snap) => {
                  if (!sim.players[localId]) sim.addPlayer({ id: localId, name: playerName, color: playerColor });
                  sim.applySnapshot(snap);
                  setHud((prev) => ({ ...prev, peers: snap.players.length }));
                },
                onFx: (events) =>
                  events.forEach((ev) =>
                    handleSimEvent(ev, sim, arenaRef.current, reducedMotion, () => {
                      hitStopUntil.current = performance.now() + HIT_STOP_MS;
                    })
                  ),
              });
              net.start();
              netStatsRef.current = net;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setDisconnected('Koneksi realtime terputus. Muat ulang halaman untuk masuk lagi.');
            }
          },
        }
      );
    })();

    return () => {
      cancelled = true;
      net?.stop();
      sub?.unsubscribe();
    };
  }, [isSolo, roomCode, playerName, playerColor, localId, sim, reducedMotion]);

  // ---- simulation loop ----------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - prev) / 1000;
      prev = now;

      const k = keysRef.current;
      let x = 0;
      let z = 0;
      if (k['w'] || k['arrowup']) z -= 1;
      if (k['s'] || k['arrowdown']) z += 1;
      if (k['a'] || k['arrowleft']) x -= 1;
      if (k['d'] || k['arrowright']) x += 1;
      if (stickRef.current.x || stickRef.current.y) {
        x = stickRef.current.x;
        z = stickRef.current.y;
      }

      // The same object feeds the sim and the network sender, so what the host
      // receives is exactly what this client acted on.
      inputRef.current.x = x;
      inputRef.current.z = z;

      if (now >= hitStopUntil.current) {
        sim.setInput(localId, inputRef.current);
        sim.step(dt);
      }
      inputRef.current.slap = false;
      inputRef.current.dash = false;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, localId]);

  // ---- HUD tick (React only re-renders 10x per second, never per frame) ---
  useEffect(() => {
    const id = window.setInterval(() => {
      const { state } = sim;
      const me = state.players[localId];
      setHud((prev) => ({
        ...prev,
        round: state.round,
        phase: state.phase,
        countdown: Math.max(0, Math.ceil(state.countdown)),
        scoreToWin: state.scoreToWin,
        winnerId: state.winnerId,
        matchWinnerId: state.matchWinnerId,
        localId,
        roomCode,
        players: Object.values(state.players).map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          out: p.isFalling || p.eliminated,
          isBot: p.isBot,
        })),
        slapCd: me?.slapCooldown ?? 0,
        dashCd: me?.dashCooldown ?? 0,
      }));

      if (state.phase === 'COUNTDOWN') {
        const tick = Math.ceil(state.countdown);
        if (tick !== lastCount.current && tick > 0 && tick <= 3) {
          lastCount.current = tick;
          playCountTick(tick === 1);
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [sim, localId, roomCode]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(t);
  }, [notice]);

  // ---- round flow ---------------------------------------------------------
  const advance = useCallback(() => {
    if (sim.authoritative) sim.nextRound();
  }, [sim]);

  useEffect(() => {
    if (hud.phase !== 'ROUND_OVER' || disconnected || fatal || (!isHost && !isSolo)) return;
    const t = window.setTimeout(advance, AUTO_NEXT_ROUND_MS);
    return () => clearTimeout(t);
  }, [hud.phase, hud.round, disconnected, fatal, isHost, isSolo, advance]);

  const exitToLobby = useCallback(async () => {
    if (!isSolo && matchIdRef.current && roomCode) {
      try {
        await leaveOnlineMatch({
          matchId: matchIdRef.current,
          roomCode,
          playerIndex: isHost ? 0 : 1,
          playerName,
        });
      } catch (err) {
        console.warn('[slap-arena] gagal mengirim kabar keluar', err);
      }
    }
    navigate('/slap-arena');
  }, [isSolo, roomCode, isHost, playerName, navigate]);

  const playAgain = useCallback(() => {
    if (!sim.authoritative) return;
    for (const p of Object.values(sim.players)) p.score = 0;
    sim.state.round = 1;
    sim.state.matchWinnerId = null;
    sim.startCountdown(0.5);
  }, [sim]);

  const winner = hud.winnerId ? hud.players.find((p) => p.id === hud.winnerId) : null;
  const me = hud.players.find((p) => p.id === localId);
  const canControlRound = isSolo || isHost;
  const roundOver = hud.phase === 'ROUND_OVER' && !disconnected && !fatal;
  const matchOver = hud.phase === 'MATCH_OVER' && !disconnected && !fatal;
  const spectating = !!me?.out && hud.phase === 'BATTLE';

  return (
    <div className="sa sa-root" data-testid="slap-arena-match">
      {!fatal && <Arena3D ref={arenaRef} sim={sim} localId={localId} reducedMotion={reducedMotion} onError={setFatal} />}

      {!fatal && (
        <Hud
          hud={hud}
          muted={muted}
          onToggleMute={toggleMute}
          onExit={exitToLobby}
          showKeys={!usesTouch}
          slapCd={hud.slapCd}
          dashCd={hud.dashCd}
        />
      )}

      {!fatal && usesTouch && hud.phase === 'BATTLE' && (
        <TouchControls
          sim={sim}
          localId={localId}
          onMove={(x, y) => {
            stickRef.current = { x, y };
          }}
          onSlap={() => {
            inputRef.current.slap = true;
          }}
          onDash={() => {
            inputRef.current.dash = true;
          }}
        />
      )}

      {notice && !fatal && !disconnected && (
        <div className="sa-float sa-float--top" data-testid="slap-notice" role="status">
          {notice}
        </div>
      )}

      {spectating && !fatal && (
        <div className="sa-float sa-float--spectate" data-testid="slap-spectating" role="status">
          Kamu tercebur. Ronde selesai saat hanya satu brawler yang masih berdiri.
        </div>
      )}

      {fatal && (
        <ArenaModal
          testId="slap-fatal"
          tone="bad"
          title="Arena tidak bisa dibuka"
          body={fatal}
          actions={[{ label: 'Kembali ke lobby', onClick: () => navigate('/slap-arena'), variant: 'primary' }]}
        />
      )}

      {disconnected && !fatal && (
        <ArenaModal
          testId="slap-disconnected"
          tone="bad"
          title="Pertandingan berhenti"
          body={disconnected}
          actions={[{ label: 'Kembali ke lobby', onClick: exitToLobby, variant: 'primary' }]}
        />
      )}

      {roundOver && (
        <ArenaModal
          testId="slap-round-over"
          title="Ronde selesai"
          body={
            winner
              ? `${winner.name} merebut ronde ${hud.round}. Ronde berikutnya mulai otomatis.`
              : 'Semua brawler jatuh bersamaan.'
          }
          actions={
            canControlRound
              ? [
                  { label: 'Ronde berikutnya', onClick: advance, variant: 'primary' },
                  { label: 'Keluar ke lobby', onClick: exitToLobby, variant: 'ghost' },
                ]
              : [{ label: 'Menunggu tuan rumah...', onClick: () => {}, disabled: true }]
          }
        />
      )}

      {matchOver && (
        <ArenaModal
          testId="slap-match-over"
          title={hud.matchWinnerId === localId ? 'Kamu juara pulau!' : 'Pertandingan selesai'}
          body={winner ? `${winner.name} menutup dengan ${winner.score} poin.` : 'Tidak ada juara ronde ini.'}
          actions={[
            { label: 'Main lagi', onClick: playAgain, variant: 'primary' },
            { label: 'Keluar ke lobby', onClick: exitToLobby, variant: 'ghost' },
          ]}
        />
      )}
    </div>
  );
};

function handleSimEvent(
  event: SimEvent,
  sim: SlapSim,
  arena: Arena3DHandle | null,
  reducedMotion: boolean,
  onImpact: () => void
): void {
  switch (event.kind) {
    case 'slap':
      playSlapSound();
      break;
    case 'hit': {
      const victim = sim.players[event.victimId];
      if (victim) victim.bump = 1;
      playKnockbackSound();
      arena?.impact(event.x, event.z, '#ffcf5c', 1, pickComic());
      if (!reducedMotion) onImpact();
      break;
    }
    case 'dash':
      playDashSound();
      break;
    case 'ko':
      playFallSound();
      arena?.koBurst(event.x, event.z, sim.players[event.playerId]?.color ?? '#ff5d5d');
      break;
    case 'roundEnd':
      if (event.matchOver) {
        playMatchWinSound();
        arena?.confetti();
      } else {
        playRoundWinSound();
      }
      break;
    case 'roundStart':
      break;
  }
}
