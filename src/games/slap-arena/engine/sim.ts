import type { ArenaState, InputState, PlayerSnapshot, PlayerState, SimEvent, WorldSnapshot } from './types';
import {
  CHARGE_HOLD_LIMIT,
  COUNTDOWN_TIME,
  canSlap,
  createInitialArena,
  createPlayer,
  executeDash,
  executeSlap,
  resolvePlayerCollisions,
  spawnPlayersInCircle,
  stepMovement,
  updatePlayerMovement,
} from './physics';
import { botInputToState, computeBotAi } from './botAi';

const FIXED_DT = 1 / 120;
/** One Worker tick. A replayed input is worth exactly this much simulated time. */
const REPLAY_STEP = 0.05;
/** Three seconds at 20 Hz; past that the ack has stalled and replaying is guessing. */
const MAX_PENDING = 60;
/** A jump bigger than this is a respawn or a KO, not drift: snap it, do not smear it. */
const MAX_CORRECTION = 4;
export const GRACE_SECONDS = 2.5;
const MAX_STEP_SECONDS = 0.25;

export interface SimOptions {
  localId: string;
  /** Host (or solo) runs the whole world. Clients predict their own brawler only. */
  authoritative: boolean;
  scoreToWin?: number;
  onEvent?: (event: SimEvent) => void;
}

const NO_INPUT: InputState = { x: 0, z: 0, slap: false, dash: false };

function clamp01(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0;
}

/**
 * A hold only winds up while a slap would actually be allowed, so a brawler who is still
 * cooling down, stunned, or already in the sea does not build a charge it cannot spend.
 * Being hit also drops the wind-up, which is what makes a cancelled charge legible.
 */
function nextChargeT(player: PlayerState, held: boolean | undefined, dt: number): number {
  const current = Number.isFinite(player.chargeT) ? player.chargeT : -1;
  if (!held || player.slapCooldown > 0 || player.isHit || player.isFalling || player.eliminated) return -1;
  return current < 0 ? 0 : Math.min(CHARGE_HOLD_LIMIT, current + dt);
}

/** Fallbacks used when two brawlers pick the same colour, so nobody is a clone. */
const TEAM_PALETTE = ['#4dabf7', '#ff5d5d', '#6fe3b0', '#ffcf5c', '#b197fc', '#ffa94d', '#f783ac', '#74c0fc'];

export class SlapSim {
  readonly state: ArenaState;
  readonly localId: string;
  authoritative: boolean;
  onEvent: (event: SimEvent) => void;

  private inputs = new Map<string, InputState>();
  private accumulator = 0;
  private clock = 0;
  private roundElapsed = 0;
  private koEmitted = new Set<string>();
  /** Local-only view of remote brawlers, filled by applySnapshot on clients. */
  private remoteTargets = new Map<string, PlayerSnapshot>();
  /**
   * Inputs that went on the wire but have not been acknowledged by the host yet, in order.
   * Reconciliation rewinds to the host position and re-runs these, so prediction and the
   * host agree without the player seeing a correction.
   */
  private pendingInputs: { seq: number; input: InputState }[] = [];

  constructor(opts: SimOptions) {
    this.localId = opts.localId;
    this.authoritative = opts.authoritative;
    this.onEvent = opts.onEvent ?? (() => {});
    this.state = createInitialArena('local', opts.scoreToWin ?? 3);
  }

  get players(): Record<string, PlayerState> {
    return this.state.players;
  }

  get local(): PlayerState | undefined {
    return this.state.players[this.localId];
  }

  setInput(id: string, input: InputState): void {
    this.inputs.set(id, input);
  }

  /**
   * Records an input exactly as the wire carried it, keyed by the same `seq` the host
   * publishes back through `applied`. Only the local seat needs this; a remote brawler is
   * never replayed.
   */
  noteSentInput(seq: number, input: InputState): void {
    if (!Number.isFinite(seq)) return;
    this.pendingInputs.push({ seq, input: { ...input } });
    if (this.pendingInputs.length > MAX_PENDING) this.pendingInputs.shift();
  }

