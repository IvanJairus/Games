import { CHARACTERS, CHAR_IDS, spriteMarkup } from '../sprites';

interface CharacterPickerProps {
  value: string;
  onChange: (id: string) => void;
}

/**
 * The cast, drawn rather than listed.
 *
 * A name like "Bola Luncur" does not tell a player what the robot looks like, and the
 * whole art contract for these sprites is that the silhouette reads at 32 px, so the
 * picker can show the actual character at that size. The markup comes from the same
 * function the arena draws with, which means a preview cannot drift away from the sprite
 * a player then controls.
 */
export function CharacterPicker({ value, onChange }: CharacterPickerProps) {
  return (
    <div className="bm-pick__row bm-chars" role="group" aria-label="Karakter">
      {CHARACTERS.map((c) => (
        <button
          key={c.id}
          type="button"
          className="bm-char"
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
          data-testid={`bomberman-char-${c.id}`}
        >
          <span
            className="bm-char__art"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: spriteMarkup(c.id, 'idle', 'down') }}
          />
          <span className="bm-char__label">{c.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="bm-char bm-char--random"
        onClick={() => onChange(CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)])}
        data-testid="bomberman-char-random"
      >
        <span className="bm-char__art" aria-hidden="true">
          <svg className="bm-sprite" viewBox="0 -16 64 92">
            <rect x="10" y="16" width="44" height="44" rx="12" fill="#fff6e5" stroke="#2a1b33" strokeWidth="3" />
            <circle cx="23" cy="29" r="4" fill="#2a1b33" />
            <circle cx="41" cy="29" r="4" fill="#2a1b33" />
            <circle cx="32" cy="47" r="4" fill="#2a1b33" />
          </svg>
        </span>
        <span className="bm-char__label">Acak</span>
      </button>
    </div>
  );
}
