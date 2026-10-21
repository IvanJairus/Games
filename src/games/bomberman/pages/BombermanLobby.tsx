import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createOnlineRoom, generateRoomCode } from '../../common/multiplayer';
import { activeTransport } from '../../../lib/transport';
import { getStoredPlayerName, isSupabaseConfigured, setStoredPlayerName } from '../../../lib/supabase';
import { BOMBER_BOT_LEVELS } from '../engine/ai';
import { characterById } from '../sprites';
import { readCharId, writeCharId } from '../charPreference';
import { boardFor, type BoardSize } from '../engine/types';
import { CharacterPicker } from '../components/CharacterPicker';
import { BoardPicker } from '../components/BoardPicker';

type Tab = 'solo' | 'online';

/** Same alphabet generateRoomCode() uses: no I, O, or 0/1 to confuse over a chat message. */
const CODE_ALPHABET = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

const cleanCode = (raw: string): string => (raw.toUpperCase().match(CODE_ALPHABET) ?? []).slice(0, 6).join('');

/**
 * Lobby for the arena. It follows the shape the other four games use: a stored nickname,
 * a create-room action that writes nothing until it succeeds, a six-character join code,
 * and every online control disabled when no game server is configured.
 */
export function BombermanLobby() {
  const navigate = useNavigate();
  // The Worker door carries a room on its own. Supabase is still used for the match row and
  // the result history when configured, but it is no longer a prerequisite for playing.
  const doorMode = activeTransport() === 'cloudflare';
  const online = isSupabaseConfigured() || doorMode;
  const [tab, setTab] = useState<Tab>('solo');
  const [name, setName] = useState(getStoredPlayerName());
  const [seats, setSeats] = useState(2);
  const [size, setSize] = useState<BoardSize>('kecil');
  const [teams, setTeams] = useState(false);
  const [charId, setCharId] = useState(readCharId);
  const pickChar = (id: string): void => {
    setCharId(id);
    writeCharId(id);
  };
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remember = (value: string): void => {
    setName(value);
    setStoredPlayerName(value);
  };

  const create = async (): Promise<void> => {
    const host = name.trim();
    if (!host) {
      setError('Isi nama pemain dulu.');
      return;
    }
    setStoredPlayerName(host);
    setBusy(true);
    setError('');
    const board = boardFor(seats, size);
    const teamMode = seats === 4 && teams;
    try {
      let roomCode: string;
      if (doorMode) {
        // The Worker creates the room on the first ticket mint, so the code can be generated
        // here. The Supabase row is best-effort: it is what makes the result history work,
        // not what makes the match playable.
        roomCode = generateRoomCode();
        try {
          await createOnlineRoom({
            gameType: 'bomberman',
            maxPlayers: board.seats,
            hostName: host,
            initialState: { gameType: 'bomberman', seats: board.seats, size, teams: teamMode },
            roomCode,
          });
        } catch (err) {
          console.warn('[bomberman] baris riwayat Supabase tidak dibuat; room Worker tetap jalan', err);
        }
      } else {
        ({ roomCode } = await createOnlineRoom({
          gameType: 'bomberman',
          maxPlayers: board.seats,
          hostName: host,
          initialState: { gameType: 'bomberman', seats: board.seats, size, teams: teamMode },
        }));
      }
      // The Worker mints the first ticket from this URL. Board settings are part of the
      // room, so the Durable Object can cap seats before a second player connects.
      navigate(`/bomberman/m/${roomCode}?seats=${board.seats}&size=${size}&teams=${teamMode ? 1 : 0}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room gagal dibuat.');
    } finally {
      setBusy(false);
    }
  };

  const join = (): void => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Kode room enam karakter.');
      return;
    }
    if (!name.trim()) {
      setError('Isi nama pemain dulu.');
      return;
    }
    setStoredPlayerName(name.trim());
    navigate(`/bomberman/m/${clean}`);
  };

  return (
    <div className="bm-page" data-testid="bomberman-lobby">
      <div className="bm-page__inner">
        <Link className="bm-back bm-back--page" to="/">
          <span aria-hidden="true">&larr;</span> <span className="bm-back__label">/games/</span>
        </Link>
        <h2>Bomberman &middot; Arena Bata Lunak</h2>
        <p className="lede">
          Tanam bom, hancurkan bata lunak, dan keluar dari jangkauan api sebelum sumburnya habis.
          Enam karakter, tiga lantai yang diacak tiap pertandingan, dan ledakan berantai.
        </p>

        <div className="bm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'is-on' : ''} onClick={() => setTab('solo')} data-testid="bomberman-tab-solo">
            Solo &amp; hotseat
          </button>
          <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'is-on' : ''} onClick={() => setTab('online')} data-testid="bomberman-tab-online">
            Online 2-4 pemain
          </button>
        </div>

        <fieldset className="bm-pick">
          <legend>Karakter kamu</legend>
          <CharacterPicker value={charId} onChange={pickChar} />
          <p className="bm-note">{characterById(charId).blurb}</p>
        </fieldset>

        {tab === 'solo' ? (
          <fieldset className="bm-pick">
            <legend>Latihan melawan bot</legend>
            <div className="bm-pick__row">
              {BOMBER_BOT_LEVELS.map((l) => (
                <Link key={l.id} to={`/bomberman/local?bot=${l.id}&char=${charId}`} data-testid={`bomberman-lobby-${l.id}`}>
                  {l.label}
                </Link>
              ))}
            </div>
            <p className="bm-note">{BOMBER_BOT_LEVELS.map((l) => `${l.label}: ${l.note}`).join(' ')}</p>
          </fieldset>
        ) : (
          <>
            <fieldset className="bm-pick">
              <legend>Nama pemain</legend>
              <input className="bm-code" style={{ letterSpacing: 1, fontSize: 16 }} value={name} maxLength={16} onChange={(e) => remember(e.target.value)} placeholder="Nama kamu" data-testid="bomberman-name" />
            </fieldset>

            <fieldset className="bm-pick">
              <legend>Kursi dan papan</legend>
              <div className="bm-pick__row">
                {[2, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={seats === n}
                    onClick={() => {
                      setSeats(n);
                      // The widest board has no duel twin, so the choice follows the seat
                      // count instead of leaving a size button that is no longer offered.
                      if (n < 4 && size === 'luas') setSize('besar');
                    }}
                    data-testid={`bomberman-seats-${n}`}
                  >
                    {n} kursi
                  </button>
                ))}
              </div>
              <div className="bm-field">
                <span className="bm-field__label">Ukuran arena</span>
                <BoardPicker seats={seats} value={size} onChange={setSize} />
              </div>
              {seats === 4 && (
                <div className="bm-field">
                  <label className="bm-field__label" htmlFor="bm-teams">
                    <input
                      id="bm-teams"
                      type="checkbox"
                      checked={teams}
                      onChange={(e) => setTeams(e.target.checked)}
                      data-testid="bomberman-teams"
                    />{' '}
                    Mode tim 2v2
                  </label>
                  <p className="bm-note">Kursi 1 dan 3 satu tim, kursi 2 dan 4 tim lain. Api rekan tidak melukai, bom sendiri tetap.</p>
                </div>
              )}
              <p className="bm-note">
                Kursi yang tidak diisi pemain manusia akan diisi bot, jadi room 4 kursi bisa berjalan dengan 2 manusia.
              </p>
            </fieldset>

            <button className="bm-go" type="button" disabled={!online || busy} onClick={() => void create()} data-testid="bomberman-create">
              {busy ? 'Membuat room...' : 'Buat room baru'}
            </button>

            <fieldset className="bm-pick" style={{ marginTop: 12 }}>
              <legend>Gabung dengan kode</legend>
              <div className="bm-row">
                <input
                  className="bm-code"
                  style={{ maxWidth: 200 }}
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                  placeholder="ABC123"
                  aria-label="Kode room"
                  data-testid="bomberman-code"
                />
                <button type="button" disabled={!online} onClick={join} data-testid="bomberman-join">
                  Gabung
                </button>
              </div>
            </fieldset>

            {!online && <p className="bm-note">Mode online butuh server permainan. Mode solo tetap bisa dimainkan.</p>}
            <p className="bm-error" data-testid="bomberman-lobby-error">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
