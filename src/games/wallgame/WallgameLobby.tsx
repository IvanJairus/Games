import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Globe, ArrowLeft, Shield, Play } from 'lucide-react';

export const WallgameLobby: React.FC = () => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');

  const handleJoinOnline = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/wallgame/m/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Kembali ke Games Hub
        </Link>
      </div>

      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Shield size={32} />
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>WallGo</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Game strategi blokade wilayah untuk 2 hingga 6 pemain.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '28px' }}>
          {/* Card: Hotseat Lokal */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-md)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Users size={22} color="var(--accent-cyan)" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Hotseat Lokal</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                Bermain bersama di satu layar gawai bergantian. Pilih 2 hingga 6 pemain dan ukuran papan dinamis.
              </p>
            </div>
            <Link
              to="/wallgame/local"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                backgroundColor: 'var(--accent-cyan)',
                color: '#000000',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              <Play size={16} /> Main Lokal Sekarang
            </Link>
          </div>

          {/* Card: Online Multiplayer (Supabase - Fase G3) */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              opacity: 0.85,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Globe size={22} color="var(--accent-blue)" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Multiplayer Online</h2>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--accent-amber)',
                  }}
                >
                  Fase G3
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '16px' }}>
                Buat room atau gabung lewat kode match untuk bermain secara real-time via Supabase.
              </p>
              <form onSubmit={handleJoinOnline} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="KODE ROOM"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  maxLength={6}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!roomCode.trim()}
                  style={{
                    padding: '10px 16px',
                    background: roomCode.trim() ? 'var(--accent-blue)' : 'var(--bg-card-hover)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: roomCode.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Join
                </button>
              </form>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Terkoneksi server saat Fase G3 aktif
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