  addPlayer(p: Partial<PlayerState> & { id: string }): PlayerState {
    const player = createPlayer(p);
    this.state.players[player.id] = player;
    this.setColor(player.id, p.color);
    return player;
  }

  /**
   * Two brawlers in the same kit are unreadable in a slap fight, so the host hands out
   * a free colour instead. Callers may retry every input packet, which is why this is
   * idempotent: a colour already taken is never applied twice.
   */
  setColor(id: string, color?: string): void {
    const player = this.state.players[id];
    if (!player) return;
    const wanted = (color ?? TEAM_PALETTE[0]).toLowerCase();
    const taken = new Set(
      Object.values(this.state.players)
        .filter((other) => other.id !== id)
        .map((other) => other.color.toLowerCase())
    );
    if (!taken.has(wanted)) {
      player.color = color ?? TEAM_PALETTE[0];
      return;
    }
    const free = TEAM_PALETTE.find((c) => !taken.has(c.toLowerCase()));
    if (free) player.color = free;
  }

  removePlayer(id: string): void {
    delete this.state.players[id];
    this.inputs.delete(id);
    this.remoteTargets.delete(id);
  }

  listIds(): string[] {
    return Object.keys(this.state.players);
  }

  startCountdown(delaySeconds = 0): void {
    if (this.state.phase === 'BATTLE' || this.state.phase === 'COUNTDOWN') return;
    this.state.countdown = COUNTDOWN_TIME + delaySeconds;
    this.state.winnerId = null;
    this.state.phase = 'COUNTDOWN';
  }

  beginRound(): void {
    spawnPlayersInCircle(this.state.players);
    this.koEmitted.clear();
    this.roundElapsed = 0;
    this.state.phase = 'BATTLE';
    this.state.winnerId = null;
    // The queue belongs to the round that just ended; replaying it would push a body
    // across the fresh spawn point.
    this.pendingInputs.length = 0;
    for (const p of Object.values(this.state.players)) {
      p.corrX = 0;
      p.corrZ = 0;
    }
    this.onEvent({ kind: 'roundStart', round: this.state.round });
  }

  nextRound(): void {
    if (!this.authoritative) return;
    this.state.round += 1;
    this.beginRound();
  }

  /** Advances the world. Safe to call once per animation frame. */
  step(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_SECONDS);
    this.clock += dt;

