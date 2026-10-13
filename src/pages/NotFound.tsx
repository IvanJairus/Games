import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      textAlign: 'center',
      padding: '24px',
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: '16px' }}>404</h1>
      <h2 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>Game Not Found</h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '28px' }}>
        Halaman atau game yang Anda cari tidak tersedia di portal ij-games.
      </p>
      <div style={{ display: 'flex', gap: '16px' }}>
        <Link to="/" style={{
          backgroundColor: 'var(--accent-blue)',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
        }}>
          Games Hub
        </Link>
        <a href="/" style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '10px 20px',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
        }}>
          Kembali ke Home Gateway
        </a>
      </div>
    </div>
  );
};
