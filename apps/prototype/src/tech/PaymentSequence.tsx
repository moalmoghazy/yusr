import { useState } from 'react';
import { useT } from '../app/i18n';
import { Icon, type IconName } from '../ui/icons';
import { Button, cx } from '../ui/primitives';

type Actor = 'gateway' | 'donor' | 'api' | 'db' | 'worker';

const W = 1000;
/** Lifeline order: the API in the middle, the donor next to the gateway she pays on. */
const LANES: Readonly<Record<Actor, number>> = { gateway: 110, donor: 305, api: 500, db: 695, worker: 890 };
const ACTOR_ICON: Readonly<Record<Actor, IconName>> = { gateway: 'credit-card', donor: 'smartphone', api: 'server', db: 'database', worker: 'send' };
const TOP = 70;
const GAP = 46;

/** The nine messages of a donation, with the short label drawn on each arrow. */
const MESSAGES: ReadonlyArray<{ from: Actor; to: Actor; label: string }> = [
  { from: 'donor', to: 'api', label: 'POST /v1/donations' },
  { from: 'api', to: 'db', label: 'INSERT donation' },
  { from: 'api', to: 'gateway', label: 'create checkout' },
  { from: 'api', to: 'donor', label: '201 · next action' },
  { from: 'donor', to: 'gateway', label: 'pay' },
  { from: 'gateway', to: 'api', label: 'webhook · HMAC' },
  { from: 'api', to: 'db', label: 'COMMIT · ledger + case' },
  { from: 'worker', to: 'donor', label: 'receipt · SMS / email' },
  { from: 'donor', to: 'api', label: 'GET /v1/donations/:id' },
];

/**
 * A donation from "Pay" to receipt as a sequence diagram. Each step can be selected on the
 * drawing or walked through with the stepper; the text explains what guarantees it.
 */
export function PaymentSequence() {
  const { t, f, locale } = useT();
  const rtl = locale === 'ar';
  const X = (x: number) => (rtl ? W - x : x);
  const [active, setActive] = useState(0);
  const height = TOP + MESSAGES.length * GAP + 30;
  const step = `s${active + 1}` as 's1';

  return (
    <div className="sequence">
      <figure className="sequence-figure">
        <svg viewBox={`0 0 ${W} ${height}`} className="sequence-svg" role="img" aria-label={t('proto.tech.paymentsCaption')}>
          <defs>
            <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" className="seq-head" />
            </marker>
            <marker id="seq-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" className="seq-head is-on" />
            </marker>
          </defs>
          {(Object.keys(LANES) as Actor[]).map((actor) => (
            <g key={actor} className={cx('seq-actor', `is-${actor}`)}>
              <line x1={X(LANES[actor])} y1={48} x2={X(LANES[actor])} y2={height - 10} className="seq-lifeline" />
              <rect x={X(LANES[actor]) - 78} y={6} width={156} height={42} rx={21} />
              <g transform={`translate(${X(LANES[actor]) + (rtl ? 50 : -66)} 18)`}>
                <Icon name={ACTOR_ICON[actor]} size={17} />
              </g>
              <text x={X(LANES[actor]) + (rtl ? -6 : 8)} y={32} textAnchor="middle">
                {t(`proto.tech.actors.${actor}`)}
              </text>
            </g>
          ))}
          {/* Step 7 happens in one database transaction: bracket it. */}
          <rect
            x={Math.min(X(LANES.api), X(LANES.db)) - 24}
            y={TOP + 6 * GAP - 20}
            width={Math.abs(X(LANES.db) - X(LANES.api)) + 48}
            height={34}
            rx={10}
            className={cx('seq-tx', active === 6 && 'is-on')}
          />
          {MESSAGES.map((message, index) => {
            const y = TOP + index * GAP;
            const from = X(LANES[message.from]);
            const to = X(LANES[message.to]);
            const on = index === active;
            const direction = to > from ? 1 : -1;
            return (
              <g
                key={index}
                className={cx('seq-message', on && 'is-on', index < active && 'is-done')}
                onClick={() => setActive(index)}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${f.number(index + 1)}. ${t(`proto.tech.steps.s${index + 1}.title` as 'proto.tech.steps.s1.title')}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActive(index);
                  }
                }}
              >
                <rect x={Math.min(from, to) - 16} y={y - 22} width={Math.abs(to - from) + 32} height={36} className="seq-hit" />
                <line x1={from + direction * 14} y1={y} x2={to - direction * 4} y2={y} markerEnd={`url(#${on ? 'seq-arrow-on' : 'seq-arrow'})`} />
                <circle cx={from} cy={y} r={11} />
                <text x={from} y={y + 4} textAnchor="middle" className="seq-num">
                  {f.number(index + 1)}
                </text>
                <text x={(from + to) / 2} y={y - 7} textAnchor="middle" className="seq-label" direction="ltr">
                  {message.label}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <div className="sequence-step" aria-live="polite">
        <span className="sequence-count">{t('proto.tech.step', { n: f.number(active + 1), total: f.number(MESSAGES.length) })}</span>
        <h3>{t(`proto.tech.steps.${step}.title`)}</h3>
        <p>{t(`proto.tech.steps.${step}.body`)}</p>
        <div className="sequence-nav">
          <Button variant="outline" size="sm" icon="back" disabled={active === 0} onClick={() => setActive(active - 1)}>
            {t('proto.tech.prev')}
          </Button>
          <div className="sequence-dots" aria-hidden>
            {MESSAGES.map((_, index) => (
              <i key={index} className={cx(index === active && 'is-on', index < active && 'is-done')} />
            ))}
          </div>
          <Button size="sm" iconEnd="forward" disabled={active === MESSAGES.length - 1} onClick={() => setActive(active + 1)}>
            {t('proto.tech.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
