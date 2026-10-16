import { boardFor, type BoardSize } from '../engine/types';

const SIZES: BoardSize[] = ['kecil', 'besar'];

interface BoardPickerProps {
  seats: number;
  value: BoardSize;
  onChange: (size: BoardSize) => void;
}

/**
 * Arena geometry chosen next to the seat count, because the two are tied together: every
 * seat count has exactly one small and one large board. The grid is printed on each option
 * so the tradeoff is a number the player can see rather than a surprise after the match
 * starts.
 */
export function BoardPicker({ seats, value, onChange }: BoardPickerProps) {
  return (
    <div className="bm-pick__row">
      {SIZES.map((size) => {
        const board = boardFor(seats, size);
        return (
          <button
            key={size}
            type="button"
            aria-pressed={value === size}
            onClick={() => onChange(size)}
            data-testid={`bomberman-size-${size}`}
          >
            {size === 'kecil' ? 'Kecil' : 'Besar'} {board.cols} x {board.rows}
          </button>
        );
      })}
    </div>
  );
}
