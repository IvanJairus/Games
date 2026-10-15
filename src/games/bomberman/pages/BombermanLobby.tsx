import { Link } from 'react-router-dom';

import { BOMBER_BOT_LEVELS } from '../engine/ai';
import { CHARACTERS } from '../sprites';

/**
 * Landing page for the game. The online tabs arrive with the match page; this file is
 * the solo half so the arena can be played before the network layer exists.
 */
export function BombermanLobby() {
  return (
    <div className="bm-page" data-testid="bomberman-lobby">
      <div className="bm-page__inner">
        <Link className="bm-back bm-back--page" to="/">
          &larr; /games/
        </Link>
        <h2>Bomberman &middot; Arena Bata Lunak</h2>
        <p className="lede">
          Tanam bom, hancurkan bata lunak, dan keluar dari jangkauan api sebelum sumburnya habis.
          Enam karakter, tiga lantai yang diacak tiap pertandingan.
        </p>

        <fieldset className="bm-pick">
          <legend>Latihan melawan bot</legend>
          <div className="bm-pick__row">
            {BOMBER_BOT_LEVELS.map((l) => (
              <Link key={l.id} to={`/bomberman/local?bot=${l.id}`} data-testid={`bomberman-lobby-${l.id}`}>
                {l.label}
              </Link>
            ))}
          </div>
          <p className="bm-note">{BOMBER_BOT_LEVELS.map((l) => `${l.label}: ${l.note}`).join(' ')}</p>
        </fieldset>

        <fieldset className="bm-pick">
          <legend>Pilih karakter dulu</legend>
          <div className="bm-pick__row">
            {CHARACTERS.map((c) => (
              <Link key={c.id} to={`/bomberman/local?char=${c.id}`} data-testid={`bomberman-lobby-char-${c.id}`}>
                {c.label}
              </Link>
            ))}
          </div>
          <p className="bm-note">Karakter juga bisa diacak di layar latihan.</p>
        </fieldset>
      </div>
    </div>
  );
}
