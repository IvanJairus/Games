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
/** How long a released press may wait for the server to confirm it before the view gives up. */
const RELEASE_GRACE_MS = 150;

interface Lead {
  seat: number;
  dir: Facing;
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
  private releasedAt: number | null = null;

  reset(): void {
    this.lead = null;
    this.correction = { seat: -1, x: 0, y: 0 };
    this.releasedAt = null;
  }

  /**
   * The key went up. A tap can be shorter than the server's next tick, in which case the
   * step being drawn will never exist. The lead is kept for a short grace so a press that
   * the server did receive still lands, then dropped back to the authority.
   */
  release(now: number): boolean {
    if (!this.lead) return false;
    this.releasedAt = now;
    return true;
  }

  /**
   * Called when the held direction changes. Returns true when a new lead was started, which
   * the tests use and the page does not need.
   */
  observe(state: BombermanState, seat: number, dir: Facing | null, now: number): boolean {
    if (!dir) {
      this.release(now);
      return false;
    }
    if (seat < 0 || state.phase !== 'battle') return false;
    const p = state.players.find((q) => q.seat === seat);
    if (!p || !p.alive) return false;
    /* A new direction replaces a lead that is still only a guess. Keeping the old one made
       the view finish a step the player had already cancelled, which reads as moving the
       wrong way before it turns. */
    if (this.lead?.seat === seat) {
      if (this.lead.dir === dir) return false;
      this.lead = null;
      this.correction = { seat: -1, x: 0, y: 0 };
    }
    this.releasedAt = null;
    if (p.step) return false;

    const d = DIRS[dir];
    const tx = p.x + d.x;
    const ty = p.y + d.y;
    if (!walkable(state, tx, ty)) return false;

    this.lead = {
      seat,
      dir,
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
      const releasedLongEnough = this.releasedAt !== null && now - this.releasedAt >= RELEASE_GRACE_MS;
      if (releasedLongEnough && !reached && !stepping && !movedElsewhere) {
        // The server never took the move: stop drawing a step that does not exist.
        this.lead = null;
        this.correction = { seat: -1, x: 0, y: 0 };
        this.releasedAt = null;
        justFinished = true;
      } else if (reached || stepping || movedElsewhere || now >= lead.deadline) {
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
    this.releasedAt = null;
    this.correction =
      Math.hypot(dx, dy) <= MAX_CORRECTION_CELLS ? { seat: lead.seat, x: dx, y: dy } : { seat: -1, x: 0, y: 0 };
  }
}
