import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import {
  isSupabaseConfigured,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../../lib/supabase';
import { createOnlineRoom } from '../../common/multiplayer';
import { createInitialState } from '../engine';

export const BattleshipLobby: React.FC = () => {
  const navigate = useNavigate();
  const configured = isSupabaseConfigured();

  const [name, setName] = useState(() => getStoredPlayerName());
  const [roomInput, setRoomInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostRoom = async () => {
    if (!name.trim()) {
      setError('Isi nama pemain dulu sebelum membuat room.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setStoredPlayerName(name);
      const { roomCode } = await createOnlineRoom({
        gameType: 'battleship',
        maxPlayers: 2,
        hostName: name.trim(),
        initialState: createInitialState(),
      });
      navigate(`/battleship/m/${roomCode}`);
    } catch (err: any) {
      setError(err.message || 'Room online sedang tidak tersedia.');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = () => {
    const code = roomInput.trim().toUpperCase();
    if (!name.trim()) {
      setError('Isi nama pemain dulu sebelum bergabung.');
      return;
    }
    if (code.length !== 6) {
      setError('Kode room terdiri dari 6 karakter.');
      return;
    }
    setStoredPlayerName(name);
    navigate(`/battleship/m/${code}`);
  };

  return (
    <div className="bs-shell">
      <header className="bs-head">
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            font: '12px/1 var(--mono)',
            color: 'var(--ink-dim)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> /games/
        </Link>
        <span className="bs-chip">
          <Shield size={12} aria-hidden="true" /> 2 pemain
        </span>
      </header>

      <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
        Battleship <span style={{ fontWeight: 400, color: 'var(--ink-dim)' }}>· Kapal Tersembunyi</span>
      </h1>
      <p style={{ color: 'var(--ink-dim)', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6, maxWidth: '60ch' }}>
        Papan 8x8 dengan lima kapal. Susunan kapal tinggal di perangkat Anda dan yang dikirim ke server
        hanyalah komitmennya, jadi lawan tidak bisa mengintip dari jaringan. Setelah selesai, kedua pihak
        mengungkap susunannya dan klaim tembakan diperiksa otomatis.
      </p>

      {error && (
        <div className="bs-note" data-tone="alert" role="alert">
          {error}
        </div>
      )}

      <div className="bs-board" style={{ marginBottom: '16px' }}>
        <label
          htmlFor="bs-name"
          style={{ display: 'block', font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginBottom: '8px' }}
        >
          Nama pemain
        </label>
        <input
          id="bs-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama Anda"
          maxLength={20}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 12px',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r2)',
            background: '#ffffff',
            font: '14px/1.2 var(--sans)',
            color: 'var(--ink)',
          }}
        />

        <div className="bs-boards" style={{ marginTop: '14px' }}>
          <div>
            <div className="bs-board-title">
              <span>Online</span>
              <span>2 perangkat</span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                type="button"
                className="bs-btn"
                data-tone="primary"
                onClick={hostRoom}
                disabled={!configured || busy}
              >
                {busy ? 'Membuat room' : 'Buat Room Online'}
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="KODE"
                  aria-label="Kode room 6 karakter"
                  maxLength={6}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: '44px',
                    padding: '10px 12px',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 'var(--r2)',
                    font: '14px/1 var(--mono)',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                />
                <button
                  type="button"
                  className="bs-btn"
                  style={{ flex: '0 0 auto' }}
                  onClick={joinRoom}
                  disabled={!configured}
                >
                  Gabung
                </button>
              </div>
              {!configured && (
                <p style={{ font: '11px/1.5 var(--mono)', color: 'var(--ink-dim)', margin: 0 }}>
                  Mode online butuh Supabase. Yang tersedia sekarang: lokal di satu perangkat.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="bs-board-title">
              <span>Lokal</span>
              <span>1 perangkat</span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <Link to="/battleship/local?mode=solo" className="bs-btn" style={{ textDecoration: 'none' }}>
                Solo lawan AI
              </Link>
              <Link to="/battleship/local?mode=hotseat" className="bs-btn" style={{ textDecoration: 'none' }}>
                Dua pemain, satu perangkat
              </Link>
            </div>
          </div>
        </div>
      </div>

      <details style={{ marginBottom: '8px' }}>
        <summary style={{ font: '12px/1 var(--mono)', color: 'var(--ink)', cursor: 'pointer', padding: '6px 0' }}>
          Aturan main dan alasan kapalnya tidak dikirim
        </summary>
        <ol style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--ink-dim)', paddingLeft: '18px', marginTop: '8px' }}>
          <li>Tempatkan Battleship (4), Cruiser (3), Frigate (3), Submarine (2), dan Patrol (2) di papan 8x8.</li>
          <li>Tembak bergantian. Pemilik papan yang menilai tiap tembakan, karena hanya dia yang tahu susunannya.</li>
          <li>Sebelum bertanding, tiap pihak mengirim hash SHA-256 dari seed dan susunan kapalnya.</li>
          <li>Setelah selesai, kedua pihak mengungkap seed dan susunan. Klaim tembakan diperiksa terhadap susunan itu; kalau tidak cocok, halaman menandainya.</li>
        </ol>
      </details>
    </div>
  );
};
