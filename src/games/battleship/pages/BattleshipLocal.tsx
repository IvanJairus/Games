import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Board } from '../components/Board';
import { BoardSwitch } from '../components/BoardSwitch';
import { Placer } from '../components/Placer';
import { FleetRail } from '../components/FleetRail';
import { FinishBlock } from '../components/FinishBlock';
import {
  BattleshipState,
  FLEET,
  Mark,
  Placement,
  cellLabel,
  otherSeat,
} from '../engine/types';
import { buildPlacements, generateSeed } from '../engine/rng';
import { canonicalLayout } from '../engine/crypto';
import {
  SeatReport,
  chooseAiShot,
  createInitialState,
  fireShot,
  judgeShot,
  resolveShot,
  verifyReveals,
} from '../engine';
import { SecretLayout } from '../engine/store';

type Screen = 'MODE' | 'PLACE_P1' | 'PASS_TO_P2' | 'PLACE_P2' | 'BATTLE' | 'DONE';

export interface LocalFleet {
  seed: string;
  placements: Placement[];
}

const seats: [0, 1] = [0, 1];

const logLine = (who: string, cell: number, mark: Mark, sunk?: string): string =>
  `${who} ${cellLabel(cell)}: ${mark === 'hit' ? (sunk ? `KENA, ${sunk} tenggelam` : 'KENA') : 'MELESET'}`;

