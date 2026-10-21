import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  type MatchSyncData,
  describeMoveFailure,
  finishOnlineMatch,
  joinOnlineRoom,
  leaveOnlineMatch,
  startOnlineMatch,
  subscribeToMatch,
} from '../../common/multiplayer';
import { getStoredPlayerName, isSupabaseConfigured, setStoredPlayerName } from '../../../lib/supabase';
import { activeTransport, getOrCreateDoorId, mintRoomTicket, roomsBaseUrl, socketUrl } from '../../../lib/transport';
import { ResultDialog } from '../../common/ResultDialog';
import { useMuted } from '../../common/SoundToggle';
import { playBombDrop, playExplosion, playKo, playPowerup, unlockAudio } from '../../common/audio';
import { buzzThud } from '../../common/haptics';

import { BombermanSim } from '../engine/sim';
import { smooth } from '../engine/smooth';
import { BombermanBot } from '../engine/ai';
import { BombermanNet, type WorldPayload } from '../engine/net';
import { MovementPredictor } from '../engine/predict';
import {
  BombermanServerNet,
  parseDoorConfig,
  type DoorConfig,
  type DoorWelcome,
} from '../engine/serverNet';
import { CHAR_IDS, characterById, spriteMarkup } from '../sprites';
import { readCharId } from '../charPreference';
import { type BoardSize, type Facing, type FloorKind, type InputState, type SimEvent, boardFor, sizeForBoard } from '../engine/types';
import { createFpsController, fxGates, levelAtMount, readFxMode, writeFxMode, type FxLevel } from '../engine/fxMode';
import { Arena, type ArenaHandle } from '../components/Arena';
import { Hud, StatusLine } from '../components/Hud';
import { DirectionPad } from '../components/DirectionPad';
import { KEYS } from './keyMap';

interface SeatInfo {
  seat: number;
  name: string;
  charId: string;
  bot: boolean;
}

interface RoomConfig {
  gameType: 'bomberman';
  seed: string;
  floor: FloorKind;
  seats: number;
  size: BoardSize;
  roster: SeatInfo[];
}

const FLOORS: FloorKind[] = ['grass', 'sand', 'stone'];
const pickChar = (i: number): string => CHAR_IDS[i % CHAR_IDS.length];
const readSize = (raw: unknown): BoardSize => (raw === 'besar' ? 'besar' : 'kecil');

const readConfig = (raw: unknown): RoomConfig | null => {
  const c = raw as Partial<RoomConfig> | null;
  if (!c || typeof c.seed !== 'string' || !Array.isArray(c.roster) || c.roster.length === 0) return null;
  return {
    gameType: 'bomberman',
    seed: c.seed,
    floor: c.floor ?? 'grass',
    seats: c.seats ?? c.roster.length,
    size: readSize(c.size),
    roster: c.roster,
  };
};

function playEvent(e: SimEvent, shake: boolean): void {
  if (e.t === 'boom') {
    playExplosion();
    if (shake) buzzThud();
  }
  if (e.t === 'take') playPowerup();
  if (e.t === 'ko') playKo();
}

const samePlayers = (a: { id: string; name: string; seat?: number }[], b: { id: string; name: string; seat?: number }[]): boolean =>
  a.length === b.length && a.every((p, i) => p.id === b[i].id && p.name === b[i].name && p.seat === b[i].seat);

