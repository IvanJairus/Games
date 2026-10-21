import { DIRS, walkable, type BombermanState, type Facing } from './types';

/**
 * View-only movement prediction for the seat this tab owns.
 *
 * The server remains the only authority. When a direction is pressed, this class starts a
 * visual step immediately if the last server frame says the target cell is walkable. When the
 * server eventually starts the same step (or moves the seat anywhere else), the visual is
 * reconciled with a short decaying offset instead of a hard snap.
 *
 * It deliberately predicts one step from rest, not a whole walk: grid movement, bombs, and
 * kills are cheap to mispredict, and one step is where the input latency is felt.
 */

const MAX_LEAD_SECONDS = 0.28;
const CORRECTION_DECAY = 0.72;
const CORRECTION_EPSILON = 0.01;
/** A correction larger than this is a teleport, not a late frame; snapping is safer. */
const MAX_CORRECTION_CELLS = 2;

interface Lead {
  seat: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  startedAt: number;
  deadline: number;
  visualX: number;
  visualY: number;
}

export class MovementPredictor {
  private lead: Lead | null = null;
  private correction = { seat: -1, x: 0, y: 0 };

  reset(): void {
    this.lead = null;
    this.correction = { seat: -1, x: 0, y: 0 };
  }

  /**
   * Called when the held direction changes. Returns true when a new lead was started, which
   * the tests use and the page does not need.
   */
  observe(state: BombermanState, seat: number, dir: Facing | null, now: number): boolean {
    if (!dir || seat < 0 || state.phase !== 'battle') return false;
    const p = state.players.find((q) => q.seat === seat);
    if (!p || !p.alive || p.step) return false;
    if (this.lead?.seat === seat) return false;

    const d = DIRS[dir];
    const tx = p.x + d.x;
    const ty = p.y + d.y;
    if (!walkable(state, tx, ty)) return false;

    this.lead = {
      seat,
      fx: p.x,
      fy: p.y,
      tx,
      ty,
      startedAt: now,
      deadline: now + MAX_LEAD_SECONDS * 1000,
      visualX: p.ax,
      visualY: p.ay,
    };
    this.correction = { seat, x: 0, y: 0 };
    return true;
  }

  /**
   * Called after `smooth()`, against the authoritative pose. Confirms the lead when the server
   * starts or finishes the same step, expires it on a deadline, and decays any leftover offset.
   */
  reconcile(state: BombermanState, seat: number, now: number): void {
    const p = state.players.find((q) => q.seat === seat);
    if (!p || !p.alive || state.phase !== 'battle') {
      this.reset();
      return;
    }

    let justFinished = false;
    const lead = this.lead;
    if (lead && lead.seat === seat) {
      const reached = p.x === lead.tx && p.y === lead.ty;
      const stepping =
        !!p.step && p.step.fx === lead.fx && p.step.fy === lead.fy && p.step.tx === lead.tx && p.step.ty === lead.ty;
      const movedElsewhere = p.x !== lead.fx || p.y !== lead.fy;
      if (reached || stepping || movedElsewhere || now >= lead.deadline) {
        this.finishLead(p);
        justFinished = true;
      }
    }

    if (!this.lead && this.correction.seat === seat && !justFinished) {
      const c = this.correction;
      if (Math.hypot(c.x, c.y) < CORRECTION_EPSILON) this.correction = { seat: -1, x: 0, y: 0 };
      else {
        c.x *= CORRECTION_DECAY;
        c.y *= CORRECTION_DECAY;
      }
    }
  }

  /** Called after `reconcile()`. Mutates only `ax`/`ay`, never the authoritative `x`/`y`. */
  apply(state: BombermanState, seat: number, now: number): void {
    const p = state.players.find((q) => q.seat === seat);
    if (!p || !p.alive || state.phase !== 'battle') {
      this.reset();
      return;
    }

    const lead = this.lead;
    if (lead && lead.seat === seat) {
      const t = Math.min(1, ((now - lead.startedAt) / 1000) * p.speed);
      p.ax = lead.fx + (lead.tx - lead.fx) * t;
      p.ay = lead.fy + (lead.ty - lead.fy) * t;
      lead.visualX = p.ax;
      lead.visualY = p.ay;
      return;
    }

    const c = this.correction;
    if (c.seat === seat) {
      p.ax += c.x;
      p.ay += c.y;
    }
  }

  private finishLead(p: { ax: number; ay: number }): void {
    const lead = this.lead;
    if (!lead) return;
    const dx = lead.visualX - p.ax;
    const dy = lead.visualY - p.ay;
    this.lead = null;
    this.correction =
      Math.hypot(dx, dy) <= MAX_CORRECTION_CELLS ? { seat: lead.seat, x: dx, y: dy } : { seat: -1, x: 0, y: 0 };
  }
}
