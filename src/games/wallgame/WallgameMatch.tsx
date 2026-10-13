import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

export const WallgameMatch: React.FC = () => {
  const { code } = useParams<{ code: string }>();

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ marginBottom: '24px', textAlign: 'left' }}>
        <Link
          to="/wallgame"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Kembali ke Lobby
        </Link>
      </div>

      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 24px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--accent-amber)',
          }}
        >
          <Clock size={32} />
        </div>

        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '8px' }}>
          Match Room: <span style={{ color: 'var(--accent-cyan)' }}>{code}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
          Koneksi room multiplayer online ini disiapkan untuk integrasi Supabase (Fase G3).
          Silakan mainkan mode <strong>Hotseat Lokal</strong> terlebih dahulu yang sudah aktif sepenuhnya!
        </p>

        <Link
          to="/wallgame/local"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: 'var(--accent-blue)',
            color: '#ffffff',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
          }}
        >
          Mainkan Hotseat Lokal
        </Link>
      </div>
    </div>
  );
};
