import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredPlayerName, setStoredPlayerName } from '../../../lib/supabase';
import { createOnlineRoom } from '../../common/multiplayer';
import { createInitialArena } from '../engine/physics';

const COLOR_OPTIONS = [
  { label: 'Biru Cerah', hex: '#3b82f6' },
  { label: 'Merah Bara', hex: '#ef4444' },
  { label: 'Hijau Zamrud', hex: '#10b981' },
  { label: 'Kuning Mentari', hex: '#f59e0b' },
  { label: 'Ungu Mistis', hex: '#8b5cf6' },
  { label: 'Merah Muda', hex: '#ec4899' },
];

export const SlapArenaLobby: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getStoredPlayerName() || 'Brawler ' + Math.floor(100 + Math.random() * 900));
  const [selectedColor, setSelectedColor] = useState(() => {
    return localStorage.getItem('slap_player_color') || '#3b82f6';
  });
  const [joinCode, setJoinCode] = useState('');
  const [activeTab, setActiveTab] = useState<'solo' | 'multiplayer'>('solo');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const savePreferences = (newName: string, newColor: string) => {
    setStoredPlayerName(newName);
    localStorage.setItem('slap_player_color', newColor);
  };

  const handleStartSolo = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim() || 'Brawler';
    savePreferences(cleanName, selectedColor);
    navigate('/slap-arena/solo');
  };

  const handleCreateRoom = async () => {
    const cleanName = name.trim() || 'Host Brawler';
    savePreferences(cleanName, selectedColor);
    setIsLoading(true);
    setErrorMessage('');

    try {
      const initialArena = createInitialArena('temp', 3);
      const { roomCode } = await createOnlineRoom({
        gameType: 'wall-game' as any, // reuse matches schema
        maxPlayers: 4,
        hostName: cleanName,
        initialState: {
          ...initialArena,
          gameType: 'slap-arena',
          hostColor: selectedColor,
        },
      });

      navigate(`/slap-arena/m/${roomCode}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal membuat room. Periksa koneksi internet Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (cleanCode.length < 4) {
      setErrorMessage('Masukkan kode room yang valid (minimal 4 karakter).');
      return;
    }
    const cleanName = name.trim() || 'Brawler';
    savePreferences(cleanName, selectedColor);
    navigate(`/slap-arena/m/${cleanCode}`);
  };

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '24px 16px 48px',
        color: 'var(--ink, #1c1917)',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            padding: '4px 14px',
            borderRadius: '999px',
            font: '700 12px/1 var(--mono, monospace)',
            marginBottom: '12px',
          }}
        >
          <span>PULAU TAMPOL 3D</span>
          <span>·</span>
          <span>ROBLOX-STYLE BRAWLER</span>
        </div>
        <h1
          style={{
            font: '900 clamp(28px, 6vw, 42px)/1.15 var(--sans, sans-serif)',
            letterSpacing: '-0.02em',
            margin: '0 0 10px',
            color: '#0f172a',
          }}
        >
          Slap Arena: Island Brawler
        </h1>
        <p
          style={{
            font: '15px/1.6 var(--sans, sans-serif)',
            color: '#64748b',
            maxWidth: '520px',
            margin: '0 auto',
          }}
        >
          Jatuhkan lawan dari pulau melayang dengan tamparan sarung tinju raksasa. 
          Raih 3 kemenangan ronde untuk menjadi juara pulau.
        </p>
      </div>

      {/* Profile & Customization Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        <h2 style={{ font: '700 16px/1.2 var(--sans, sans-serif)', margin: '0 0 14px', color: '#1e293b' }}>
          Profil Petarung
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {/* Name Input */}
          <div>
            <label
              htmlFor="player-name-input"
              style={{ display: 'block', font: '600 13px/1.4 var(--sans, sans-serif)', color: '#475569', marginBottom: '6px' }}
            >
              Nama Petarung
            </label>
            <input
              id="player-name-input"
              type="text"
              value={name}
              maxLength={14}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Brawler Pro"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                font: '600 15px/1 var(--sans, sans-serif)',
                color: '#0f172a',
                backgroundColor: '#f8fafc',
                outline: 'none',
              }}
            />
          </div>

          {/* Color Picker */}
          <div>
            <span style={{ display: 'block', font: '600 13px/1.4 var(--sans, sans-serif)', color: '#475569', marginBottom: '6px' }}>
              Warna Karakter
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map((c) => {
                const isSelected = selectedColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: isSelected ? '3px solid #0f172a' : '2px solid #ffffff',
                      boxShadow: isSelected ? '0 0 0 2px #3b82f6' : '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                      transition: 'transform 0.1s ease',
                    }}
                    aria-label={`Pilih warna ${c.label}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginBottom: '20px',
          backgroundColor: '#e2e8f0',
          padding: '4px',
          borderRadius: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('solo');
            setErrorMessage('');
          }}
          style={{
            padding: '12px',
            borderRadius: '9px',
            border: 'none',
            font: '700 14px/1 var(--sans, sans-serif)',
            backgroundColor: activeTab === 'solo' ? '#ffffff' : 'transparent',
            color: activeTab === 'solo' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'solo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          Mode Solo (vs 3 Bot AI)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('multiplayer');
            setErrorMessage('');
          }}
          style={{
            padding: '12px',
            borderRadius: '9px',
            border: 'none',
            font: '700 14px/1 var(--sans, sans-serif)',
            backgroundColor: activeTab === 'multiplayer' ? '#ffffff' : 'transparent',
            color: activeTab === 'multiplayer' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'multiplayer' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          Online Multiplayer (2 - 4 Pemain)
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#b91c1c',
            font: '500 13px/1.5 var(--sans, sans-serif)',
            marginBottom: '18px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Tab 1: Solo Mode */}
      {activeTab === 'solo' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#dbeafe',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
              <path d="M12 6a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2z" />
            </svg>
          </div>
          <h3 style={{ font: '800 18px/1.2 var(--sans, sans-serif)', margin: '0 0 8px', color: '#0f172a' }}>
            Pertarungan Instan Tanpa Antre
          </h3>
          <p style={{ font: '14px/1.6 var(--sans, sans-serif)', color: '#64748b', margin: '0 0 22px' }}>
            Langsung terjun ke pulau dan lawan 3 bot pintar: Brawler Bob, Speedy Sam, dan Sneaky Sue.
            Mendukung kontrol sentuh smartphone atau keyboard PC.
          </p>

          <button
            type="button"
            onClick={handleStartSolo}
            style={{
              width: '100%',
              maxWidth: '360px',
              padding: '16px 24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              font: '800 16px/1 var(--sans, sans-serif)',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.1s ease',
            }}
          >
            Mulai Bermain Solo
          </button>
        </div>
      )}

      {/* Tab 2: Multiplayer Mode */}
      {activeTab === 'multiplayer' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {/* Create Room */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div>
              <h3 style={{ font: '800 18px/1.2 var(--sans, sans-serif)', margin: '0 0 8px', color: '#0f172a' }}>
                Buat Room Baru
              </h3>
              <p style={{ font: '13px/1.5 var(--sans, sans-serif)', color: '#64748b', margin: '0 0 20px' }}>
                Jadilah tuan rumah pertarungan. Dapatkan kode 6 karakter untuk dibagikan ke teman.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                font: '800 15px/1 var(--sans, sans-serif)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              }}
            >
              {isLoading ? 'Membuat Room...' : 'Buat Room Sekarang'}
            </button>
          </div>

          {/* Join Room */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h3 style={{ font: '800 18px/1.2 var(--sans, sans-serif)', margin: '0 0 8px', color: '#0f172a' }}>
              Gabung Room Teman
            </h3>
            <p style={{ font: '13px/1.5 var(--sans, sans-serif)', color: '#64748b', margin: '0 0 16px' }}>
              Masukkan kode 6 huruf yang diberikan oleh tuan rumah room.
            </p>

            <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CONTOH: 7K9P2X"
                maxLength={8}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  font: '700 16px/1 var(--mono, monospace)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  outline: 'none',
                }}
              />

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  font: '800 15px/1 var(--sans, sans-serif)',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                }}
              >
                Gabung ke Arena
              </button>
            </form>
          </div>
        </div>
      )}

      {/* How to Play Guide Card */}
      <div
        style={{
          marginTop: '32px',
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
        }}
      >
        <h3 style={{ font: '700 14px/1.3 var(--sans, sans-serif)', margin: '0 0 10px', color: '#334155' }}>
          Petunjuk Kontrol & Gameplay
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', font: '13px/1.6 var(--sans, sans-serif)', color: '#475569' }}>
          <div>
            <strong>Desktop (Keyboard):</strong>
            <div>• WASD / Tombol Panah: Gerak</div>
            <div>• Spasi: Tampar (SLAP!)</div>
            <div>• Shift: Terjang Cepat (Dash)</div>
          </div>
          <div>
            <strong>Smartphone (Layar Sentuh):</strong>
            <div>• Virtual Joystick: Kendalikan arah</div>
            <div>• Tombol Merah: Tampar lawan</div>
            <div>• Tombol Biru: Terjang cepat menghindar</div>
          </div>
        </div>
      </div>
    </div>
  );
};
