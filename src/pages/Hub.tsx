import React from 'react';
import { Link } from 'react-router-dom';

export const Hub: React.FC = () => {
  return (
    <div style={{ maxWidth: '1000px', margin: '36px auto', padding: '0 24px' }}>
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

      <div style={{ marginBottom: '36px' }}>
        <h1
          style={{
            fontSize: 'clamp(26px, 4vw, 38px)',
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            margin: '0 0 10px',
            fontWeight: 700,
          }}
        >
          Mini-Games & Arena Strategi.
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: '14.5px', maxWidth: '52ch', margin: 0 }}>
          Koleksi game taktikal berbasis giliran. Bebas dimainkan secara hotseat lokal multi-pemain maupun online.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        <Link
          to="/wallgame/"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r4)',
            background: '#ffffff',
            textDecoration: 'none',
            color: 'inherit',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(28, 25, 23, 0.05)',
            transition: 'border-color 0.15s ease',
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
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--r2)',
              padding: '4px 8px',
              background: '#ffffff',
            }}
          >
            2 - 6 Pemain
          </span>

          <div
            style={{
              aspectRatio: '16/9',
              maxHeight: '180px',
              background: 'var(--bg-paper)',
              borderBottom: '1px solid var(--line)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="1.1" color="var(--ink-faint)">
                <path d="M60 20v140M110 20v140M160 20v140M210 20v140M260 20v140" stroke="rgba(28, 25, 23, 0.12)" />
                <path d="M40 50h240M40 90h240M40 130h240" stroke="rgba(28, 25, 23, 0.12)" strokeDasharray="4 4" />
                <circle cx="160" cy="90" r="14" stroke="var(--gold)" strokeWidth="1.5" />
                <circle cx="160" cy="90" r="5" fill="var(--gold)" stroke="none" />
                <circle cx="160" cy="140" r="8" fill="#b45309" stroke="#78350f" strokeWidth="1.2" />
                <circle cx="160" cy="40" r="8" fill="#451a03" stroke="#1c1917" strokeWidth="1.2" />
                <rect x="90" y="88" width="50" height="4" rx="1" fill="#78350f" stroke="#b45309" strokeWidth="0.8" />
              </g>
            </svg>
          </div>

          <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <span style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.015em' }}>
              WallGo · Race to the Golden Core
            </span>
            <span style={{ fontSize: '13px', color: 'var(--ink-dim)', lineHeight: 1.5 }}>
              Mekanik Walls.gg / Quoridor: Gerak 1 petak atau pasang dinding 2-petak. Capai petak pusat emas lebih dulu.
            </span>

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
                  borderRadius: 'var(--r2)',
                  padding: '3px 7px',
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
