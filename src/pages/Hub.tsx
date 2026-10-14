import React from 'react';
import { Link } from 'react-router-dom';
import { GAMES_REGISTRY } from '../games/registry';
import { CompletedCounts, fetchCompletedCounts } from '../games/common/matchStats';

export const Hub: React.FC = () => {
  const [counts, setCounts] = React.useState<CompletedCounts>({});

  React.useEffect(() => {
    let alive = true;
    fetchCompletedCounts(GAMES_REGISTRY.map((g) => g.id))
      .then((next) => {
        if (alive) setCounts(next);
      })
      .catch(() => {
        /* a hub with no numbers still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ maxWidth: '1000px', margin: 'clamp(20px, 4vw, 36px) auto', padding: '0 clamp(16px, 4.5vw, 24px)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          font: '12px/1 var(--mono)',
          color: 'var(--ink-dim)',
          letterSpacing: '.04em',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
          marginBottom: '32px',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'nowrap' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              flexShrink: 0,
              border: '1px solid var(--red)',
              borderRadius: 'var(--r2)',
              color: 'var(--red)',
              font: '11px/1 var(--mono)',
              fontWeight: 700,
            }}
          >
            IJ
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>ivanjairus.xyz</span>
          <span style={{ color: 'var(--line-strong)' }}>/</span>
          <span style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>games</span>
        </div>

        <a
          href="/"
          className="hub-back-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            color: 'var(--ink-dim)',
            textDecoration: 'none',
            padding: '5px 9px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            fontSize: '11px',
            lineHeight: 1,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          aria-label="Kembali ke root ivanjairus.xyz"
        >
          <span aria-hidden="true">←</span>
          <span className="hub-back-label">kembali ke </span>root
        </a>
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

      <div
        data-testid="games-hub-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
          gap: '20px',
        }}
      >
        {GAMES_REGISTRY.map((game) => (
          <Link
            key={game.id}
            to={game.route}
            data-testid={`game-card-${game.id}`}
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
              transition: 'border-color 0.15s ease, transform 0.15s ease',
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
              {game.playerRange}
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
              {game.thumbnail}
            </div>

            <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              <span style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.015em' }}>
                {game.title}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                {game.description}
              </span>

              {counts[game.id] ? (
                <span
                  data-testid={`game-completed-${game.id}`}
                  style={{ font: '11px/1 var(--mono)', color: 'var(--ink-faint)', letterSpacing: '.04em' }}
                >
                  {counts[game.id]} pertandingan online selesai
                </span>
              ) : null}

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
                <span style={{ font: '12px/1 var(--mono)', color: 'var(--gold)' }}>{game.route}</span>
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
                  {game.statusLabel}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