export function BombermanMatch() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  /* A door room is created by the first ticket mint. The invite URL carries the board the
     lobby chose; a guest joining with only a code lets the Durable Object's stored config
     decide. Sending a default here would fight the stored value and be rejected. */
  const urlSeats: 2 | 4 = params.get('seats') === '2' ? 2 : 4;
  const urlSize: BoardSize = params.get('size') === 'besar' ? 'besar' : 'kecil';
  const doorMode = useRef(activeTransport() === 'cloudflare' && !!code).current;
  const doorId = useRef(doorMode ? getOrCreateDoorId() : '').current;
  const mintOptions = useRef<{ seats?: 2 | 4; size?: BoardSize }>({
    ...(params.get('seats') ? { seats: urlSeats } : {}),
    ...(params.get('size') ? { size: urlSize } : {}),
  }).current;
  const [sync, setSync] = useState<MatchSyncData | null>(null);
  const [phase, setPhase] = useState<'joining' | 'waiting' | 'playing' | 'gone'>('joining');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fillBots, setFillBots] = useState(true);
  const [fxMode, setFxMode] = useState(readFxMode);
  const [fxLevel, setFxLevel] = useState<FxLevel>(() => levelAtMount(readFxMode()));
  const [muted, toggleMuted] = useMuted();
  const [usesTouch, setUsesTouch] = useState(false);
  const [status, setStatus] = useState('Menyambungkan room...');
  const [banner, setBanner] = useState<{ text: string; sub: string } | null>(null);
  const [result, setResult] = useState<{ winner: number | null } | null>(null);
  const [doorSeat, setDoorSeat] = useState(-1);
  const [doorMaster, setDoorMaster] = useState(false);
  const [doorPlayers, setDoorPlayers] = useState<{ id: string; name: string; seat?: number }[]>([]);
  const [doorConfig, setDoorConfig] = useState<DoorConfig>({ seats: urlSeats, size: urlSize });

  const arenaRef = useRef<ArenaHandle | null>(null);
  const simRef = useRef<BombermanSim | null>(null);
  const netRef = useRef<BombermanNet | null>(null);
  const doorRef = useRef<BombermanServerNet | null>(null);
  const doorPlayerIdRef = useRef('');
  const predictorRef = useRef(new MovementPredictor());
  const lastPredictDirRef = useRef<Facing | null>(null);
  const lastPredictRoundRef = useRef(-1);
  const lastWorldPhaseRef = useRef('');
  const isHostRef = useRef(false);
  const mySeatRef = useRef(-1);
  const keysRef = useRef<Set<Facing>>(new Set());
  const touchRef = useRef<Facing | null>(null);
  const inputRef = useRef<InputState>({ dir: null, bomb: false, seq: 0 });
  const pressRef = useRef(0);
  const joinedRef = useRef(false);
  const wroteResultRef = useRef(false);
  /* Bot memory lives per seed: a rematch draws a new map, so a bot must not carry an
     escape target from the previous match into the next one. */
  const brainRef = useRef(new Map<string, BombermanBot>());
  /* Which character each seat asked for. Every tab knows its own pick, and only the host
     owns the roster, so guests hand theirs over as one broadcast claim. */
  const claimsRef = useRef(new Map<number, string>());
  const myCharRef = useRef(readCharId());
  const hostBrain = useCallback((seat: number, seed: string): BombermanBot => {
    const key = `${seed}:${seat}`;
    let brain = brainRef.current.get(key);
    if (!brain) {
      brain = new BombermanBot(seat, 'sedang');
      brainRef.current.set(key, brain);
    }
    return brain;
  }, []);

  const gates = useMemo(() => fxGates(fxLevel), [fxLevel]);
  const gatesRef = useRef(gates);
  gatesRef.current = gates;

  const isHost = doorMode ? doorMaster : !!sync?.isHost;
  const mySeat = doorMode ? doorSeat : sync?.myPlayerIndex ?? -1;
  isHostRef.current = isHost;
  mySeatRef.current = mySeat;

  useEffect(() => {
    const onFirstPress = (e: Event): void => {
      if ((e as PointerEvent).pointerType === 'touch') setUsesTouch(true);
      unlockAudio();
    };
    window.addEventListener('pointerdown', onFirstPress, { capture: true });
    return () => window.removeEventListener('pointerdown', onFirstPress, { capture: true });
  }, []);

  const makeSim = useCallback((cfg: RoomConfig): BombermanSim => {
    const board = boardFor(cfg.seats, cfg.size);
    return new BombermanSim({
      seats: board.seats,
      size: cfg.size,
      seed: cfg.seed,
      floor: cfg.floor,
      players: cfg.roster.map((r) => ({ seat: r.seat, name: r.name, charId: r.charId, bot: r.bot })),
    });
  }, []);

  /** Seats that are not taken by a human, so the host can drive them. */
  const buildRoster = useCallback((data: MatchSyncData): SeatInfo[] => {
    const board = boardFor(data.match.max_players);
    const taken = new Map(data.players.map((p) => [p.player_index, p.name]));
    const roster: SeatInfo[] = [];
    for (let seat = 0; seat < board.seats; seat++) {
      const name = taken.get(seat);
      const charId = claimsRef.current.get(seat) ?? pickChar(name ? seat : seat + 2);
      if (name) roster.push({ seat, name, charId, bot: false });
      else if (fillBots) roster.push({ seat, name: `Bot ${seat + 1}`, charId, bot: true });
    }
    return roster;
  }, [fillBots]);

  const begin = useCallback(async (): Promise<void> => {
    if (doorMode) {
      if (!doorRef.current) return;
      wroteResultRef.current = false;
      setResult(null);
      setError('');
      // The match row is still the history/lifecycle row, even though the world is in the
      // Worker. Move it to `playing` so `finishOnlineMatch` is allowed to close it; the row
      // is best-effort and a door match keeps running when Supabase is absent.
      if (sync?.match.id && sync.match.status !== 'playing') {
        void startOnlineMatch(sync.match.id, undefined, ['waiting', 'completed', 'abandoned']);
      }
      // The server generates the seed and floor; this payload only carries the lobby choice.
      doorRef.current.sendStart(fillBots);
      return;
    }
    const data = sync;
    if (!data?.isHost) return;
    const roster = buildRoster(data);
    const cfg: RoomConfig = {
      gameType: 'bomberman',
      seed: Math.random().toString(36).slice(2, 14),
      floor: FLOORS[Math.floor(Math.random() * FLOORS.length)],
      seats: boardFor(data.match.max_players).seats,
      size: readSize((data.match.game_state as { size?: unknown } | null)?.size),
      roster,
    };
    simRef.current = makeSim(cfg);
    wroteResultRef.current = false;
    setResult(null);
    const res = await startOnlineMatch(data.match.id, cfg, ['waiting', 'completed', 'abandoned']);
    if (!res.ok) setError(describeMoveFailure(res));
  }, [sync, buildRoster, makeSim, doorMode, fillBots]);

  /**
   * The room row can arrive after the master already pressed start from the Worker lobby.
   * Close that gap once: the Worker owns the match, but the history row still needs the
   * `waiting -> playing` transition before a result can be written.
   */
  useEffect(() => {
    if (!doorMode || !doorMaster || phase !== 'playing') return;
    if (!sync?.match.id || sync.match.status !== 'waiting') return;
    void startOnlineMatch(sync.match.id, undefined, ['waiting']);
  }, [doorMode, doorMaster, phase, sync?.match.id, sync?.match.status]);

  /* ---------- join, then one subscription that also carries the realtime channel ---------- */
  useEffect(() => {
    if (joinedRef.current) return;
    if (!isSupabaseConfigured()) {
      // The Worker door carries the whole match on its own. Supabase still supplies the room
      // row and the result history when it is configured, but it is not a prerequisite here.
      if (doorMode) return;
      setError('Server main belum dikonfigurasi di build ini. Mode solo tetap bisa dimainkan.');
      setPhase('gone');
      return;
    }
    joinedRef.current = true;
    const name = getStoredPlayerName() || `Pemain ${Math.floor(Math.random() * 900 + 100)}`;
    setStoredPlayerName(name);

    let cancelled = false;
    let sub: ReturnType<typeof subscribeToMatch> | null = null;
    let net: BombermanNet | null = null;

    const applySync = (data: MatchSyncData): void => {
      if (cancelled) return;
      setSync(data);
      // In door mode this subscription exists for the room row and the result write only.
      // The world, the roster, and the master all come from the Durable Object.
      if (doorMode) return;
      isHostRef.current = !!data.isHost;
      mySeatRef.current = data.myPlayerIndex;
      if (data.isHost) claimsRef.current.set(data.myPlayerIndex, myCharRef.current);

      if (data.match.status === 'abandoned') {
        setPhase('gone');
        setNotice('Salah satu pemain meninggalkan room. Buat room baru di lobby.');
        return;
      }
      if (data.match.status !== 'playing') {
        setPhase(data.match.status === 'completed' ? 'playing' : 'waiting');
        return;
      }
      const cfg = readConfig(data.match.game_state);
      if (!cfg) return;
      setPhase('playing');
      if (!simRef.current) simRef.current = makeSim(cfg);
    };

    void joinOnlineRoom({ roomCode: code, playerName: name })
      .catch((err: unknown) => {
        // A door room does not need a Supabase match row. The join is best-effort there,
        // because the ticket and the world both live in the Durable Object.
        if (cancelled || doorMode) return;
        setError(err instanceof Error ? err.message : 'Room tidak ditemukan.');
        setPhase('gone');
      });

    sub = subscribeToMatch(code, applySync, undefined, undefined, (state) => {
      if (doorMode) return;
      setNotice(state === 'realtime' ? '' : 'Jaringan lambat. Gerakan bisa patah sementara.');
    }, {
      onStatus: (status2) => {
        if (cancelled || doorMode) return;
        const channel = sub?.channel;
        if (status2 === 'SUBSCRIBED' && channel && !net) {
          net = new BombermanNet({
            channel,
            isHost: () => isHostRef.current,
            localSeat: () => mySeatRef.current,
            getInput: () => inputRef.current,
            getWorld: (): WorldPayload => {
              const sim = simRef.current;
              return { t: performance.now(), state: sim ? sim.snapshot() : (null as never), fx: sim ? sim.drainEvents() : [] };
            },
            onInput: (seat, input) => simRef.current?.setInput(seat, input),
            getCharClaim: () =>
              mySeatRef.current >= 0 ? { seat: mySeatRef.current, charId: myCharRef.current } : null,
            onChar: (seat, charId) => {
              if (!CHAR_IDS.includes(charId)) return;
              const sim = simRef.current;
              if (sim && seat >= sim.state.seats) return;
              claimsRef.current.set(seat, charId);
              const p = sim?.state.players.find((q) => q.seat === seat && !q.bot);
              if (p) p.charId = charId;
            },
            onWorld: (world) => {
              if (!world.state) return;
              /* A frame can arrive before this tab's first room sync, so the sim is built
                 from the world itself rather than from a lifecycle config that may not be
                 readable yet. Reading the config off a world state used to throw here. */
              if (!simRef.current) {
                const st = world.state;
                simRef.current = new BombermanSim({
                  seats: st.seats,
                  size: sizeForBoard(st.seats, st.cols),
                  seed: st.seed,
                  floor: st.floor,
                  players: st.players.map((p) => ({ seat: p.seat, name: p.name, charId: p.charId, bot: p.bot })),
                });
              }
              simRef.current.applySnapshot(world.state);
              for (const e of world.fx) playEvent(e, gatesRef.current.shake);
              if (world.state.phase === 'finished') setResult({ winner: world.state.winner });
            },
            onDrop: (n) => {
              if (n >= 20) setNotice('Koneksi realtime terputus. Muat ulang halaman untuk masuk lagi.');
            },
          });
          net.start();
          netRef.current = net;
        }
      },
    });

    return () => {
      cancelled = true;
      net?.stop();
      sub?.unsubscribe();
    };
  }, [code, makeSim, doorMode]);

  /* ---------- Worker door: one socket, world computed by the Durable Object ---------- */
  useEffect(() => {
    if (!doorMode || !code) return;
    let cancelled = false;
    const base = roomsBaseUrl();
    if (!base) {
      setError('VITE_CF_ROOMS_URL belum diisi, jadi kamar Worker tidak bisa dihubungi.');
      setPhase('gone');
      return;
    }
    const playerName = getStoredPlayerName() || `Pemain ${Math.floor(Math.random() * 900 + 100)}`;
    setStoredPlayerName(playerName);

    /**
     * A guest can open the room before the creator's first mint has stored a board. The
     * Worker then has the default board, and this tab's explicit query would be a conflict.
     * Falling back to the stored board is better than refusing the room; `welcome.config`
     * updates the local board to what the room actually agreed on.
     */
    const mintTicket = async () => {
      try {
        return await mintRoomTicket(code, 'bomberman', playerName, doorId, fetch, mintOptions);
      } catch (err) {
        if (!String(err instanceof Error ? err.message : err).includes('options_conflict')) throw err;
        return mintRoomTicket(code, 'bomberman', playerName, doorId, fetch);
      }
    };

    const openDoor = (wsUrl: string): void => {
      if (cancelled) return;
      const net = new BombermanServerNet({
        wsUrl,
        // Touch and keyboard both write refs; the sender samples this and sends only changes.
        getDir: () => touchRef.current ?? Array.from(keysRef.current).pop() ?? null,
        onWelcome: (info: DoorWelcome) => {
          doorPlayerIdRef.current = info.id;
          predictorRef.current.reset();
          lastPredictDirRef.current = null;
          setDoorSeat(info.seat);
          mySeatRef.current = info.seat;
          setDoorMaster(info.master === info.id);
          setDoorPlayers(info.players);
          const config = parseDoorConfig(info.config);
          if (config) setDoorConfig(config);
          // A reconnect while a match is running must not send this tab back to the lobby.
          setPhase((prev) => (prev === 'playing' ? prev : 'waiting'));
          if (info.seat >= 0) net.sendChar(myCharRef.current);
        },
        onMeta: (meta) => {
          // This fires 20 times a second. Replacing the array every frame would re-render
          // the whole waiting room for data that has not changed.
          setDoorPlayers((prev) => (samePlayers(prev, meta.players) ? prev : meta.players));
          setDoorMaster(meta.master === doorPlayerIdRef.current);
          if (meta.phase === 'lobby') setPhase((prev) => (prev === 'playing' ? prev : 'waiting'));
        },
        onWorld: (world) => {
          let sim = simRef.current;
          if (!sim) {
            /* A guest can receive a world before it has seen a lobby roster. Build the local
               simulation from the frame itself, exactly like the Broadcast client did. */
            sim = new BombermanSim({
              seats: world.seats,
              size: sizeForBoard(world.seats, world.cols),
              seed: world.seed,
              floor: world.floor,
              players: world.players.map((p) => ({ seat: p.seat, name: p.name, charId: p.charId, bot: p.bot })),
            });
            simRef.current = sim;
          }
          sim.applySnapshot(world);
          // A new round (or a fresh countdown) invalidates a lead from the old board.
          if (world.phase === 'countdown' || world.round !== lastPredictRoundRef.current) {
            predictorRef.current.reset();
            lastPredictDirRef.current = null;
            lastPredictRoundRef.current = world.round;
          }
          if (world.phase !== lastWorldPhaseRef.current) {
            // A direction held through the countdown must be observed again when the fight
            // starts, otherwise the first move of the round gets no prediction at all.
            if (world.phase === 'battle') lastPredictDirRef.current = null;
            lastWorldPhaseRef.current = world.phase;
          }
          setPhase('playing');
          setResult(world.phase === 'finished' ? { winner: world.winner } : null);
        },
        onFx: (events) => {
          for (const e of events) {
            playEvent(e, gatesRef.current.shake);
            if (e.t === 'countdown') setBanner({ text: String(e.value), sub: 'Bersiap' });
            if (e.t === 'start') setBanner(null);
            if (e.t === 'round') {
              const who = simRef.current?.state.players.find((p) => p.seat === e.winner)?.name;
              setBanner({ text: e.winner === null ? 'Seri' : `${who ?? 'Pemain'} menang`, sub: `Ronde ${e.round} selesai` });
            }
          }
        },
        onLink: (state, detail) => {
          if (state === 'up') {
            setNotice('');
            return;
          }
          if (detail === 'retrying') {
            setNotice('Koneksi Worker terputus. Mencoba menyambung lagi...');
            return;
          }
          setNotice(`Koneksi Worker terputus (${detail ?? 'tanpa alasan'}). Muat ulang halaman untuk masuk lagi.`);
        },
        // A ticket points at a seat the Worker releases when the socket closes, so a retry
        // asks for a fresh ticket with the same persisted player id.
        reconnect: async () => {
          const ticket = await mintTicket();
          return socketUrl(base, code, ticket.ticket);
        },
      });
      doorRef.current = net;
      net.start();
    };

    void (async () => {
      const ticket = await mintTicket();
      if (cancelled) return;
      openDoor(socketUrl(base, code, ticket.ticket));
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Tidak bisa masuk kamar Worker.');
      setPhase('gone');
    });

    return () => {
      cancelled = true;
      doorRef.current?.stop();
      doorRef.current = null;
    };
  }, [doorMode, code, doorId, mintOptions]);

  /* ---------- the frame loop ---------- */
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let clock = 0;
    const fps = createFpsController(fxMode, levelAtMount(fxMode), setFxLevel);

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frames += 1;
      clock += dt;
      if (clock >= 1) {
        fps.sample(frames);
        frames = 0;
        clock = 0;
      }
      const sim = simRef.current;
      if (!sim) return;

      const held = touchRef.current ?? Array.from(keysRef.current).pop() ?? null;
      inputRef.current = { dir: held, bomb: false, seq: pressRef.current };

      if (doorMode) {
        // The server owns the clock. This tab only samples the held direction and animates
        // between the 20 Hz frames; sending happens on change, not on every frame.
        doorRef.current?.flush();
        if (held !== lastPredictDirRef.current) {
          lastPredictDirRef.current = held;
          predictorRef.current.observe(sim.state, mySeatRef.current, held, now);
        }
        smooth(sim.state, dt);
        // View-only lead: it writes ax/ay, never the server's x/y. The next snapshot and the
        // correction decay in reconcile() keep it from drifting away from the authority.
        predictorRef.current.reconcile(sim.state, mySeatRef.current, now);
        predictorRef.current.apply(sim.state, mySeatRef.current, now);
        arenaRef.current?.draw(sim.state, []);
        return;
      }

      if (isHostRef.current) {
        for (const p of sim.state.players) {
          if (!p.bot) continue;
          sim.setInput(p.seat, hostBrain(p.seat, sim.state.seed).update(sim.state, dt));
        }
        sim.setInput(mySeatRef.current, inputRef.current);
        sim.step(dt);
        const events = sim.drainEvents();
        for (const e of events) {
          playEvent(e, gatesRef.current.shake);
          if (e.t === 'countdown') setBanner({ text: String(e.value), sub: 'Bersiap' });
          if (e.t === 'start') setBanner(null);
          if (e.t === 'round') {
            setBanner({ text: e.winner === null ? 'Seri' : `${sim.state.players.find((q) => q.seat === e.winner)?.name} menang`, sub: `Ronde ${e.round} selesai` });
          }
        }
        arenaRef.current?.draw(sim.state, events);
      } else {
        smooth(sim.state, dt);
        arenaRef.current?.draw(sim.state, []);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, fxMode, doorMode]);

  /* ---------- host writes the result exactly once ---------- */
  useEffect(() => {
    const sim = simRef.current;
    if (!isHost || !sim || sim.state.phase !== 'finished' || wroteResultRef.current) return;
    const matchId = sync?.match.id;
    if (!matchId) return;
    // Door mode moves the row to `playing` on its own schedule. Writing a result before that
    // transition is refused by the RPC, so wait for it rather than burning the one-shot flag.
    if (sync?.match.status !== 'playing') return;
    wroteResultRef.current = true;
    void finishOnlineMatch({ matchId, winnerIndex: sim.state.winner });
  }, [isHost, sync, result]);

  useEffect(() => {
    return () => {
      const matchId = sync?.match.id;
      if (matchId && sync?.match.status === 'playing') {
        void leaveOnlineMatch({
          matchId,
          playerIndex: mySeatRef.current,
          roomCode: code,
          playerName: getStoredPlayerName(),
        });
      }
    };
  }, [sync, code]);

  const pressBomb = useCallback((): void => {
    if (doorMode) {
      // One press, one message, sent now rather than at the next 50 ms sample.
      doorRef.current?.sendPress();
      return;
    }
    const sim = simRef.current;
    if (!sim) return;
    pressRef.current += 1;
    if (isHostRef.current) {
      if (sim.place(mySeatRef.current).ok) playBombDrop();
    } else {
      netRef.current?.sendPress(mySeatRef.current, inputRef.current.dir, pressRef.current);
    }
  }, [doorMode]);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        keysRef.current.add(dir);
        doorRef.current?.flush();
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) pressBomb();
      }
    };
    const up = (e: KeyboardEvent): void => {
      const dir = KEYS[e.code];
      if (dir) {
        keysRef.current.delete(dir);
        doorRef.current?.flush();
      }
    };
    const blur = (): void => {
      keysRef.current.clear();
      doorRef.current?.flush();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [pressBomb]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (!sim) {
        if (doorMode) {
          setStatus(`${doorPlayers.length}/${doorConfig.seats} kursi terisi`);
        } else {
          setStatus(sync ? `${sync.players.length}/${sync.match.max_players} kursi terisi` : 'Menyambungkan room...');
        }
        return;
      }
      const me = sim.state.players.find((p) => p.seat === mySeatRef.current);
      if (sim.state.phase === 'finished') {
        setStatus(sim.state.winner === mySeatRef.current ? 'Kamu juara room ini.' : `Juara: ${sim.state.players.find((p) => p.seat === sim.state.winner)?.name ?? '-'}`);
      } else if (me && !me.alive) {
        setStatus('Kamu KO. Menunggu ronde berikutnya.');
      } else {
        setStatus(`Ronde ${sim.state.round}/${sim.state.scoreToWin}${isHostRef.current ? ' · kamu tuan rumah' : ''}`);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [sync, isHost, doorMode, doorPlayers.length, doorConfig.seats]);

  const sim = simRef.current;
  const board = doorMode
    ? boardFor(doorConfig.seats, doorConfig.size)
    : boardFor(sync?.match.max_players ?? 2, readSize((sync?.match.game_state as { size?: unknown } | null)?.size));

  if (phase === 'gone' || error) {
    return (
      <div className="bm-page" data-testid="bomberman-match-error">
        <div className="bm-page__inner">
          <h2>Room tidak bisa dilanjutkan</h2>
          <p className="lede">{error || notice}</p>
          <Link className="bm-go" to="/bomberman" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            Kembali ke lobby
          </Link>
        </div>
      </div>
    );
  }

  if (phase !== 'playing' || !sim) {
    const lobbyPlayers = doorMode
      ? doorPlayers.map((p, i) => ({ id: p.id, name: p.name, seat: p.seat ?? i }))
      : (sync?.players ?? []).map((p) => ({ id: p.id, name: p.name, seat: p.player_index }));
    return (
      <div className="bm-page" data-testid="bomberman-waiting">
        <div className="bm-page__inner">
          <Link className="bm-back bm-back--page" to="/bomberman">
            <span aria-hidden="true">&larr;</span> <span className="bm-back__label">Lobby</span>
          </Link>
          <h2>Room {code}</h2>
          <p className="lede">
            {`${lobbyPlayers.length} dari ${board.seats} kursi terisi \u00b7 papan ${board.cols} x ${board.rows}. `}
            {fillBots ? 'Kursi yang belum terisi akan diisi bot.' : 'Kursi kosong dibiarkan kosong.'}
          </p>
          <div className="bm-roster" data-testid="bomberman-roster">
            {lobbyPlayers.map((p) => (
              <span key={p.id} className="bm-chip">
                <span className="bm-dot" style={{ background: '#4dabf7' }} />
                <span className="bm-chip__name">{p.name}</span>
                <b>{p.seat}</b>
              </span>
            ))}
          </div>
          <p className="bm-mychar" data-testid="bomberman-my-char">
            <span
              className="bm-char__art"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: spriteMarkup(myCharRef.current, 'idle', 'down') }}
            />
            <span>{`Karakter kamu: ${characterById(myCharRef.current).label}. Ganti di lobby sebelum masuk room.`}</span>
          </p>
          <p className="bm-row" style={{ marginTop: 12 }}>
            <label>
              <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} /> Isi kursi kosong dengan bot
            </label>
          </p>
          {isHost ? (
            <button className="bm-go" type="button" onClick={() => void begin()} data-testid="bomberman-begin">
              Mulai pertandingan
            </button>
          ) : (
            <p className="bm-note">Menunggu tuan rumah memulai.</p>
          )}
          <p className="bm-error">{notice}</p>
        </div>
      </div>
    );
  }

  const me = sim.state.players.find((p) => p.seat === mySeat);

  return (
    <div className="bm-root" data-testid="bomberman-match">
      <Hud
        state={sim.state}
        mySeat={mySeat}
        modeLabel={`Online ${sim.state.seats} kursi \u00b7 ${sim.state.players.filter((p) => p.bot).length} bot`}
        fxMode={fxMode}
        fxLevel={fxLevel}
        muted={muted}
        onCycleFx={() => {
          const order = ['auto', 'high', 'low'] as const;
          const next = order[(order.indexOf(fxMode) + 1) % order.length];
          setFxMode(next);
          writeFxMode(next);
          setFxLevel(levelAtMount(next));
        }}
        onToggleSound={toggleMuted}
        onExit={() => undefined}
      />
      <div className="bm-stage">
        <Arena ref={arenaRef} cols={sim.state.cols} rows={sim.state.rows} floor={sim.state.floor} gates={gates} reducedMotion={false}>
          {banner && (
            <div className="bm-banner">
              <div className="bm-banner__box">
                <b>{banner.text}</b>
                <span>{banner.sub}</span>
              </div>
            </div>
          )}
        </Arena>
        {usesTouch && <DirectionPad dirRef={touchRef} onBomb={pressBomb} disabled={!!result} />}
      </div>
      <StatusLine text={notice || status} />
      {result && (
        <ResultDialog
          isOpen
          testId="bomberman-result"
          titleId="bomberman-result-online-title"
          title={result.winner === mySeat ? 'Kamu menang' : 'Kamu kalah'}
          kicker={`Room ${code}`}
          tone={result.winner === mySeat ? 'win' : 'lose'}
          chip={characterById(me?.charId ?? 'robo').label}
          stats={[
            { label: 'Ronde', value: sim.state.round, accent: true },
            { label: 'Bom ditanam', value: me?.bombsPlaced ?? 0 },
            { label: 'Lantai dibongkar', value: me?.blocksBroken ?? 0 },
          ]}
          actions={isHost ? [{ label: 'Rematch di room ini', tone: 'primary', onClick: () => void begin(), testId: 'bomberman-rematch' }] : []}
          links={[{ label: 'Kembali ke lobby', to: '/bomberman' }]}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}

