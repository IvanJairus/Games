import React from 'react';
import { Board } from './Board';
import { BattleshipState, FLEET, Placement } from '../engine/types';
import { SeatReport } from '../engine';

export interface FinishBoard {
  seat: 0 | 1;
  label: string;
  placements: Placement[] | null;
}

export interface FinishBlockProps {
  state: BattleshipState;
  boards: FinishBoard[];
  reports: SeatReport[];
  verifying: boolean;
  onReset: () => void;
  resetLabel?: string;
  waitingNote?: string | null;
  action?: React.ReactNode;
}

export const FinishBlock: React.FC<FinishBlockProps> = ({
  state,
  boards,
  reports,
  verifying,
  onReset,
  resetLabel = 'Main lagi',
  waitingNote = null,
  action = null,
}) => {
  const winner = state.winner;
  const loser = winner === null ? null : ((winner === 0 ? 1 : 0) as 0 | 1);
  const failed = reports.filter((r) => !r.ok);

  return (
    <section className="bs-board bs-fade" style={{ marginTop: '18px' }} aria-live="polite">
      <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px' }}>
        {winner === null
          ? 'Berakhir tanpa armada yang musnah'
          : `${boards[winner]?.label || `Pemain ${winner + 1}`} menang dalam ${state.shotsTaken[winner]} tembakan`}
      </h2>

      <p style={{ fontSize: '13px', color: 'var(--ink-dim)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {loser === null
          ? 'Tidak ada pihak yang kehilangan seluruh armadanya.'
          : `Armada ${boards[loser]?.label || `Pemain ${loser + 1}`} habis. Total tembakan: ${state.shotsTaken[0]} dan ${state.shotsTaken[1]}.`}
      </p>

      {verifying && (
        <p className="bs-turn" role="status">
          Memeriksa kecocokan klaim tembakan dengan armada yang diungkap
        </p>
      )}

      {waitingNote && (
        <div className="bs-note" role="status">
          {waitingNote}
        </div>
      )}

      {failed.length > 0 && (
        <div className="bs-note" data-tone="danger" role="alert">
          <div>
            <strong>Klaim tidak cocok.</strong> {failed.map((r) => `${r.reasons[0]}`).join(' ')}
          </div>
        </div>
      )}

      {!verifying && failed.length === 0 && reports.length > 0 && (
        <div className="bs-note" role="status">
          Semua klaim tembakan cocok dengan armada yang diungkap kedua pihak.
        </div>
      )}

      {action}

      {boards.map((board) =>
        board.placements ? (
          <div key={board.seat} style={{ marginTop: '14px' }}>
            <div className="bs-board-title">
              <span>{board.label}</span>
              <span>
                {board.placements.length}/{FLEET.length} kapal
              </span>
            </div>
            <Board
              label={`Bukti armada ${board.label}`}
              hint="diungkap setelah selesai"
              marks={state.marks[board.seat]}
              ships={board.placements}
              sunkKinds={state.sunk[board.seat]}
            />
          </div>
        ) : null
      )}

      <div className="bs-actions">
        <button type="button" className="bs-btn" data-tone="primary" onClick={onReset}>
          {resetLabel}
        </button>
      </div>
    </section>
  );
};
