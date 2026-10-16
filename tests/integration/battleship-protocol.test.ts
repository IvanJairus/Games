import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FLEET,
  BattleshipState,
  cellKey,
  otherSeat,
} from '@/games/battleship/engine/types';
import { buildPlacements } from '@/games/battleship/engine/rng';
import { canonicalLayout, computeCommitment } from '@/games/battleship/engine/crypto';
import {
  applyCommitment,
  createInitialState,
  fireShot,
  judgeShot,
  resolveShot,
  verifySeat,
} from '@/games/battleship/engine';

interface Row {
  id: string;
  room_code: string;
  game_type: string;
  status: string;
  current_turn: number;
  game_state: any;
  winner_index: number | null;
  max_players: number;
  updated_at: string;
}

interface Seat {
  match_id: string;
  player_index: number;
  session_id: string;
  name: string;
  is_host: boolean;
  connected: boolean;
}

// Shared fake for the matches table. Predicates behave like PostgREST: an update only returns
// rows that still satisfy every filter at the moment it runs.
class FakeDb {
  row: Row = {
    id: 'match-1',
    room_code: 'BTA222',
    game_type: 'battleship',
    status: 'waiting',
    current_turn: 0,
    game_state: createInitialState(),
    winner_index: null,
    max_players: 2,
    updated_at: 'v0',
  };
  seats: Seat[] = [];
  moves: { player_index: number; action: string; payload: any }[] = [];
  private version = 0;

  reset(row: Partial<Row>, seats: Seat[] = []) {
    this.row = { ...this.row, ...row } as Row;
    this.seats = seats;
    this.moves = [];
    this.version = 0;
  }

  bump() {
    this.version += 1;
    this.row.updated_at = `v${this.version}`;
  }

