import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createOnlineRoom } from '../../common/multiplayer';
import { createGame, getRecommendedGridSize } from '../engine';
import {
  isSupabaseConfigured,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../../lib/supabase';

export const WallgameLobby: React.FC = () => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState(() => getStoredPlayerName() || 'Pemain ' + Math.floor(Math.random() * 900 + 100));
  const [onlinePlayerCount, setOnlinePlayerCount] = useState<number>(2);
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
      const initialGame = createGame({
        playerCount: onlinePlayerCount,
        gridSize: getRecommendedGridSize(onlinePlayerCount),
        playerNames: [playerName || 'Host'],
      });

      const { roomCode } = await createOnlineRoom({
        gameType: 'wall-game',
        maxPlayers: onlinePlayerCount,
        hostName: playerName || 'Host',
        initialState: initialGame,
      });

      navigate(`/wall-game/m/${roomCode}`);
    } catch (err: any) {
      setCreateError(err.message || 'Gagal membuat room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinOnline = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/wall-game/m/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: '28px auto', padding: '0 16px' }}>
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
          <h1 style={{ fontSize: '22px', letterSpacing: '-0.02em', margin: 0, fontWeight: 700, color: 'var(--ink)' }}>
            WallGo <span style={{ fontWeight: 400, color: 'var(--ink-dim)' }}>· Race to the Golden Core</span>
          </h1>
          <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Game strategi balapan bidak ke pusat papan untuk 2 hingga 6 pemain.
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
          <label style={{ font: '11.5px/1 var(--mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-dim)' }}>
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
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)' }}>
                Hotseat Lokal
              </h2>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
                Bermain bersama di satu layar bergantian. Pilihan 2 hingga 6 pemain dengan posisi awal simetris.
              </p>
            </div>
            <Link
              to="/wall-game/local"
              data-testid="local-play-link"
              style={{
                display: 'block',
                padding: '10px',
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
              Main Lokal
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
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)' }}>
                Multiplayer Online
              </h2>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                Sinkronisasi match antar-perangkat via tautan atau kode room.
              </p>

              {createError && (
                <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r2)', color: '#991b1b', fontSize: '12px', marginBottom: '12px' }}>
                  {createError}
                </div>
              )}

              {/* Create Room Section */}
              <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-dim)' }}>Jumlah Pemain:</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setOnlinePlayerCount(num)}
                        style={{
                          width: '26px',
                          height: '26px',
                          border: `1px solid ${onlinePlayerCount === num ? 'var(--gold)' : 'var(--line)'}`,
                          background: onlinePlayerCount === num ? 'var(--gold-tint)' : '#ffffff',
                          color: onlinePlayerCount === num ? 'var(--gold)' : 'var(--ink)',
                          borderRadius: 'var(--r2)',
                          fontSize: '11px',
                          fontFamily: 'var(--mono)',
                          cursor: 'pointer',
                          fontWeight: onlinePlayerCount === num ? 700 : 400,
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateOnline}
                  disabled={isCreating}
                  style={{
                    width: '100%',
                    padding: '9px',
                    background: 'var(--ink)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r2)',
                    font: '11.5px/1 var(--mono)',
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCreating ? 'Membuat Room...' : 'Buat Room Baru'}
                </button>
              </div>

              {/* Join Room Form */}
              <form
                onSubmit={handleJoinOnline}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: '6px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <input
                  type="text"
                  placeholder="KODE ROOM"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  maxLength={6}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: '#ffffff',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 'var(--r2)',
                    color: 'var(--ink)',
                    font: '12px/1 var(--mono)',
                    letterSpacing: '.1em',
                    textAlign: 'center',
                    outline: 'none',
                    textTransform: 'uppercase',
                  }}
                />
                <button
                  type="submit"
                  disabled={!roomCode.trim()}
                  style={{
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    padding: '8px 14px',
                    background: roomCode.trim() ? 'var(--gold-tint)' : '#ffffff',
                    border: `1px solid ${roomCode.trim() ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius: 'var(--r2)',
                    color: roomCode.trim() ? 'var(--gold)' : 'var(--ink-faint)',
                    font: '11px/1 var(--mono)',
                    fontWeight: 700,
                    cursor: roomCode.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Gabung
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
