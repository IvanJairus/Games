import React from 'react';
import { Link } from 'react-router-dom';
import { GAMES_CATALOG } from '../catalog';
import { Shield, ArrowRight, Home, Gamepad2 } from 'lucide-react';

export const Hub: React.FC = () => {
  return (
    <div style={{ maxWidth: '960px', margin: '40px auto', padding: '0 20px' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Gamepad2 size={28} color="var(--accent-cyan)" />
          <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>Ivan Jairus Games</span>
        </div>

        {/* Link back to gateway root must be standard <a> for full navigation */}
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-card)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
          }}
        >
          <Home size={14} /> ivanjairus.xyz
        </a>
      </div>

      {/* Hero */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '12px' }}>
          Mini Games & <span style={{ color: 'var(--accent-cyan)' }}>Strategy Arena</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '600px', lineHeight: 1.6 }}>
          Koleksi game strategi berbasis giliran dan interaktif yang dapat dimainkan langsung di peramban, baik secara hotseat lokal maupun online.
        </p>
      </div>

      {/* Catalog Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '24px',
        }}
      >
        {GAMES_CATALOG.map((game) => (
          <div
            key={game.id}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'transform 0.2s ease, border-color 0.2s ease',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                  }}
                >
                  <Shield size={26} />
                </div>
                {game.badge && (
                  <span
                    style={{
                      background: 'rgba(6, 182, 212, 0.1)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--accent-cyan)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    {game.badge}
                  </span>
                )}
              </div>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
                {game.title}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '16px' }}>
                {game.summary}
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '20px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span
                  style={{
                    background: 'var(--bg-card)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {game.minPlayers} - {game.maxPlayers} Pemain
                </span>
                <span
                  style={{
                    background: 'var(--bg-card)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Hotseat / Online
                </span>
              </div>
            </div>

            <Link
              to={game.route}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--accent-blue)',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.95rem',
              }}
            >
              <span>Mainkan {game.title}</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};
