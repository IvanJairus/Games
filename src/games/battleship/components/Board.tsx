import React, { useCallback, useRef } from 'react';
import {
  BOARD_SIZE,
  Mark,
  Placement,
  ShipKind,
  cellKey,
  cellLabel,
  colOf,
  rowOf,
} from '../engine/types';

export interface BoardProps {
  label: string;
  hint: string;
  marks: Record<string, Mark>;
  ships?: Placement[];
  sunkKinds?: ShipKind[];
  selected?: number | null;
  interactive?: boolean;
  active?: boolean;
  variant?: 'own' | 'target';
  lastResolved?: number | null;
  onPick?: (cell: number) => void;
}

const stateLabel = (mark: Mark | undefined): string =>
  mark === 'hit' ? 'kena' : mark === 'miss' ? 'meleset' : 'belum ditembak';

const SHIP_CODE: Record<ShipKind, string> = {
  Battleship: 'BS',
  Cruiser: 'CR',
  Frigate: 'FR',
  Submarine: 'SB',
  Patrol: 'PT',
};

interface ChartMark {
  kind: ShipKind;
  span: number;
  axis: 'h' | 'v';
  sunk: boolean;
}

// Satu tanda per kapal, digantung di petak pertamanya supaya rentangnya ikut lebar petak.
const chartMarks = (ships: Placement[] | undefined, sunkKinds: ShipKind[]): Map<number, ChartMark> => {
  const out = new Map<number, ChartMark>();
  (ships || []).forEach((p) => {
    if (p.cells.length === 0) return;
    const cells = [...p.cells].sort((a, b) => a - b);
    out.set(cells[0], {
      kind: p.kind,
      span: cells.length,
      axis: cells.length > 1 && cells[1] - cells[0] === BOARD_SIZE ? 'v' : 'h',
      sunk: sunkKinds.includes(p.kind),
    });
  });
  return out;
};

export const Board: React.FC<BoardProps> = ({
  label,
  hint,
  marks,
  ships,
  sunkKinds = [],
  selected = null,
  interactive = false,
  active = false,
  variant = 'own',
  lastResolved = null,
  onPick,
}) => {
  const [cursor, setCursor] = React.useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const shipCells = new Set((ships || []).flatMap((p) => p.cells));
  const sunkCells = new Set(
    (ships || []).filter((p) => sunkKinds.includes(p.kind)).flatMap((p) => p.cells)
  );

  const focusCell = useCallback((cell: number) => {
    setCursor(cell);
    const node = gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`);
    node?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const row = rowOf(cursor);
    const col = colOf(cursor);
    let next = cursor;

    if (event.key === 'ArrowUp') next = row > 0 ? cursor - BOARD_SIZE : cursor;
    else if (event.key === 'ArrowDown') next = row < BOARD_SIZE - 1 ? cursor + BOARD_SIZE : cursor;
    else if (event.key === 'ArrowLeft') next = col > 0 ? cursor - 1 : cursor;
    else if (event.key === 'ArrowRight') next = col < BOARD_SIZE - 1 ? cursor + 1 : cursor;
    else if (event.key === 'Enter' || event.key === ' ') {
      if (interactive && onPick && !marks[cellKey(cursor)]) {
        event.preventDefault();
        onPick(cursor);
      }
      return;
    } else return;

    event.preventDefault();
    if (next !== cursor) focusCell(next);
  };

  const cells: React.ReactNode[] = [];
  const charts = chartMarks(ships, sunkKinds);
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowCells = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = row * BOARD_SIZE + col;
      const mark = marks[cellKey(cell)];
      const hasShip = shipCells.has(cell);
      const sunk = sunkCells.has(cell);
      const chart = charts.get(cell);

      rowCells.push(
        <button
          type="button"
          key={cell}
          data-cell={cell}
          className="bs-cell"
          data-mark={mark}
          data-ship={hasShip || undefined}
          data-sunk={sunk || undefined}
          data-selected={selected === cell || undefined}
          data-cursor={cursor === cell || undefined}
          data-impact={lastResolved === cell || undefined}
          data-static={!interactive || Boolean(mark) || undefined}
          disabled={!interactive}
          tabIndex={cursor === cell ? 0 : -1}
          aria-disabled={!interactive || Boolean(mark) || undefined}
          aria-label={`${cellLabel(cell)}, ${stateLabel(mark)}${hasShip ? ', ada kapal' : ''}`}
          onClick={() => {
            setCursor(cell);
            if (interactive && onPick && !mark) onPick(cell);
          }}
        >
          {chart && (
            <span
              className="bs-chart"
              data-axis={chart.axis}
              data-sunk={chart.sunk || undefined}
              data-chart-kind={chart.kind}
              style={{ '--bs-span': String(chart.span) } as React.CSSProperties}
              aria-hidden="true"
            >
              {chart.sunk ? (
                <svg className="bs-chart__wreck" viewBox="0 0 14 14" focusable="false">
                  <path d="M2 11.5h10M7 2v9.5M4 5.5h6" />
                </svg>
              ) : (
                <span className="bs-chart__code">{`${SHIP_CODE[chart.kind]} ${chart.span}`}</span>
              )}
            </span>
          )}
        </button>
      );
    }
    cells.push(
      <div className="bs-row" role="row" key={row}>
        {rowCells}
      </div>
    );
  }

  return (
    <section
      className={`bs-board ${variant === 'target' ? 'bs-board-target' : 'bs-board-own'}`}
      data-active={active || undefined}
      aria-label={label}
    >
      <div className="bs-board-title">
        <span>{label}</span>
        <span>{hint}</span>
      </div>
      <div
        className="bs-grid"
        ref={gridRef}
        role="grid"
        aria-label={`${label}, papan 8 baris kali 8 kolom`}
        onKeyDown={onKeyDown}
      >
        {cells}
      </div>
      <div className="bs-coords" aria-hidden="true">
        {Array.from({ length: BOARD_SIZE }, (_, col) => (
          <span key={col}>{String.fromCharCode(65 + col)}</span>
        ))}
      </div>
    </section>
  );
};
