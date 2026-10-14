import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../slap-arena.css';
import { getStoredPlayerName, setStoredPlayerName } from '../../../lib/supabase';
import { createOnlineRoom } from '../../common/multiplayer';

const COLOR_OPTIONS = [
  { label: 'Biru Laut', hex: '#4dabf7' },
  { label: 'Merah Cabai', hex: '#ff5d5d' },
  { label: 'Hijau Mint', hex: '#6fe3b0' },
  { label: 'Kuning Madu', hex: '#ffcf5c' },
  { label: 'Ungu Anggur', hex: '#b197fc' },
  { label: 'Oranye Jeruk', hex: '#ffa94d' },
];

const readSavedColor = () => {
  try {
    const raw = window.localStorage.getItem('slap_player_color');
    return raw && COLOR_OPTIONS.some((c) => c.hex === raw) ? raw : COLOR_OPTIONS[0].hex;
  } catch {
    return COLOR_OPTIONS[0].hex;
  }
};

/** The mascot is drawn, not a photo: it recolours instantly and costs one request. */
const Mascot: React.FC<{ color: string }> = ({ color }) => (
  <svg className="sa-lobby__art" viewBox="0 0 260 220" role="img" aria-label="Brawler pulau tampol">
    <defs>
      <linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bfe8ff" />
        <stop offset="100%" stopColor="#eaf9dc" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="260" height="220" rx="22" fill="url(#sa-sky)" />
    <ellipse cx="52" cy="44" rx="26" ry="12" fill="#fff" opacity="0.9" />
    <ellipse cx="210" cy="60" rx="22" ry="10" fill="#fff" opacity="0.9" />
    <ellipse cx="130" cy="186" rx="86" ry="22" fill="#5fd06a" stroke="#2a1b33" strokeWidth="5" />
    <ellipse cx="130" cy="182" rx="62" ry="14" fill="#3fae52" opacity="0.55" />
    <path d="M60 200h140l-18 16H78z" fill="#a2683c" stroke="#2a1b33" strokeWidth="5" strokeLinejoin="round" />

    <g stroke="#2a1b33" strokeWidth="5.5" strokeLinejoin="round">
      <ellipse cx="130" cy="176" rx="34" ry="9" fill="#2a1b33" opacity="0.16" stroke="none" />
      <rect x="104" y="150" width="18" height="22" rx="9" fill={color} />
      <rect x="138" y="150" width="18" height="22" rx="9" fill={color} />
      <rect x="96" y="96" width="68" height="66" rx="30" fill={color} />
      <circle cx="130" cy="72" r="34" fill="#ffd9b3" />
      <path d="M96 66a34 34 0 0 1 68 0z" fill={color} />
      <circle cx="130" cy="30" r="9" fill="#fff6e5" />
      <circle cx="118" cy="74" r="6.5" fill="#2a1b33" stroke="none" />
      <circle cx="142" cy="74" r="6.5" fill="#2a1b33" stroke="none" />
      <path d="M120 88q10 8 20 0" fill="none" strokeLinecap="round" />
      <circle cx="78" cy="118" r="19" fill="#ff5d5d" />
      <circle cx="182" cy="112" r="22" fill="#ff5d5d" />
    </g>
    <g fill="#fff" opacity="0.55">
      <circle cx="72" cy="112" r="5" />
      <circle cx="175" cy="105" r="6" />
    </g>
  </svg>
);

