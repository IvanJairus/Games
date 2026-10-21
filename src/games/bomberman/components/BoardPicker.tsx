import { boardFor, type BoardSize } from '../engine/types';

const LABELS: Record<BoardSize, string> = { kecil: 'Kecil', besar: 'Besar', luas: 'Luas' };

interface BoardPickerProps {
  seats: number;
  value: BoardSize;
  onChange: (size: BoardSize) => void;
}

/**
 * Arena geometry chosen next to the seat count, because the two are tied together. The
 * grid is printed on each option so the tradeoff is a number the player can see rather
 * than a surprise after the match starts. The widest board only exists for four seats;
 * for a duel it would be the same 15x13 as `besar`.
 */
export function BoardPicker({ seats, value, onChange }: BoardPickerProps) {
  const sizes: BoardSize[] = seats >= 4 ? ['kecil', 'besar', 'luas'] : ['kecil', 'besar'];
  return (
    <div className="bm-pick__row">
      {sizes.map((size) => {
        const board = boardFor(seats, size);
        return (
          <button
            key={size}
            type="button"
            aria-pressed={value === size}
            onClick={() => onChange(size)}
            data-testid={`bomberman-size-${size}`}
          >
            {LABELS[size]} {board.cols} x {board.rows}
          </button>
        );
      })}
    </div>
  );
}
