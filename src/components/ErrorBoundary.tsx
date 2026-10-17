import React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { RotateCw, ArrowLeft, AlertTriangle } from 'lucide-react';

const CHUNK_FAILURE = /dynamically imported module|Importing a module script failed/i;
const RETRY_STAMP = 'ij_games_chunk_reload_at';
const RETRY_COOLDOWN_MS = 20000;

export const shouldRetryChunkLoad = (message: string, lastStamp: number, now: number): boolean =>
  CHUNK_FAILURE.test(message) && now - lastStamp >= RETRY_COOLDOWN_MS;

export const retryChunkLoad = (reload: () => void, message: string, lastStamp: number, now: number): boolean => {
  if (!shouldRetryChunkLoad(message, lastStamp, now)) return false;
  reload();
  return true;
};

function lastRetryStamp(): number {
  try {
    return Number(sessionStorage.getItem(RETRY_STAMP) || 0);
  } catch {
    return 0;
  }
}

function markRetry(): void {
  try {
    sessionStorage.setItem(RETRY_STAMP, String(Date.now()));
  } catch {
    /* Private mode: the cooldown simply does not apply, the boundary still renders. */
  }
}

export const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError();

  let title = 'Terjadi Kesalahan Aplikasi';
  let message = 'Terjadi kendala yang tidak terduga saat memproses permainan.';
  let technicalDetail = '';

  if (isRouteErrorResponse(error)) {
    title = `Kesalahan ${error.status}: ${error.statusText || 'Gagal Memuat'}`;
    message = error.data?.message || 'Permintaan rute gagal diproses oleh sistem.';
  } else if (error instanceof Error) {
    message = error.message;
    technicalDetail = error.stack || error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  /* A tab opened before the last deploy asks for chunk names that no longer exist, and the
     only way back is a fresh document. Reload once, then let the boundary show if it fails
     again, so a genuinely broken build cannot loop. */
  React.useEffect(() => {
    if (retryChunkLoad(() => window.location.reload(), message, lastRetryStamp(), Date.now())) markRetry();
  }, [message]);

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        textAlign: 'center',
        padding: '32px 20px',
      }}
    >
      <div className="paper-bg" />

      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r4)',
          padding: '32px 28px',
          boxShadow: '0 4px 20px rgba(28, 25, 23, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'var(--gold-tint)',
            border: '1px solid var(--gold-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={22} />
        </div>

        <span
          style={{
            font: '11px/1 var(--mono)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: '8px',
          }}
        >
          Pemberitahuan Sistem · Error Boundary
        </span>

        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h1>

        <p
          style={{
            color: 'var(--ink-dim)',
            fontSize: '13.5px',
            lineHeight: 1.6,
            margin: '0 0 20px',
          }}
        >
          {message}
        </p>

        {technicalDetail && (
          <details
            style={{
              width: '100%',
              marginBottom: '24px',
              textAlign: 'left',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r2)',
              padding: '8px 12px',
              fontSize: '11px',
            }}
          >
            <summary
              style={{
                font: '11px/1 var(--mono)',
                color: 'var(--ink-faint)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              Detail Teknis (Stack Trace)
            </summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '8px',
                background: '#ffffff',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r2)',
                font: '10.5px/1.4 var(--mono)',
                color: '#b42318',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '180px',
              }}
            >
              {technicalDetail}
            </pre>
          </details>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--gold)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            <RotateCw size={13} /> Muat Ulang Halaman
          </button>

          <Link
            to="/wall-game/local"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line-strong)',
              color: 'var(--ink)',
              padding: '9px 16px',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              letterSpacing: '.04em',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            Mulai Ulang Hotseat
          </Link>

          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--line)',
              color: 'var(--ink-dim)',
              padding: '9px 16px',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              letterSpacing: '.04em',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            <ArrowLeft size={13} /> Menu Utama
          </Link>
        </div>
      </div>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: '24px',
            margin: '16px auto',
            maxWidth: '520px',
            background: '#ffffff',
            border: '1px solid #b42318',
            borderRadius: 'var(--r2)',
            font: '12px/1.5 var(--sans)',
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '6px', font: '13px/1 var(--mono)' }}>
            ⚠ Terjadi Kendala Rendering
          </div>
          <p style={{ color: 'var(--ink-dim)', marginBottom: '12px' }}>
            {this.state.error?.message || 'Komponen mengalami galat internal.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-stage)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r2)',
              font: '11px/1 var(--mono)',
              cursor: 'pointer',
            }}
          >
            Coba Render Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
