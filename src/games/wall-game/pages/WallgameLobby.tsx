import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Globe, ArrowLeft, Shield, Play, Plus, LogIn, CheckCircle2 } from 'lucide-react';
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
    <div style={{ maxWidth: '820px', margin: '40px auto', padding: '0 24px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            font: '12px/1 var(--mono)',
            color: 'var(--ink-dim)',
            letterSpacing: '.04em',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> /games/
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isConfigured && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                font: '10.5px/1 var(--mono)',
                color: '#166534',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--r2)',
                padding: '4px 8px',
              }}
            >
              <CheckCircle2 size={12} /> Supabase Realtime Aktif
            </span>
          )}
          <span
            style={{
              font: '10.5px/1 var(--mono)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--r2)',
              padding: '4px 8px',
              background: 'var(--gold-tint)',
            }}
          >
            Lobby Permainan
          </span>
        </div>
      </header>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          padding: '36px',
          boxShadow: '0 4px 16px rgba(28, 25, 23, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--r2)',
              background: 'var(--bg-stage)',
              border: '1px solid var(--gold-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
            }}
          >
            <Shield size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', letterSpacing: '-0.02em', margin: 0, fontWeight: 700 }}>
              WallGo · <span style={{ color: 'var(--gold)' }}>Race to the Golden Core</span>
            </h1>
            <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', margin: '4px 0 0' }}>
              Game strategi balapan ke pusat papan untuk 2 hingga 6 pemain.
            </p>
          </div>
        </div>

        {/* Global Player Name Input */}
        <div
          style={{
            marginBottom: '28px',
            padding: '16px 20px',
            background: 'var(--bg-stage)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <label style={{ display: 'block', font: '11px/1 var(--mono)', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-dim)', marginBottom: '6px' }}>
              Nama Pemain Anda
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Masukkan nama Anda"
              maxLength={20}
              style={{
                padding: '8px 12px',
                background: '#ffffff',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r2)',
                font: '14px/1.2 var(--mono)',
                color: 'var(--ink)',
                outline: 'none',
                width: '220px',
              }}
            />
          </div>
          <div style={{ font: '12px/1.4 var(--sans)', color: 'var(--ink-dim)', maxWidth: '380px' }}>
            Nama ini akan terlihat oleh lawan saat Anda bermain di mode online maupun lokal.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* Local Hotseat Option */}
          <div
            style={{
              background: 'var(--bg-stage)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Users size={16} color="var(--gold)" />
                <h2 style={{ fontSize: '15px', font: '14px/1.2 var(--mono)', fontWeight: 700, margin: 0 }}>
                  Hotseat Lokal
                </h2>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                Bermain bersama di satu layar gawai bergantian. Pilih 2 hingga 6 pemain dengan posisi awal simetris yang adil.
              </p>
            </div>
            <Link
              to="/wall-game/local"
              data-testid="local-play-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '11px',
                backgroundColor: 'var(--gold)',
                color: '#ffffff',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              <Play size={13} /> Main Lokal Sekarang
            </Link>
          </div>

          {/* Online Multiplayer Option */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--r2)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 2px 10px rgba(180, 83, 9, 0.04)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Globe size={16} color="var(--gold)" />
                <h2 style={{ fontSize: '15px', font: '14px/1.2 var(--mono)', fontWeight: 700, margin: 0 }}>
                  Multiplayer Online
                </h2>
                <span
                  style={{
                    font: '9px/1 var(--mono)',
                    letterSpacing: '.06em',
                    padding: '2px 6px',
                    borderRadius: 'var(--r2)',
                    background: 'var(--gold-tint)',
                    border: '1px solid var(--gold-border)',
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                  }}
                >
                  Live
                </span>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
                Sinkronisasi match real-time multi-gawai via Supabase. Buat room baru atau gabung menggunakan kode match.
              </p>

              {createError && (
                <div style={{ padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r2)', color: '#991b1b', fontSize: '12px', marginBottom: '12px' }}>
                  {createError}
                </div>
              )}

              {/* Create Room Section */}
              <div style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px',
                    background: 'var(--ink)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r2)',
                    font: '11.5px/1 var(--mono)',
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  <Plus size={13} /> {isCreating ? 'Membuat Room...' : 'Buat Room Baru'}
                </button>
              </div>

              {/* Join Room Form */}
              <form onSubmit={handleJoinOnline} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="KODE ROOM"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  maxLength={6}
                  style={{
                    flex: 1,
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
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
                  <LogIn size={12} /> Gabung
                </button>
              </form>
            </div>
            <div style={{ font: '10.5px/1 var(--mono)', color: 'var(--ink-faint)', textAlign: 'center', marginTop: '12px' }}>
              Latency rendah (Singapore ap-southeast-1)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