export const BattleshipLocal: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const rawMode = params.get('mode');
  const mode: 'solo' | 'hotseat' | null = rawMode === 'solo' ? 'solo' : rawMode === 'hotseat' ? 'hotseat' : null;

  const [screen, setScreen] = useState<Screen>(mode ? 'PLACE_P1' : 'MODE');
  const [state, setState] = useState<BattleshipState>(createInitialState);
  const [fleets, setFleets] = useState<(LocalFleet | null)[]>([null, null]);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<'own' | 'target'>('target');
  const [lastResolved, setLastResolved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const startMode = (next: 'solo' | 'hotseat') => {
    setParams({ mode: next }, { replace: true });
    setState(createInitialState());
    setFleets([null, null]);
    setLog([]);
    setSelected(null);
    setError(null);
    setScreen('PLACE_P1');
  };

  const receiveFleet = (seat: 0 | 1, layout: SecretLayout) => {
    const fleet: LocalFleet = { seed: layout.seed, placements: layout.placements };
    const nextFleets: (LocalFleet | null)[] = [fleets[0], fleets[1]];
    nextFleets[seat] = fleet;

    if (mode === 'solo') {
      const aiSeed = generateSeed();
      nextFleets[1] = { seed: aiSeed, placements: buildPlacements(aiSeed) };
    }

    setFleets(nextFleets);

    if (mode === 'solo' || seat === 1) {
      const ready: BattleshipState = {
        ...createInitialState(),
        phase: 'BATTLE',
        commitment: ['local', 'local'],
      };
      setState(ready);
      setScreen('BATTLE');
    } else {
      setScreen('PASS_TO_P2');
    }
  };

  const pushLog = useCallback((line: string) => {
    setLog((list) => [line, ...list].slice(0, 10));
  }, []);

  const judgePending = useCallback(() => {
    const shot = state.pendingShot;
    if (!shot) return;
    const defender = otherSeat(shot.by);
    const fleet = fleets[defender];
    if (!fleet) return;

    const verdict = judgeShot({ placements: fleet.placements, marks: state.marks[defender] }, shot.cell);
    const resolved = resolveShot(state, defender, verdict);
    if (resolved.error) {
      setError(resolved.error);
      return;
    }

    pushLog(
      logLine(
        mode === 'solo' ? (shot.by === 0 ? 'Anda' : 'AI') : `Pemain ${shot.by + 1}`,
        shot.cell,
        verdict.mark,
        verdict.sunk
      )
    );
    setSelected(null);
    setLastResolved(shot.cell);
    setState(resolved.state);
    if (resolved.state.phase === 'FINISHED') setScreen('DONE');
  }, [fleets, pushLog, state]);

  useEffect(() => {
    if (screen === 'BATTLE' && state.pendingShot) judgePending();
  }, [judgePending, screen, state]);

  useEffect(() => {
    if (screen !== 'BATTLE' || mode !== 'solo') return;
    if (state.pendingShot || state.currentTurn !== 1) return;

    const timer = setTimeout(() => {
      const aiFleet = fleets[1];
      const humanFleet = fleets[0];
      if (!aiFleet || !humanFleet) return;

      const cell = chooseAiShot(state.marks[0]);
      if (cell < 0) return;

      const fired = fireShot(state, 1, cell);
      if (fired.error) {
        setError(fired.error);
        return;
      }
      setSelected(null);
      setState(fired.state);
    }, 480);

    return () => clearTimeout(timer);
  }, [fleets, mode, screen, state]);

  const attacker: 0 | 1 = state.currentTurn;
  const defender = otherSeat(attacker);
  const humanTurn = mode === 'solo' ? attacker === 0 : true;

  // In hotseat the device belongs to whoever is attacking, so the "own" board is the attacker's.
  const viewerSeat: 0 | 1 = mode === 'solo' ? 0 : attacker;
  const targetSeat = otherSeat(viewerSeat);
  const viewerCanShoot = screen === 'BATTLE' && (mode === 'hotseat' || attacker === 0);

  const shoot = () => {
    if (selected === null || !humanTurn) return;
    const fired = fireShot(state, attacker, selected);
    if (fired.error) {
      setError(fired.error);
      return;
    }
    setError(null);
    setState(fired.state);
  };

  const reset = () => {
    setState(createInitialState());
    setFleets([null, null]);
    setSelected(null);
    setLastResolved(null);
    setLog([]);
    setError(null);
    setScreen(mode ? 'PLACE_P1' : 'MODE');
  };

  const sunkCount = state.sunk[defender].length;

  const [reports, setReports] = useState<SeatReport[]>([]);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (screen !== 'DONE') return;
    let cancelled = false;
    setVerifying(true);

    verifyReveals(
      state,
      seats.map((seat) => {
        const fleet = fleets[seat];
        return fleet ? { seed: fleet.seed, layout: canonicalLayout(fleet.placements) } : null;
      })
    ).then((result) => {
      if (cancelled) return;
      setReports(result);
      setVerifying(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fleets, screen, state]);

  const labelFor = (seat: 0 | 1): string =>
    mode === 'solo' ? (seat === 0 ? 'Anda' : 'AI') : `Pemain ${seat + 1}`;

  const header = useMemo(() => (
    <header className="bs-head">
      <Link
        to="/battleship"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          font: '12px/1 var(--mono)',
          color: 'var(--ink-dim)',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={14} /> /battleship
      </Link>
    </header>
  ), []);

  if (!mode) {
    return (
      <div className="bs-shell">
        {header}
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
          Main lokal Battleship
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: '14px', margin: '0 0 22px', lineHeight: 1.55 }}>
          Dua mode berjalan di satu perangkat dan tanpa server. Mode online lewat room ada di halaman
          utama Battleship.
        </p>
        <div style={{ display: 'grid', gap: '12px' }}>
          <button type="button" className="bs-btn" data-tone="primary" onClick={() => startMode('solo')}>
            Solo lawan AI
          </button>
          <button type="button" className="bs-btn" onClick={() => startMode('hotseat')}>
            Dua pemain, satu perangkat
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'PLACE_P1' || screen === 'PLACE_P2') {
    const seat: 0 | 1 = screen === 'PLACE_P1' ? 0 : 1;
    return (
      <div className="bs-shell">
        {header}
        <h1 style={{ fontSize: 'clamp(20px, 4.5vw, 26px)', letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          Susun armada Pemain {seat + 1}
        </h1>
        <Placer onReady={(layout) => receiveFleet(seat, layout)} />
      </div>
    );
  }

  if (screen === 'PASS_TO_P2') {
    return (
      <div className="bs-shell">
        {header}
        <div className="bs-note" role="status">
          Armada Pemain 1 terkunci di perangkat ini. Serahkan ke Pemain 2 supaya susunannya tidak terlihat.
        </div>
        <button type="button" className="bs-btn" data-tone="primary" onClick={() => setScreen('PLACE_P2')}>
          Saya Pemain 2, mulai susun
        </button>
      </div>
    );
  }

  return (
    <div className="bs-shell">
      {header}

      <div className="bs-head" style={{ marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Battleship · {mode === 'solo' ? 'Solo vs AI' : 'Dua Pemain'}
          </h1>
          <div className="bs-turn" data-mine={humanTurn || undefined}>
            {screen === 'DONE'
              ? 'Selesai'
              : mode === 'solo'
                ? humanTurn
                  ? 'Giliran Anda menembak'
                  : 'AI sedang menembak'
                : `Giliran Pemain ${attacker + 1} menembak`}
          </div>
        </div>
        <button type="button" className="bs-btn" style={{ flex: '0 0 auto' }} onClick={reset}>
          Ulangi
        </button>
      </div>

      {error && (
        <div className="bs-note" data-tone="alert" role="alert">
          {error}
        </div>
      )}

      <div className="bs-boards" data-view={view}>
        <BoardSwitch
          value={view}
          onChange={setView}
          ownLabel={mode === 'solo' ? 'Papan Anda' : `Papan Pemain ${viewerSeat + 1}`}
          targetLabel={mode === 'solo' ? 'Papan AI' : `Papan Pemain ${otherSeat(viewerSeat) + 1}`}
        />
        <Board
          variant="own"
          label={mode === 'solo' ? 'Papan Anda' : `Papan Pemain ${viewerSeat + 1}`}
          hint={`${state.shotsTaken[otherSeat(viewerSeat)]} tembakan masuk, ${state.sunk[viewerSeat].length} kapal tenggelam`}
          marks={state.marks[viewerSeat]}
          ships={fleets[viewerSeat]?.placements}
          sunkKinds={state.sunk[viewerSeat]}
          lastResolved={lastResolved}
        />
        <Board
          variant="target"
          label={mode === 'solo' ? 'Papan AI' : `Papan Pemain ${otherSeat(viewerSeat) + 1}`}
          hint={`${sunkCount}/${FLEET.length} kapal tenggelam`}
          marks={state.marks[targetSeat]}
          ships={screen === 'DONE' ? fleets[targetSeat]?.placements : undefined}
          sunkKinds={state.sunk[targetSeat]}
          selected={selected}
          interactive={viewerCanShoot}
          active={viewerCanShoot}
          lastResolved={lastResolved}
          onPick={(cell) => {
            setSelected(cell);
            setView('target');
          }}
        />
      </div>

      <FleetRail sunk={state.sunk[targetSeat]} />

      {viewerCanShoot && (
        <div className="bs-actions">
          <button type="button" className="bs-btn" data-tone="danger" onClick={shoot} disabled={selected === null}>
            {selected === null ? 'Pilih petak target' : `Tembak ${cellLabel(selected)}`}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <ul
          aria-label="Hasil tembakan"
          style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', font: '11px/1.9 var(--mono)', color: 'var(--ink-dim)' }}
        >
          {log.map((line, i) => (
            <li key={`${line}-${i}`} className={i === 0 ? 'bs-fade' : undefined}>
              {line}
            </li>
          ))}
        </ul>
      )}

      {screen === 'DONE' && (
        <FinishBlock
          state={state}
          boards={seats.map((seat) => ({
            seat,
            label: labelFor(seat),
            placements: fleets[seat]?.placements ?? null,
          }))}
          reports={reports}
          verifying={verifying}
          onReset={reset}
        />
      )}
    </div>
  );
};
