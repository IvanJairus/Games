import React from 'react';
import { Link } from 'react-router-dom';
import { GAMES_REGISTRY, GameMetadata } from '../games/registry';
import { CompletedCounts, fetchCompletedCounts } from '../games/common/matchStats';

// A lobby chunk that fails to arrive must not surface as a failed click: the route's own
// lazy import retries it on navigation.
const preloadLobby = (game: GameMetadata) => {
  game.preload().catch(() => {});
};

const MABAR_URL = 'https://www.ivanjairus.xyz/mabar/';

const MabarThumbnail: React.FC = () => (
  <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
    <rect width="320" height="180" fill="#F4EBDD" />
    <g stroke="rgba(27, 26, 23, 0.08)" strokeWidth="1">
      {[40, 80, 120, 160, 200, 240, 280].map((x) => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2="180" />
      ))}
      {[45, 90, 135].map((y) => (
        <line key={`h${y}`} x1="0" y1={y} x2="320" y2={y} />
      ))}
    </g>
    <rect x="26" y="34" width="112" height="112" rx="22" fill="#1B1A17" />
    <path d="M52 116V62h14l16 24 16-24h14v54H98V82L82 106 66 82v34z" fill="#F4EBDD" />
    <circle cx="126" cy="46" r="9" fill="#E8452C" />
    <rect x="178" y="42" width="50" height="50" rx="12" fill="#E8452C" />
    <path d="M203 54l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#FFFDF8" />
    <rect x="240" y="42" width="24" height="24" rx="6" fill="#2E5C8A" />
    <rect x="270" y="42" width="24" height="24" rx="6" fill="#3E7C4A" />
    <rect x="240" y="72" width="24" height="24" rx="6" fill="#E9C46A" />
    <rect x="270" y="72" width="24" height="24" rx="6" fill="#E07A9A" />
    <rect x="178" y="118" width="116" height="8" rx="4" fill="#1B1A17" opacity=".18" />
    <rect x="178" y="132" width="78" height="8" rx="4" fill="#1B1A17" opacity=".1" />
  </svg>
);

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
          Mini-Games, Arena Strategi & Party.
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: '14.5px', maxWidth: '52ch', margin: 0 }}>
          Koleksi game taktikal berbasis giliran plus Mabar, party game satu HP untuk 2–6 orang.
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
            onPointerEnter={() => preloadLobby(game)}
            onFocus={() => preloadLobby(game)}
            onTouchStart={() => preloadLobby(game)}
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

      <section aria-labelledby="party-games-heading" style={{ marginTop: '38px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '1px solid var(--line)',
            paddingBottom: '10px',
            marginBottom: '18px',
          }}
        >
          <h2 id="party-games-heading" style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' }}>
            Party
          </h2>
          <span
            style={{
              font: '11px/1 var(--mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            satu HP · 2–6 pemain
          </span>
        </div>

        <a
          className="party-card"
          href={MABAR_URL}
          data-testid="game-card-mabar"
          aria-label="Buka Mabar, party game 16 game untuk 2 sampai 6 pemain"
        >
          <div className="party-card-art">
            <MabarThumbnail />
          </div>
          <div className="party-card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-0.015em' }}>
                Mabar · Party Games Satu HP
              </span>
              <span
                style={{
                  font: '10px/1 var(--mono)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  border: '1px solid var(--gold-border)',
                  borderRadius: 'var(--r2)',
                  padding: '4px 7px',
                }}
              >
                16 game
              </span>
            </div>
            <p>
              Kumpulkan 2–6 orang, satu HP, oper-operan. Tebak gaya, adu bel, cari benda, stop timer, dan game
              pesta lain dengan hukuman tiap ronde.
            </p>
            <div className="party-card-meta">
              <span>ivanjairus.xyz/mabar</span>
              <span>tanpa install</span>
              <span>solo · satu HP</span>
              <span style={{ marginLeft: 'auto', color: 'var(--ink-dim)' }}>mainkan →</span>
            </div>
          </div>
        </a>
      </section>
    </div>
  );
};
