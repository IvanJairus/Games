import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export interface ResultAction {
  label: string;
  icon?: React.ReactNode;
  tone?: 'primary' | 'secondary';
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}

export interface ResultNavLink {
  label: string;
  icon?: React.ReactNode;
  to: string;
  testId?: string;
}

export interface ResultStat {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}

export interface ResultDialogProps {
  isOpen: boolean;
  titleId: string;
  title: string;
  kicker?: string;
  tone?: 'win' | 'lose' | 'neutral';
  chip?: React.ReactNode;
  crest?: React.ReactNode;
  stats?: ResultStat[];
  /** First action is the primary call to action, the rest share a row with `links`. */
  actions: ResultAction[];
  links?: ResultNavLink[];
  dismissLabel?: string;
  dismissTestId?: string;
  onDismiss: () => void;
  testId: string;
}

/**
 * The one end-of-match popup shared by every game: a native dialog so Escape and
 * focus return behave the same on all screens.
 */
export const ResultDialog: React.FC<ResultDialogProps> = ({
  isOpen,
  titleId,
  title,
  kicker,
  tone = 'win',
  chip,
  crest,
  stats = [],
  actions,
  links = [],
  dismissLabel,
  dismissTestId,
  onDismiss,
  testId,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const dismiss = () => {
    dialogRef.current?.close();
    onDismiss();
  };

  // An action closes the popup but never counts as a dismissal: the caller owns what
  // happens next, including whether the popup may return for the following match.
  const run = (action: () => void) => {
    dialogRef.current?.close();
    action();
  };

  const isPrimary = (index: number) => (actions[index].tone || (index === 0 ? 'primary' : 'secondary')) === 'primary';
  const primaries = actions.filter((_, i) => isPrimary(i));
  const secondaryActions = actions.filter((_, i) => !isPrimary(i));
  const pairCount = secondaryActions.length + links.length;

  return (
    <dialog
      ref={dialogRef}
      className="ij-dialog"
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={onDismiss}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const inside =
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width;
        if (!inside) dismiss();
      }}
    >
      <div className="ij-dialog__body">
        {crest && (
          <div className="ij-dialog__crest" data-tone={tone} aria-hidden="true">
            {crest}
          </div>
        )}

        {kicker && (
          <div className="ij-dialog__kicker" data-tone={tone}>
            {kicker}
          </div>
        )}

        <h2 id={titleId} className="ij-dialog__title">
          {title}
        </h2>

        {chip && <div className="ij-dialog__chip">{chip}</div>}

        {stats.length > 0 && (
          <div
            className="ij-dialog__stats"
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="ij-dialog__stat-label">{stat.label}</div>
                <div className="ij-dialog__stat-value" data-accent={stat.accent || undefined}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="ij-dialog__actions">
          {primaries.map((action) => (
            <button
              key={action.label}
              type="button"
              className="ij-dialog__btn"
              data-tone="primary"
              onClick={() => run(action.onClick)}
              data-testid={action.testId}
              disabled={action.disabled}
            >
              {action.icon}
              {action.label}
            </button>
          ))}

          {pairCount > 0 && (
            <div className="ij-dialog__pair">
              {secondaryActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="ij-dialog__btn"
                  data-tone="secondary"
                  onClick={() => run(action.onClick)}
                  data-testid={action.testId}
                  disabled={action.disabled}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}

              {links.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  className="ij-dialog__btn"
                  data-tone="secondary"
                  onClick={() => dialogRef.current?.close()}
                  data-testid={link.testId}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          {dismissLabel && (
            <button
              type="button"
              className="ij-dialog__dismiss"
              data-testid={dismissTestId}
              onClick={dismiss}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
};
