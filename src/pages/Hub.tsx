import React from 'react';
import { Link } from 'react-router-dom';

export const Hub: React.FC = () => {
  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '1000px', margin: '36px auto', padding: '0 24px' }}>
      <div className="paper-bg" />

      {/* Header matching gateway-B2 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          font: '12px/1 var(--mono)',
          color: 'var(--ink-dim)',
          letterSpacing: '.04em',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '16px',
          marginBottom: '32px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            border: '1px solid var(--gold)',
            borderRadius: 'var(--r2)',
            color: 'var(--gold)',
            font: '11px/1 var(--mono)',
            fontWeight: 700,
          }}
        >
          IJ
        </span>
        <span>ivanjairus.xyz</span>
        <span style={{ color: 'var(--line-strong)' }}>/</span>
        <span style={{ color: 'var(--gold)' }}>games</span>
        <span style={{ marginLeft: 'auto' }}>
          <a
            href="/"
            style={{
              color: 'var(--ink-dim)',
              textDecoration: 'none',
              padding: '4px 8px',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r2)',
            }}
          >
            ← kembali ke root
          </a>
        </span>
      </header>

      {/* Hero */}
      <div style={{ marginBottom: '36px' }}>
        <h1
          style={{
            fontSize: 'clamp(28px, 4.4vw, 42px)',
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            margin: '0 0 12px',
            fontWeight: 700,
          }}
        >
          Mini-Games & Arena Strategi.
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: '14.5px', maxWidth: '52ch', margin: 0 }}>
          Koleksi game taktikal berbasis giliran. Bebas dimainkan secara hotseat lokal multi-pemain maupun online.
        </p>
      </div>

      {/* Tile Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {/* WallGo Tile */}
        <Link
          to="/wallgame/"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            background: 'var(--bg-stage)',
            textDecoration: 'none',
            color: 'inherit',
            overflow: 'hidden',
            boxShadow: '0 8px 16px -4px rgba(0,0,0,0.5)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1,
              font: '10px/1 var(--mono)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              border: '1px solid var(--gold)',
              borderRadius: '999px',
              padding: '4px 8px',
              background: 'var(--bg)',
            }}
          >
            2 - 6 Pemain
          </span>

          {/* SVG Art matching gateway-B2 */}
          <div
            style={{
              aspectRatio: '16/9',
              maxHeight: '200px',
              background: 'var(--bg-tile)',
              borderBottom: '1px solid var(--line)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="1.1" color="var(--ink-dim)">
                {/* Board grid representation */}
                <path d="M60 20v140M110 20v140M160 20v140M210 20v140M260 20v140" stroke="rgba(217, 163, 94, 0.2)" />
                <path d="M40 50h240M40 90h240M40 130h240" stroke="rgba(217, 163, 94, 0.2)" strokeDasharray="4 4" />
                {/* Golden Core at Center */}
                <circle cx="160" cy="90" r="14" stroke="var(--gold)" strokeWidth="1.5" />
                <circle cx="160" cy="90" r="6" fill="var(--gold)" stroke="none" />
                {/* Pawns */}
                <circle cx="160" cy="140" r="8" fill="#d4af37" stroke="#fff" strokeWidth="1.2" />
                <circle cx="160" cy="40" r="8" fill="#b45309" stroke="#fff" strokeWidth="1.2" />
                {/* Brass Wall */}
                <rect x="90" y="88" width="50" height="4" rx="2" fill="var(--gold)" stroke="none" />
              </g>
            </svg>
          </div>

          {/* Caption */}
          <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <span style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.015em' }}>
              WallGo · Race to the Golden Core
            </span>
            <span style={{ fontSize: '13px', color: 'var(--ink-dim)', lineHeight: 1.5 }}>
              Mekanik Walls.gg / Quoridor: Gerak 1 petak atau pasang dinding 2-petak. Capai petak pusat emas lebih dulu.
            </span>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: 'auto',
                paddingTop: '14px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <span style={{ font: '12px/1 var(--mono)', color: 'var(--gold)' }}>/games/wallgame/</span>
              <span style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
                mainkan →
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  font: '10px/1 var(--mono)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-dim)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: '999px',
                  padding: '4px 8px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    background: 'var(--gold)',
                    borderRadius: '50%',
                  }}
                />
                Lokal Siap
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};