  client() {
    const db = this;
    const matchesChain = (mode: 'select' | 'update' | 'insert', payload?: any) => {
      const filters: [string, any][] = [];
      const api: any = {
        eq: (col: string, val: any) => {
          filters.push([col, val]);
          return api;
        },
        in: (col: string, vals: any[]) => {
          filters.push([col, vals]);
          return api;
        },
        select: (_cols?: string) => {
          if (mode === 'insert') {
            const row: Row = {
              id: 'match-1',
              room_code: payload.room_code,
              game_type: payload.game_type,
              status: payload.status,
              current_turn: payload.current_turn,
              game_state: payload.game_state,
              winner_index: payload.winner_index,
              max_players: payload.max_players,
              updated_at: 'v0',
            };
            db.row = row;
            return { single: () => Promise.resolve({ data: row, error: null }) };
          }
          return api;
        },
        single: () => {
          if (mode === 'select') {
            const ok = filters.every(([c, v]) => (db.row as any)[c] === v);
            if (!ok) return Promise.resolve({ data: null, error: { message: 'no rows' } });
            return Promise.resolve({
              data: { ...db.row, match_players: db.seats },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: (v: any) => void) => {
          if (mode === 'insert') {
            db.seats.push(payload);
            return resolve({ error: null });
          }
          if (mode === 'update') {
            const ok = filters.every(([c, v]) =>
              Array.isArray(v) ? v.includes((db.row as any)[c]) : (db.row as any)[c] === v
            );
            if (!ok) return resolve({ data: [], error: null });
            Object.assign(db.row, payload);
            db.bump();
            return resolve({ data: [{ id: db.row.id }], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return api;
    };

    const table = (name: string) => {
      if (name === 'matches') {
        return {
          select: () => matchesChain('select'),
          insert: (payload: any) => matchesChain('insert', payload),
          update: (payload: any) => matchesChain('update', payload),
        };
      }
      if (name === 'match_players') {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({
              order: () =>
                Promise.resolve({
                  data: db.seats.filter((s) => (s as any)[col] === val),
                  error: null,
                }),
            }),
          }),
          insert: (payload: Seat) => ({
            then: (resolve: (v: any) => void) => {
              const clash = db.seats.some(
                (s) => s.session_id === payload.session_id || s.player_index === payload.player_index
              );
              if (clash) {
                return resolve({ error: { code: '23505', message: 'duplicate' } });
              }
              db.seats.push(payload);
              return resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (name === 'match_moves') {
        return {
          insert: (payload: any) =>
            Promise.resolve({ error: db.moves.push(payload) as unknown as null }),
        };
      }
      return {};
    };

    return {
      from: table,
      channel: () => ({
        on: () => ({ on: () => ({ subscribe: () => ({}) }) }),
        subscribe: () => {},
        send: () => {},
      }),
      removeChannel: () => {},
    } as any;
  }
}

const db = new FakeDb();
let currentSession = 'p1';

vi.mock('@/lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase');
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabase: () => db.client(),
    getPlayerSessionId: () => currentSession,
  };
});

const { createOnlineRoom, joinOnlineRoom, submitOnlineMove } = await import(
  '@/games/common/multiplayer'
);

const seatsFor = (seed: string) => buildPlacements(seed);

const readGame = (): BattleshipState => db.row.game_state as BattleshipState;

describe('Battleship online protocol against the matches table', () => {
  beforeEach(() => {
    db.reset({ game_state: createInitialState(), status: 'waiting', current_turn: 0, winner_index: null });
    db.seats = [];
    db.moves = [];
    currentSession = 'p1';
  });

  it('runs a full room from join to reveal with only legal writes landing', async () => {
    const seedA = 'seed-alpha';
    const seedB = 'seed-bravo';
    const fleetA = seatsFor(seedA);
    const fleetB = seatsFor(seedB);

    const { roomCode } = await createOnlineRoom({
      gameType: 'battleship',
      maxPlayers: 2,
      hostName: 'Alpha',
      initialState: createInitialState(),
    });
    expect(db.row.status).toBe('waiting');
    expect(db.seats).toHaveLength(1);

    currentSession = 'p2';
    const joined = await joinOnlineRoom({ roomCode, playerName: 'Bravo' });
    expect(joined.playerIndex).toBe(1);
    expect(db.row.status).toBe('waiting');

    const commitA = await computeCommitment(seedA, fleetA);
    const commitB = await computeCommitment(seedB, fleetB);

    // Bravo cannot write while the row still belongs to Alpha.
    currentSession = 'p2';
    const earlyB = applyCommitment(readGame(), 1, commitB).state;
    const outOfTurn = await submitOnlineMove({
      matchId: db.row.id,
      playerIndex: 1,
      action: 'COMMIT',
      nextState: earlyB,
      nextTurn: 0,
      basedOn: db.row.updated_at,
    });
    expect(outOfTurn.ok).toBe(false);
    expect(outOfTurn.failure).toBe('turn');
    expect(readGame().commitment[1]).toBeNull();

    currentSession = 'p1';
    const stateA = applyCommitment(readGame(), 0, commitA).state;
    const wroteA = await submitOnlineMove({
      matchId: db.row.id,
      playerIndex: 0,
      action: 'COMMIT',
      nextState: stateA,
      nextTurn: 1,
      basedOn: db.row.updated_at,
      moveSummary: { phase: stateA.phase },
    });
    expect(wroteA.ok).toBe(true);

    currentSession = 'p2';
    const stateB = applyCommitment(readGame(), 1, commitB).state;

    const wroteB = await submitOnlineMove({
      matchId: db.row.id,
      playerIndex: 1,
      action: 'COMMIT',
      nextState: stateB,
      nextTurn: 0,
      statusGuard: 'waiting',
      basedOn: db.row.updated_at,
      moveSummary: { phase: stateB.phase },
    });
    expect(wroteB.ok).toBe(true);
    expect(readGame().phase).toBe('BATTLE');

    let game = readGame();
    let shots = 0;
    while (game.phase === 'BATTLE' && shots < 140) {
      const attacker = game.currentTurn;
      const defender = otherSeat(attacker);
      const defenderFleet = defender === 0 ? fleetA : fleetB;
      const marks = game.marks[defender];

      const target = (() => {
        for (let cell = 0; cell < 64; cell++) {
          if (!marks[cellKey(cell)]) return cell;
        }
        return -1;
      })();
      expect(target).toBeGreaterThanOrEqual(0);

      const fired = fireShot(game, attacker as 0 | 1, target);
      expect(fired.error).toBeUndefined();
      const wroteShot = await submitOnlineMove({
        matchId: db.row.id,
        playerIndex: attacker,
        action: 'SHOT',
        nextState: fired.state,
        nextTurn: defender,
        basedOn: db.row.updated_at,
        moveSummary: { shot: target },
      });
      expect(wroteShot.ok).toBe(true);

      const verdict = judgeShot(
        { placements: defenderFleet, marks: fired.state.marks[defender] },
        target
      );
      const resolved = resolveShot(fired.state, defender as 0 | 1, verdict);
      expect(resolved.error).toBeUndefined();
      const finished = resolved.state.phase === 'FINISHED';
      const wroteJudge = await submitOnlineMove({
        matchId: db.row.id,
        playerIndex: defender,
        action: 'RESOLVE',
        nextState: resolved.state,
        nextTurn: defender,
        winnerIndex: resolved.state.winner,
        newStatus: finished ? 'completed' : 'playing',
        basedOn: db.row.updated_at,
        moveSummary: { shot: target, result: verdict.mark },
      });
      expect(wroteJudge.ok).toBe(true);

      game = readGame();
      shots += 1;
    }

    expect(game.phase).toBe('FINISHED');
    expect(game.winner).not.toBeNull();
    expect(db.row.status).toBe('completed');

    const revealWinner = game.winner as 0 | 1;
    const winnerFleet = revealWinner === 0 ? fleetA : fleetB;
    const winnerSeed = revealWinner === 0 ? seedA : seedB;
    const checked = await verifySeat(
      game,
      revealWinner,
      { seed: winnerSeed, layout: canonicalLayout(winnerFleet) },
      false
    );
    expect(checked.ok).toBe(true);

    const serialized = JSON.stringify(db.moves);
    expect(serialized).not.toContain(canonicalLayout(fleetA));
    expect(serialized).not.toContain(canonicalLayout(fleetB));
    expect(serialized).not.toContain('cells');

    const hitCount = Object.values(game.marks[otherSeat(revealWinner)]).filter((m) => m === 'hit').length;
    expect(FLEET).toHaveLength(5);
    expect(hitCount).toBeGreaterThan(0);
  });

  it('rejects a write built on a row version that no longer exists', async () => {
    db.reset(
      {
        game_state: { ...createInitialState(), phase: 'BATTLE', commitment: ['c0', 'c1'] },
        status: 'playing',
        current_turn: 0,
      },
      [
        { match_id: 'match-1', player_index: 0, session_id: 'p1', name: 'Alpha', is_host: true, connected: true },
        { match_id: 'match-1', player_index: 1, session_id: 'p2', name: 'Bravo', is_host: false, connected: true },
      ]
    );
    db.bump();

    const staleVersion = db.row.updated_at;
    const game = readGame();
    const mine = fireShot(game, 0, 10).state;
    const wroteFresh = await submitOnlineMove({
      matchId: db.row.id,
      playerIndex: 0,
      action: 'SHOT',
      nextState: mine,
      nextTurn: 1,
      basedOn: staleVersion,
    });
    expect(wroteFresh.ok).toBe(true);

    // A second player who also believed it was their turn, on the same old version, must lose.
    const conflicting = fireShot(mine, 1, 11).state;
    const rejected = await submitOnlineMove({
      matchId: db.row.id,
      playerIndex: 1,
      action: 'SHOT',
      nextState: conflicting,
      nextTurn: 0,
      basedOn: staleVersion,
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.failure).toBe('stale');
    expect(readGame().marks[1][cellKey(11)]).toBeUndefined();
  });

  it('flags a defender that lies about a shot once the fleet is revealed', async () => {
    const seedB = 'seed-liar';
    const fleetB = seatsFor(seedB);
    const occupied = fleetB.flatMap((p) => p.cells)[0];

    db.reset(
      {
        game_state: {
          ...createInitialState(),
          phase: 'BATTLE',
          commitment: [await computeCommitment('seed-honest', seatsFor('seed-honest')), null],
        } as any,
        status: 'playing',
        current_turn: 0,
      },
      []
    );

    const game = readGame();
    const fired = fireShot(game, 0, occupied);
    expect(fired.error).toBeUndefined();

    const lied = resolveShot(fired.state, 1, { mark: 'miss' }).state;
    db.row.game_state = lied;

    const commitment = await computeCommitment(seedB, fleetB);
    const withCommit: BattleshipState = {
      ...lied,
      commitment: [lied.commitment[0], commitment],
    };
    db.row.game_state = withCommit;

    const verdict = await verifySeat(
      withCommit,
      1,
      { seed: seedB, layout: canonicalLayout(fleetB) },
      false
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toContain('meleset');

    const truth = resolveShot(fired.state, 1, { mark: 'hit' }).state;
    const honestVerdict = await verifySeat(
      { ...truth, commitment: [truth.commitment[0], commitment] },
      1,
      { seed: seedB, layout: canonicalLayout(fleetB) },
      false
    );
    expect(honestVerdict.ok).toBe(true);
  });

  it('hands the commit turn to the other seat so both sides can lock', async () => {
    db.reset(
      {
        game_state: createInitialState(),
        status: 'waiting',
        current_turn: 0,
        winner_index: null,
      },
      [
        { match_id: 'match-1', player_index: 0, session_id: 'p1', name: 'Host', is_host: true, connected: true },
        { match_id: 'match-1', player_index: 1, session_id: 'p2', name: 'Tamu', is_host: false, connected: true },
      ]
    );
    currentSession = 'p1';

    const commitSeat = async (seat: 0 | 1, commitment: string) => {
      const applied = applyCommitment(readGame(), seat, commitment);
      expect(applied.error).toBeUndefined();
      const wrote = await submitOnlineMove({
        matchId: db.row.id,
        playerIndex: seat,
        action: 'COMMIT',
        nextState: applied.state,
        nextTurn: otherSeat(seat),
        newStatus: applied.state.phase === 'BATTLE' ? 'playing' : undefined,
        basedOn: db.row.updated_at,
        moveSummary: { phase: applied.state.phase },
      });
      expect(wrote.ok).toBe(true);
      return readGame();
    };

    // The page only offers the placer to a seat whose index matches game_state.currentTurn, so the
    // state has to move with the row or the second player is never invited to lock.
    const seesOwnTurn = (state: BattleshipState, seat: 0 | 1) =>
      state.phase === 'PLACEMENT' && state.currentTurn === seat;

    const afterHost = await commitSeat(0, 'c0');
    expect(seesOwnTurn(afterHost, 0)).toBe(false);
    expect(seesOwnTurn(afterHost, 1)).toBe(true);
    expect(db.row.current_turn).toBe(1);

    const afterGuest = await commitSeat(1, 'c1');
    expect(afterGuest.phase).toBe('BATTLE');
    expect(afterGuest.currentTurn).toBe(0);
    expect(db.row.status).toBe('playing');
  });
});
