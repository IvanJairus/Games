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
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '40px auto', padding: '0 24px' }}>
      <div className="paper-bg" />

      {/* Header */}
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
          }}
        >
          <ArrowLeft size={14} /> /games/
        </Link>
        <span
          style={{
            font: '10.5px/1 var(--mono)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            border: '1px solid var(--line-strong)',
            borderRadius: '999px',
            padding: '5px 10px',
            background: 'var(--gold-tint)',
          }}
        >
          Lobby Permainan
        </span>
      </header>

      {/* Hero Card */}
      <div
        style={{
          background: 'var(--bg-stage)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          padding: '36px',
          boxShadow: '0 12px 24px -6px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--r2)',
              background: 'var(--bg-tile)',
              border: '1px solid var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
            }}
          >
            <Shield size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', letterSpacing: '-0.02em', margin: 0, fontWeight: 700 }}>
              WallGo · <span style={{ color: 'var(--gold)' }}>Race to the Golden Core</span>
            </h1>
            <p style={{ color: 'var(--ink-dim)', fontSize: '13.5px', margin: '4px 0 0' }}>
              Game strategi balapan ke pusat papan untuk 2 hingga 6 pemain.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '28px' }}>
          {/* Card 1: Hotseat Lokal */}
          <div
            style={{
              background: 'var(--bg-tile)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Users size={18} color="var(--gold)" />
                <h2 style={{ fontSize: '16px', font: '15px/1.2 var(--mono)', fontWeight: 700, margin: 0 }}>
                  Hotseat Lokal
                </h2>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                Bermain bersama di satu layar gawai secara bergantian. Bebas pilih 2 hingga 6 pemain dengan posisi awal simetris yang adil.
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
                backgroundColor: 'var(--gold)',
                color: '#000000',
                borderRadius: 'var(--r2)',
                font: '12px/1 var(--mono)',
                fontWeight: 700,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              <Play size={14} /> Main Lokal Sekarang
            </Link>
          </div>

          {/* Card 2: Online Multiplayer (Fase G3) */}
          <div
            style={{
              background: 'var(--bg-tile)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r2)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              opacity: 0.9,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Globe size={18} color="var(--ink-faint)" />
                <h2 style={{ fontSize: '16px', font: '15px/1.2 var(--mono)', fontWeight: 700, margin: 0 }}>
                  Multiplayer Online
                </h2>
                <span
                  style={{
                    font: '9.5px/1 var(--mono)',
                    letterSpacing: '.08em',
                    padding: '3px 6px',
                    borderRadius: '999px',
                    background: 'var(--bg-stage)',
                    border: '1px solid var(--line)',
                    color: 'var(--ink-faint)',
                    textTransform: 'uppercase',
                  }}
                >
                  Fase G3
                </span>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
                Sinkronisasi match real-time multi-browser melalui Supabase. Masukkan kode match untuk bergabung.
              </p>
              <form onSubmit={handleJoinOnline} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="KODE MATCH"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  maxLength={6}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'var(--bg-stage)',
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
                    padding: '8px 14px',
                    background: roomCode.trim() ? 'var(--gold-tint)' : 'var(--bg-stage)',
                    border: `1px solid ${roomCode.trim() ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius: 'var(--r2)',
                    color: roomCode.trim() ? 'var(--gold)' : 'var(--ink-faint)',
                    font: '11px/1 var(--mono)',
                    fontWeight: 700,
                    cursor: roomCode.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Join
                </button>
              </form>
            </div>
            <div style={{ font: '10.5px/1 var(--mono)', color: 'var(--ink-faint)', textAlign: 'center' }}>
              Diaktifkan pada rilis Fase G3
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
