import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

export const WallgameMatch: React.FC = () => {
  const { code } = useParams<{ code: string }>();

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ marginBottom: '24px', textAlign: 'left' }}>
        <Link
          to="/wall-game"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--ink-dim)',
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} /> Kembali ke Lobby
        </Link>
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          padding: '40px 24px',
          boxShadow: '0 4px 16px rgba(28, 25, 23, 0.05)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--bg-stage)',
            border: '1px solid var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--gold)',
          }}
        >
          <Clock size={32} />
        </div>

        <span
          style={{
            font: '11px/1 var(--mono)',
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
          }}
        >
          Match Room · {code}
        </span>

        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '10px 0 12px', color: 'var(--ink)' }}>
          Menunggu Sinkronisasi Server
        </h2>

        <p style={{ color: 'var(--ink-dim)', fontSize: '14px', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 24px' }}>
          Fitur realtime online matchmaking via Supabase sedang dipersiapkan untuk fase rilis berikutnya. Untuk saat ini, Anda dapat memainkan mode hotseat lokal bersama teman.
        </p>

        <Link
          to="/wall-game/local"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: 'var(--gold)',
            color: '#ffffff',
            borderRadius: 'var(--r2)',
            font: '12px/1 var(--mono)',
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Beralih ke Hotseat Lokal →
        </Link>
      </div>
    </div>
  );
};
