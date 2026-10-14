import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, LogIn, Plus, Users } from 'lucide-react';
import { createTicTacToeGame } from '../engine';
import { createOnlineRoom } from '../../common/multiplayer';
import {
  isSupabaseConfigured,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../../lib/supabase';

export const TicTacToeLobby: React.FC = () => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState(() => getStoredPlayerName() || 'Pemain ' + Math.floor(Math.random() * 900 + 100));
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    setStoredPlayerName(val);
  };

  const handleCreateOnline = async () => {
    if (!isConfigured) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const initialGame = createTicTacToeGame();
      const { roomCode: code } = await createOnlineRoom({
        gameType: 'tic-tac-toe',
        maxPlayers: 2,
        hostName: playerName || 'Pemain 1',
        initialState: initialGame,
      });

      navigate(`/tic-tac-toe/m/${code}`);
    } catch (err: any) {
      setCreateError(err.message || 'Gagal membuat room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinOnline = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/tic-tac-toe/m/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: 'clamp(16px, 4vw, 28px) auto', padding: '0 16px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
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
      </header>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r3)',
          padding: 'clamp(20px, 4vw, 32px)',
          boxShadow: '0 4px 16px rgba(28, 25, 23, 0.04)',
        }}
      >
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'clamp(18px, 4.5vw, 22px)', letterSpacing: '-0.02em', margin: 0, fontWeight: 700, color: 'var(--ink)' }}>
              Tic Tac Toe <span style={{ fontWeight: 400, color: 'var(--ink-dim)' }}>· Mode No-Draw</span>
            </h1>
            <span
              style={{
                font: '10px/1 var(--mono)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                color: 'var(--gold)',
                background: 'var(--gold-tint)',
                border: '1px solid var(--gold-border)',
                padding: '3px 7px',
                borderRadius: 'var(--r2)',
                whiteSpace: 'nowrap',
              }}
            >
              Anti-Seri
            </span>
          </div>
          <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Maksimal 3 bidak aktif per pemain. Bidak ke-4 otomatis melenyapkan bidak tertua (FIFO). Mustahil seri!
          </p>
        </div>

        {/* Player Name Input */}
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 16px',
            background: 'var(--bg-stage)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ font: '11.5px/1 var(--mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
            Nama Pemain:
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Nama Anda"
            maxLength={20}
            style={{
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              font: '13px/1.2 var(--mono)',
              color: 'var(--ink)',
              outline: 'none',
              width: '180px',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {/* Hotseat Local Option */}
          <div
            style={{
              background: 'var(--bg-stage)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r2)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Users size={16} color="var(--gold)" />
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                  Hotseat Lokal
                </h2>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
                Bermain bersama di satu layar bergantian. Pilihan cepat untuk bermain langsung bersama teman di sebelah Anda.
              </p>
            </div>
            <Link
              to="/tic-tac-toe/local"
              data-testid="tictactoe-local-play-link"
              style={{
                display: 'block',
                padding: '11px',
                backgroundColor: 'var(--gold)',
                color: '#ffffff',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                letterSpacing: '.04em',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              Mulai Main Lokal →
            </Link>
          </div>

          {/* Multiplayer Online Option */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--r2)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Globe size={16} color="var(--gold)" />
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                  Multiplayer Online
                </h2>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                Tanding jarak jauh 2 pemain secara real-time via WebSocket. Bagikan link atau room code ke teman.
              </p>

              {createError && (
                <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r2)', color: '#991b1b', fontSize: '12px', marginBottom: '12px' }}>
                  {createError}
                </div>
              )}

              {/* Create Room Section */}
              <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={handleCreateOnline}
                  disabled={isCreating}
                  data-testid="tictactoe-create-room-btn"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'var(--ink)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r2)',
                    font: '11.5px/1 var(--mono)',
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Plus size={14} />
                  {isCreating ? 'Membuat Room...' : 'Buat Room Baru'}
                </button>
              </div>

              {/* Join Room Section */}
              <form onSubmit={handleJoinOnline}>
                <span style={{ display: 'block', font: '11px/1 var(--mono)', color: 'var(--ink-dim)', marginBottom: '8px' }}>
                  Atau gabung dengan kode:
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="KODE"
                    maxLength={6}
                    data-testid="tictactoe-join-code-input"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '8px 10px',
                      background: 'var(--bg-stage)',
                      border: '1px solid var(--line-strong)',
                      borderRadius: 'var(--r2)',
                      font: '13px/1.2 var(--mono)',
                      color: 'var(--ink)',
                      textAlign: 'center',
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!roomCode.trim()}
                    data-testid="tictactoe-join-room-btn"
                    style={{
                      padding: '8px 14px',
                      background: '#ffffff',
                      color: 'var(--ink)',
                      border: '1px solid var(--line-strong)',
                      borderRadius: 'var(--r2)',
                      font: '11.5px/1 var(--mono)',
                      fontWeight: 600,
                      cursor: !roomCode.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <LogIn size={13} /> Gabung
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