export const SlapArenaLobby: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState(
    () => getStoredPlayerName() || `Brawler ${Math.floor(100 + Math.random() * 900)}`
  );
  const [color, setColor] = useState(readSavedColor);
  const [joinCode, setJoinCode] = useState('');
  const [tab, setTab] = useState<'solo' | 'online'>('solo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = (newName: string) => {
    setStoredPlayerName(newName);
    try {
      window.localStorage.setItem('slap_player_color', color);
    } catch {
      /* private mode */
    }
  };

  const startSolo = (e: React.FormEvent) => {
    e.preventDefault();
    save(name.trim() || 'Brawler');
    navigate('/slap-arena/solo');
  };

  const createRoom = async () => {
    setBusy(true);
    setError('');
    const cleanName = name.trim() || 'Tuan Rumah';
    save(cleanName);
    try {
      const { roomCode } = await createOnlineRoom({
        gameType: 'slap-arena',
        maxPlayers: 4,
        hostName: cleanName,
        initialState: { gameType: 'slap-arena', hostColor: color, scoreToWin: 3 },
      });
      navigate(`/slap-arena/m/${roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat room. Periksa koneksi internetmu.');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) {
      setError('Kode room terdiri dari 6 huruf atau angka.');
      return;
    }
    setError('');
    save(name.trim() || 'Brawler');
    navigate(`/slap-arena/m/${code}`);
  };

  return (
    <div className="sa sa-lobby" data-testid="slap-lobby">
      <header className="sa-lobby__hero">
        <div>
          <span className="sa-lobby__badge">PULAU TAMPOL 3D</span>
          <h1>Slap Arena</h1>
          <p className="sa-lobby__lede">
            Empat brawler, satu pulau melayang, tanpa senjata. Tampar dan terjang lawan sampai tercebur.
            Rebut tiga ronde untuk jadi juara pulau.
          </p>
        </div>
        <Mascot color={color} />
      </header>

      <section className="sa-section" aria-labelledby="sa-profile">
        <h2 id="sa-profile">Kartermu</h2>
        <div className="sa-fields">
          <div className="sa-field">
            <label htmlFor="sa-name">Nama brawler</label>
            <input
              id="sa-name"
              className="sa-input"
              type="text"
              value={name}
              maxLength={14}
              autoComplete="off"
              data-testid="slap-name-input"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="sa-field">
            <span className="sa-label" id="sa-color-label">
              Warna kostum
            </span>
            <div className="sa-swatches" role="group" aria-labelledby="sa-color-label">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className="sa-swatch"
                  style={{ '--c': c.hex } as React.CSSProperties}
                  aria-label={c.label}
                  aria-pressed={color === c.hex}
                  data-testid={`slap-color-${c.hex.slice(1)}`}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="sa-tabs" role="tablist" aria-label="Mode permainan">
        <button
          type="button"
          role="tab"
          id="sa-tab-solo"
          aria-selected={tab === 'solo'}
          aria-controls="sa-panel-solo"
          className="sa-tab"
          data-testid="slap-tab-solo"
          onClick={() => {
            setTab('solo');
            setError('');
          }}
        >
          Solo vs 3 Bot
        </button>
        <button
          type="button"
          role="tab"
          id="sa-tab-online"
          aria-selected={tab === 'online'}
          aria-controls="sa-panel-online"
          className="sa-tab"
          data-testid="slap-tab-online"
          onClick={() => {
            setTab('online');
            setError('');
          }}
        >
          Online 2-4 Pemain
        </button>
      </div>

      {error && (
        <div className="sa-alert" role="alert" data-testid="slap-error">
          {error}
        </div>
      )}

      {tab === 'solo' ? (
        <section className="sa-modes" id="sa-panel-solo" role="tabpanel" aria-labelledby="sa-tab-solo">
          <div className="sa-mode">
            <div>
              <h3>Langsung terjun</h3>
              <p>Satu ronde melawan tiga bot berkarakter: Bob yang berani, Sam yang cepat, Sue yang hati-hati. Tidak perlu antre, tidak perlu kode.</p>
            </div>
            <button type="button" className="sa-btn sa-btn--primary" data-testid="slap-start-solo" onClick={startSolo}>
              Mulai sekarang
            </button>
          </div>
        </section>
      ) : (
        <section className="sa-modes" id="sa-panel-online" role="tabpanel" aria-labelledby="sa-tab-online">
          <div className="sa-mode">
            <div>
              <h3>Buat room</h3>
              <p>Kamu jadi tuan rumah dan pemilik simulasi. Bagikan kode enam karakter ke maksimal tiga teman.</p>
            </div>
            <button
              type="button"
              className="sa-btn sa-btn--primary"
              data-testid="slap-create-room"
              onClick={createRoom}
              disabled={busy}
            >
              {busy ? 'Membuat room...' : 'Buat room'}
            </button>
          </div>
          <form className="sa-mode" onSubmit={joinRoom}>
            <div>
              <h3>Gabung room</h3>
              <p>Tulis kode dari tuan rumah. Kamu langsung masuk begitu roomnya siap.</p>
            </div>
            <input
              className="sa-input sa-input--code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              inputMode="text"
              aria-label="Kode room"
              data-testid="slap-join-input"
            />
            <button type="submit" className="sa-btn" data-testid="slap-join-room" disabled={busy}>
              Gabung
            </button>
          </form>
        </section>
      )}

      <section className="sa-section" aria-labelledby="sa-howto">
        <h2 id="sa-howto">Cara main</h2>
        <div className="sa-tips">
          <div>
            <strong>Keyboard</strong>
            <ul>
              <li>WASD atau tombol panah: jalan</li>
              <li>Spasi: tampar</li>
              <li>Shift: terjang</li>
            </ul>
          </div>
          <div>
            <strong>Layar sentuh</strong>
            <ul>
              <li>Tempel jempol kiri di sisi layar: stik muncul di sana</li>
              <li>Tombol merah besar: tampar</li>
              <li>Tombol biru: terjang</li>
            </ul>
          </div>
          <div>
            <strong>Aturan pulau</strong>
            <ul>
              <li>Garis merah putus-putus artinya jurang</li>
              <li>Terjang melaju cepat, lalu jeda 1,8 detik sebelum bisa dipakai lagi</li>
              <li>Bot yang terdesak akan mundur ke tengah</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
