import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <div className="paper-bg" />
      <span
        style={{
          font: '12px/1 var(--mono)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          marginBottom: '12px',
        }}
      >
        Kode Status: 404
      </span>
      <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
        Halaman Tidak Ditemukan
      </h1>
      <p style={{ color: 'var(--ink-dim)', fontSize: '14px', maxWidth: '42ch', margin: '0 0 24px' }}>
        Rute atau game yang Anda tuju tidak terdaftar di direktori ij-games.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <Link
          to="/"
          style={{
            background: 'var(--gold)',
            color: '#000000',
            padding: '8px 16px',
            borderRadius: 'var(--r2)',
            font: '12px/1 var(--mono)',
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
          }}
        >
          Katalog Games
        </Link>
        <a
          href="/"
          style={{
            background: 'var(--bg-stage)',
            border: '1px solid var(--line-strong)',
            color: 'var(--ink-dim)',
            padding: '8px 16px',
            borderRadius: 'var(--r2)',
            font: '12px/1 var(--mono)',
            textDecoration: 'none',
          }}
        >
          Gerbang Utama (/)
        </a>
      </div>
    </div>
  );
};
