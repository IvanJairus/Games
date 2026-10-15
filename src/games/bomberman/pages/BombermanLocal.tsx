import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { BombermanSim } from '../engine/sim';
import { BombermanBot, BOMBER_BOT_LEVELS, BotLevel, describeBombermanBot } from '../engine/ai';
import { Facing, SCORE_TO_WIN, boardFor } from '../engine/types';
import { CHARACTERS, CHAR_IDS, characterById } from '../sprites';
import { createFpsController, fxGates, levelAtMount, readFxMode, writeFxMode, FxLevel } from '../engine/fxMode';
import { Arena, ArenaHandle } from '../components/Arena';
import { Hud, StatusLine } from '../components/Hud';
import { TouchPad } from '../components/TouchPad';
import { ResultDialog } from '../../common/ResultDialog';
import { useMuted } from '../../common/SoundToggle';
import { playBombDrop, playExplosion, playKo, playPowerup, unlockAudio } from '../../common/audio';
import { buzzThud } from '../../common/haptics';
import { generateSeed } from '../engine/rng';

const KEYS: Record<string, Facing> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

interface Setup {
  level: BotLevel;
  seats: number;
  charId: string;
}

export function BombermanLocal() {
  const [params] = useSearchParams();
  const levelParam = (params.get('bot') ?? 'sedang') as BotLevel;
  const [setup, setSetup] = useState<Setup>({
    level: BOMBER_BOT_LEVELS.some((l) => l.id === levelParam) ? levelParam : 'sedang',
    seats: params.get('seats') === '4' ? 4 : 2,
    charId: CHAR_IDS.includes(params.get('char') ?? '') ? (params.get('char') as string) : 'robo',
  });
  const [sim, setSim] = useState<BombermanSim | null>(null);
  const [fxMode, setFxMode] = useState(readFxMode);
  const [fxLevel, setFxLevel] = useState<FxLevel>(() => levelAtMount(readFxMode()));
  const [muted, toggleMuted] = useMuted();
  const [usesTouch, setUsesTouch] = useState(false);
  const [banner, setBanner] = useState<{ text: string; sub: string } | null>(null);
  const [status, setStatus] = useState('');
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const arenaRef = useRef<ArenaHandle | null>(null);
  const keysRef = useRef<Set<Facing>>(new Set());
  const touchRef = useRef<Facing | null>(null);
  const gates = useMemo(() => fxGates(fxLevel), [fxLevel]);
  const gatesRef = useRef(gates);
  gatesRef.current = gates;

  useEffect(() => {
    const onFirstPress = (e: Event): void => {
      if ((e as PointerEvent).pointerType === 'touch') setUsesTouch(true);
      unlockAudio();
    };
    window.addEventListener('pointerdown', onFirstPress, { capture: true });
    return () => window.removeEventListener('pointerdown', onFirstPress, { capture: true });
  }, []);

  const start = useCallback((cfg: Setup): void => {
    const board = boardFor(cfg.seats);
    const players = [{ seat: 0, name: 'Kamu', charId: cfg.charId, bot: false }];
    const roster = cfg.seats >= 4 ? 3 : 1;
    for (let i = 0; i < roster; i++) {
      players.push({
        seat: i + 1,
        name: `Bot ${i + 1}`,
        charId: CHAR_IDS[(i + 1 + cfg.charId.length) % CHAR_IDS.length],
        bot: true,
      });
    }
    setSim(
      new BombermanSim({
        players,
        seats: board.seats,
        seed: generateSeed(),
        rand: Math.random,
      }),
    );
    setBanner(null);
  }, []);

  /* ---------- keyboard ---------- */
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
        if (!e.repeat) {
          const result = sim?.place(0);
          if (result?.ok) playBombDrop();
        }
      }
    };
    const up = (e: KeyboardEvent): void => {
      const dir = KEYS[e.code];
      if (dir) keysRef.current.delete(dir);
    };
    /* A blur eats the keyup, and an orphaned hold would keep walking on its own. */
    const blur = (): void => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [sim]);

  /* ---------- the loop ---------- */
  useEffect(() => {
    if (!sim) return;
    const brains = sim.state.players.filter((p) => p.bot).map((p) => new BombermanBot(p.seat, setup.level));
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let clock = 0;
    const fps = createFpsController(fxMode, levelAtMount(fxMode), setFxLevel);

    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frames += 1;
      clock += dt;
      if (clock >= 1) {
        fps.sample(frames);
        frames = 0;
        clock = 0;
      }

      const held = touchRef.current ?? Array.from(keysRef.current).pop() ?? null;
      sim.setInput(0, { dir: held, bomb: false, seq: 0 });
      for (const brain of brains) sim.setInput(brain.seat, brain.update(sim.state, dt));
      sim.step(dt);
      const all = sim.drainEvents();

      for (const e of all) {
        if (e.t === 'boom') {
          playExplosion();
          if (gatesRef.current.shake) buzzThud();
        }
        if (e.t === 'take') playPowerup();
        if (e.t === 'ko') playKo();
        if (e.t === 'countdown') setBanner({ text: String(e.value), sub: 'Bersiap' });
        if (e.t === 'start') setBanner(null);
        if (e.t === 'round') {
          setBanner({
            text: e.winner === null ? 'Seri' : `${sim.state.players.find((p) => p.seat === e.winner)?.name ?? ''} menang ronde`,
            sub: `Ronde ${e.round} selesai`,
          });
        }
      }

      arenaRef.current?.draw(sim.state, all);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, setup.level, fxMode]);

  /* ---------- HUD text at 10 Hz, never per frame ---------- */
  useEffect(() => {
    if (!sim) return;
    const write = (): void => {
      const me = sim.state.players[0];
      if (sim.state.phase === 'finished') {
        setStatus(
          sim.state.winner === 0
            ? 'Kamu juara. Tekan Main lagi untuk rematch.'
            : `${sim.state.players.find((p) => p.seat === sim.state.winner)?.name ?? 'Bot'} juara.`,
        );
      } else if (!me?.alive) {
        setStatus('Kamu KO. Menunggu ronde berikutnya.');
      } else {
        setStatus(
          `Bom ${sim.state.bombs.filter((b) => b.seat === 0).length}/${me.maxBombs} \u00b7 jangkauan ${me.range} \u00b7 ` +
            `kecepatan ${me.speed.toFixed(1)} \u00b7 ronde ${sim.state.round}/${sim.state.scoreToWin}`,
        );
      }
    };
    write();
    const id = window.setInterval(write, 100);
    return () => window.clearInterval(id);
  }, [sim]);

  if (!sim) {
    return (
      <div className="bm-page bm-setup" data-testid="bomberman-setup">
        <Link className="bm-back bm-back--page" to="/bomberman">
          &larr; /games/bomberman
        </Link>
        <h2>Latihan melawan bot</h2>
        <p className="bm-lede">
          Papan {setup.seats >= 4 ? '15 x 11 untuk empat kursi' : '11 x 9 untuk dua kursi'}. Menang{' '}
          {SCORE_TO_WIN} ronde untuk jadi juara.
        </p>

        <fieldset className="bm-pick">
          <legend>Karakter</legend>
          <div className="bm-pick__row">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={setup.charId === c.id}
                onClick={() => setSetup({ ...setup, charId: c.id })}
                data-testid={`bomberman-char-${c.id}`}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSetup({ ...setup, charId: CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)] })}
              data-testid="bomberman-char-random"
            >
              Acak
            </button>
          </div>
          <p className="bm-note">{characterById(setup.charId).blurb}</p>
        </fieldset>

        <fieldset className="bm-pick">
          <legend>Lawan</legend>
          <div className="bm-pick__row">
            {BOMBER_BOT_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={setup.level === l.id}
                onClick={() => setSetup({ ...setup, level: l.id })}
                data-testid={`bomberman-level-${l.id}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="bm-note">{describeBombermanBot(setup.level)}</p>
        </fieldset>

        <fieldset className="bm-pick">
          <legend>Kursi</legend>
          <div className="bm-pick__row">
            {[2, 4].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={setup.seats === n}
                onClick={() => setSetup({ ...setup, seats: n })}
                data-testid={`bomberman-seats-${n}`}
              >
                {n} pemain
              </button>
            ))}
          </div>
        </fieldset>

        <button className="bm-go" type="button" onClick={() => start(setup)} data-testid="bomberman-start">
          Mulai
        </button>
      </div>
    );
  }

  const finished = sim.state.phase === 'finished';

  return (
    <div className="bm-root" data-testid="bomberman-match">
      <Hud
        state={sim.state}
        mySeat={0}
        modeLabel={`Solo ${sim.state.seats} kursi`}
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
        onExit={() => setSim(null)}
      />

      <div className="bm-stage">
        <Arena
          ref={arenaRef}
          cols={sim.state.cols}
          rows={sim.state.rows}
          floor={sim.state.floor}
          gates={gates}
          reducedMotion={reducedMotion}
        >
          {banner && (
            <div className="bm-banner">
              <div className="bm-banner__box">
                <b>{banner.text}</b>
                <span>{banner.sub}</span>
              </div>
            </div>
          )}
        </Arena>
        {usesTouch && <TouchPad dirRef={touchRef} onBomb={() => sim.place(0)} disabled={finished} />}
      </div>

      <StatusLine text={status} />

      {finished && (
        <ResultDialog
          isOpen
          testId="bomberman-result"
          titleId="bomberman-result-title"
          title={sim.state.winner === 0 ? 'Kamu menang' : 'Kamu kalah'}
          kicker={`${sim.state.round} ronde dimainkan`}
          tone={sim.state.winner === 0 ? 'win' : 'lose'}
          chip={characterById(sim.state.players[0].charId).label}
          stats={[
            { label: 'Bom ditanam', value: sim.state.players[0].bombsPlaced, accent: true },
            { label: 'Lantai dibongkar', value: sim.state.players[0].blocksBroken },
            { label: 'Ronde dimenangkan', value: sim.state.players[0].wins },
          ]}
          actions={[
            { label: 'Main lagi', tone: 'primary', onClick: () => start(setup), testId: 'bomberman-again' },
            { label: 'Ganti karakter', tone: 'secondary', onClick: () => setSim(null), testId: 'bomberman-setup-again' },
          ]}
          links={[{ label: 'Kembali ke lobby', to: '/bomberman' }]}
          onDismiss={() => setSim(null)}
        />
      )}
    </div>
  );
}
