import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

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
import { ResultDialog } from '../../common/ResultDialog';
import { useMuted } from '../../common/SoundToggle';
import { playBombDrop, playExplosion, playKo, playPowerup, unlockAudio } from '../../common/audio';
import { buzzThud } from '../../common/haptics';

import { BombermanSim } from '../engine/sim';
import { smooth } from '../engine/smooth';
import { BombermanBot } from '../engine/ai';
import { BombermanNet, type WorldPayload } from '../engine/net';
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

export function BombermanMatch() {
  const { code = '' } = useParams();
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

  const arenaRef = useRef<ArenaHandle | null>(null);
  const simRef = useRef<BombermanSim | null>(null);
  const netRef = useRef<BombermanNet | null>(null);
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

  const isHost = !!sync?.isHost;
  const mySeat = sync?.myPlayerIndex ?? -1;
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
  }, [sync, buildRoster, makeSim]);

  /* ---------- join, then one subscription that also carries the realtime channel ---------- */
  useEffect(() => {
    if (joinedRef.current) return;
    if (!isSupabaseConfigured()) {
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
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Room tidak ditemukan.');
        setPhase('gone');
      });

    sub = subscribeToMatch(code, applySync, undefined, undefined, (state) => {
      setNotice(state === 'realtime' ? '' : 'Jaringan lambat. Gerakan bisa patah sementara.');
    }, {
      onStatus: (status2) => {
        if (cancelled) return;
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
  }, [code, makeSim]);

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
  }, [phase, fxMode]);

  /* ---------- host writes the result exactly once ---------- */
  useEffect(() => {
    const sim = simRef.current;
    if (!isHost || !sim || sim.state.phase !== 'finished' || wroteResultRef.current) return;
    const matchId = sync?.match.id;
    if (!matchId) return;
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
    const sim = simRef.current;
    if (!sim) return;
    pressRef.current += 1;
    if (isHostRef.current) {
      if (sim.place(mySeatRef.current).ok) playBombDrop();
    } else {
      netRef.current?.sendPress(mySeatRef.current, inputRef.current.dir, pressRef.current);
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        keysRef.current.add(dir);
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) pressBomb();
      }
    };
    const up = (e: KeyboardEvent): void => {
      const dir = KEYS[e.code];
      if (dir) keysRef.current.delete(dir);
    };
    const blur = (): void => keysRef.current.clear();
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
        setStatus(sync ? `${sync.players.length}/${sync.match.max_players} kursi terisi` : 'Menyambungkan room...');
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
  }, [sync, isHost]);

  const sim = simRef.current;
  const board = boardFor(sync?.match.max_players ?? 2, readSize((sync?.match.game_state as { size?: unknown } | null)?.size));

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
    return (
      <div className="bm-page" data-testid="bomberman-waiting">
        <div className="bm-page__inner">
          <Link className="bm-back bm-back--page" to="/bomberman">
            <span aria-hidden="true">&larr;</span> <span className="bm-back__label">Lobby</span>
          </Link>
          <h2>Room {code}</h2>
          <p className="lede">
            {`${sync?.players.length ?? 0} dari ${board.seats} kursi terisi \u00b7 papan ${board.cols} x ${board.rows}. `}
            {fillBots ? 'Kursi yang belum terisi akan diisi bot.' : 'Kursi kosong dibiarkan kosong.'}
          </p>
          <div className="bm-roster" data-testid="bomberman-roster">
            {(sync?.players ?? []).map((p) => (
              <span key={p.id} className="bm-chip">
                <span className="bm-dot" style={{ background: '#4dabf7' }} />
                <span className="bm-chip__name">{p.name}</span>
                <b>{p.player_index}</b>
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