    if (!this.authoritative) {
      this.stepLocalPrediction(dt);
      return;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 240) {
      this.accumulator -= FIXED_DT;
      steps++;
      this.fixedStep(FIXED_DT);
    }
  }

  private fixedStep(dt: number): void {
    const { state } = this;

    if (state.phase === 'COUNTDOWN') {
      state.countdown -= dt;
      if (state.countdown <= 0) this.beginRound();
      return;
    }
    if (state.phase !== 'BATTLE') return;

    const list = Object.values(state.players) as PlayerState[];
    this.roundElapsed += dt;
    const knockScale = this.roundElapsed < GRACE_SECONDS ? 0.55 : 1;

    for (const p of list) {
      const input = p.isBot ? this.botInput(p, list, dt) : (this.inputs.get(p.id) ?? NO_INPUT);
      if (input.slap || input.dash) {
        this.consumeAction(p, list, input, knockScale);
      }
      p.chargeT = nextChargeT(p, input.held, dt);
      updatePlayerMovement(p, input.x, input.z, dt);
      if (p.isFalling && !this.koEmitted.has(p.id)) {
        this.koEmitted.add(p.id);
        this.onEvent({ kind: 'ko', playerId: p.id, x: p.x, z: p.z });
      }
    }

    resolvePlayerCollisions(list);
    this.checkRoundEnd(list);
  }

  private consumeAction(p: PlayerState, list: PlayerState[], input: InputState, knockScale: number): void {
    if (input.slap) {
      input.slap = false;
      const charge = clamp01(input.charge);
      // A refused swing announces nothing at all, so it cannot print a MISS the player
      // never swung. Returning here would also swallow a dash in the same frame.
      if (canSlap(p)) {
        const hits = executeSlap(p, list, knockScale, charge);
        this.onEvent({ kind: 'slap', playerId: p.id, x: p.x, z: p.z, angle: p.angle, charge, hitCount: hits.length });
        for (const h of hits) {
          const victim = this.state.players[h.victimId];
          if (victim)
            this.onEvent({
              kind: 'hit',
              attackerId: h.attackerId,
              victimId: h.victimId,
              x: victim.x,
              z: victim.z,
              angle: p.angle,
              force: h.force,
              charge: h.charge,
            });
        }
      }
    }
    if (input.dash) {
      input.dash = false;
      if (executeDash(p)) this.onEvent({ kind: 'dash', playerId: p.id, x: p.x, z: p.z, angle: p.angle });
    }
  }

  private botInput(bot: PlayerState, list: PlayerState[], dt: number): InputState {
    const decision = computeBotAi(bot, list, dt, this.clock, this.roundElapsed);
    return botInputToState(decision);
  }

  private checkRoundEnd(list: PlayerState[]): void {
    const survivors = list.filter((p) => !p.isFalling && !p.eliminated);
    if (list.length < 2 || survivors.length > 1) return;

    const winner = survivors.length === 1 ? survivors[0] : null;
    if (winner) winner.score += 1;
    const matchOver = !!winner && winner.score >= this.state.scoreToWin;
    this.state.winnerId = winner ? winner.id : null;
    this.state.matchWinnerId = matchOver && winner ? winner.id : null;
    this.state.phase = matchOver ? 'MATCH_OVER' : 'ROUND_OVER';
    this.onEvent({
      kind: 'roundEnd',
      winnerId: this.state.winnerId,
      round: this.state.round,
      matchOver,
    });
  }

  /** Clients only simulate their own brawler so movement feels immediate. */
  private stepLocalPrediction(dt: number): void {
    const me = this.local;
    if (!me || this.state.phase !== 'BATTLE') return;
    const input = this.inputs.get(this.localId) ?? NO_INPUT;
    if (input.slap) {
      input.slap = false;
      if (canSlap(me))
        this.onEvent({ kind: 'slap', playerId: me.id, x: me.x, z: me.z, angle: me.angle, charge: clamp01(input.charge) });
    }
    if (input.dash) {
      input.dash = false;
      if (executeDash(me)) this.onEvent({ kind: 'dash', playerId: me.id, x: me.x, z: me.z, angle: me.angle });
    }
    me.chargeT = nextChargeT(me, input.held, dt);
    updatePlayerMovement(me, input.x, input.z, dt);
  }

  snapshot(): WorldSnapshot {
    return {
      round: this.state.round,
      phase: this.state.phase,
      countdown: Math.max(0, Math.ceil(this.state.countdown)),
      scoreToWin: this.state.scoreToWin,
      winnerId: this.state.winnerId,
      matchWinnerId: this.state.matchWinnerId,
      t: this.clock,
      players: Object.values(this.state.players).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        x: round2(p.x),
        z: round2(p.z),
        vx: round2(p.vx),
        vz: round2(p.vz),
        angle: round2(p.angle),
        score: p.score,
        isFalling: p.isFalling,
        eliminated: p.eliminated,
        slapCooldown: round2(p.slapCooldown),
        dashCooldown: round2(p.dashCooldown),
        y: round2(p.y),
        chargeT: p.chargeT < 0 ? -1 : round2(p.chargeT),
      })),
    };
  }

  /** Client-side: adopt the authoritative world, keeping own prediction. */
  applySnapshot(snap: WorldSnapshot, appliedSeq?: number): void {
    const { state } = this;
    const newRound = snap.round !== state.round;
    state.round = snap.round;
    state.scoreToWin = snap.scoreToWin;
    state.winnerId = snap.winnerId;
    state.matchWinnerId = snap.matchWinnerId;
    state.countdown = snap.countdown;
    if (state.phase !== snap.phase) state.phase = snap.phase;

    if (newRound) {
      // A new round respawns everyone; replaying the old queue would shove the body off
      // the spawn point, and an old visual offset would smear it.
      this.pendingInputs.length = 0;
      for (const p of Object.values(state.players)) {
        p.corrX = 0;
        p.corrZ = 0;
      }
    }

    for (const p of snap.players) {
      if (p.id === this.localId) {
        this.reconcile(p, appliedSeq);
        continue;
      }
      this.remoteTargets.set(p.id, p);
      let local = state.players[p.id];
      if (!local) {
        local = this.addPlayer({ id: p.id, name: p.name, color: p.color, isBot: p.isBot });
      }
      local.name = p.name;
      local.color = p.color;
      local.score = p.score;
      local.isFalling = p.isFalling;
      local.eliminated = p.eliminated;
      local.slapCooldown = p.slapCooldown;
      local.dashCooldown = p.dashCooldown;
      // The renderer reads player.x/z, so the authoritative pose has to land there.
      // renderX/renderZ in Arena3D smooths the gap between 20 Hz snapshots.
      local.x = p.x;
      local.z = p.z;
      local.vx = p.vx;
      local.vz = p.vz;
      local.angle = p.angle;
      local.y = p.y ?? 0;
      local.chargeT = p.chargeT ?? -1;
    }

    for (const id of Object.keys(state.players)) {
      if (!snap.players.some((p) => p.id === id) && id !== this.localId) this.removePlayer(id);
    }
  }

  private reconcile(p: PlayerSnapshot, appliedSeq?: number): void {
    const me = this.local;
    if (!me) return;
    // The host resolved any colour clash, so adopt its answer and stay in sync.
    if (p.color && p.color.toLowerCase() !== me.color.toLowerCase()) me.color = p.color;
    me.score = p.score;
    me.isFalling = p.isFalling;
    me.eliminated = p.eliminated;

    // Everything up to `appliedSeq` has already shaped this position; drop it.
    if (typeof appliedSeq === 'number' && Number.isFinite(appliedSeq)) {
      while (this.pendingInputs.length && this.pendingInputs[0].seq <= appliedSeq) {
        this.pendingInputs.shift();
      }
    }

    const beforeX = me.x;
    const beforeZ = me.z;

    // The host is the truth for where the body is. Cooldowns, chargeT and angle are NOT
    // copied back: they are one network round trip stale on the wire, and adopting them
    // would make the charge meter tick backwards and delay every slap by an RTT. The local
    // frame loop owns those, and the host still refuses a slap that was actually too early.
    me.x = p.x;
    me.z = p.z;
    me.vx = p.vx;
    me.vz = p.vz;
    me.y = p.y ?? 0;
    if (!me.isFalling) {
      for (const item of this.pendingInputs) {
        stepMovement(me, item.input.x, item.input.z, REPLAY_STEP);
      }
    }

    // Absorb the jump instead of drawing it. A real teleport (respawn, KO) is snapped.
    const dx = beforeX - me.x;
    const dz = beforeZ - me.z;
    if (Math.hypot(dx, dz) < MAX_CORRECTION) {
      me.corrX += dx;
      me.corrZ += dz;
    } else {
      me.corrX = 0;
      me.corrZ = 0;
    }

    this.remoteTargets.set(p.id, p);
  }

  /** Where the renderer should draw a remote brawler right now. */
  targetOf(id: string): PlayerSnapshot | undefined {
    return this.remoteTargets.get(id);
  }

  aliveCount(): number {
    return Object.values(this.state.players).filter((p) => !p.isFalling && !p.eliminated).length;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
