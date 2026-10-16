import { CASE_TRANSITIONS, permissionsFor, type CaseStatus, type Role, type TransitionRule } from '@yusr/core';
import { useState } from 'react';
import { useT } from '../app/i18n';
import { Icon } from '../ui/icons';
import { Chip, cx } from '../ui/primitives';

type Viewer = 'all' | 'system' | Role;

const W = 1000;
const MAIN: readonly CaseStatus[] = ['draft', 'under_review', 'field_verified', 'published', 'funded', 'closed'];
const BOX = { w: 128, h: 56 };
const ROW = 96;
const SIDE = 228;
const left = (index: number) => 16 + index * 168;

/** Where each status sits (left edge, top), before mirroring for Arabic. */
const PLACES: Readonly<Record<CaseStatus, { x: number; y: number }>> = {
  draft: { x: left(0), y: ROW },
  under_review: { x: left(1), y: ROW },
  field_verified: { x: left(2), y: ROW },
  published: { x: left(3), y: ROW },
  funded: { x: left(4), y: ROW },
  closed: { x: left(5), y: ROW },
  rejected: { x: (left(1) + left(2)) / 2, y: SIDE },
  paused: { x: left(3), y: SIDE },
};

type Point = [number, number];

/** The drawn route of each transition in LTR coordinates (the rules themselves come from @yusr/core). */
function route(rule: TransitionRule): Point[] {
  const from = PLACES[rule.from];
  const to = PLACES[rule.to];
  const mid = (place: { x: number }) => place.x + BOX.w / 2;
  if (from.y === ROW && to.y === ROW && to.x > from.x && to.x - from.x < 200)
    return [
      [from.x + BOX.w, ROW + BOX.h / 2],
      [to.x, ROW + BOX.h / 2],
    ];
  if (rule.from === 'under_review' && rule.to === 'draft')
    return [
      [mid(from), ROW],
      [mid(from), ROW - 40],
      [mid(to), ROW - 40],
      [mid(to), ROW],
    ];
  if (rule.from === 'published' && rule.to === 'closed')
    return [
      [mid(from) + 20, ROW],
      [mid(from) + 20, ROW - 56],
      [mid(to), ROW - 56],
      [mid(to), ROW],
    ];
  if (rule.to === 'rejected')
    return [
      [mid(from), ROW + BOX.h],
      [mid(to) + (rule.from === 'under_review' ? -30 : 30), SIDE],
    ];
  if (rule.from === 'published' && rule.to === 'paused')
    return [
      [mid(from) - 16, ROW + BOX.h],
      [mid(to) - 16, SIDE],
    ];
  if (rule.from === 'paused' && rule.to === 'published')
    return [
      [mid(from) + 16, SIDE],
      [mid(to) + 16, ROW + BOX.h],
    ];
  if (rule.from === 'paused' && rule.to === 'closed')
    return [
      [from.x + BOX.w, SIDE + BOX.h / 2],
      [mid(to), SIDE + BOX.h / 2],
      [mid(to), ROW + BOX.h],
    ];
  return [
    [mid(from), from.y + BOX.h / 2],
    [mid(to), to.y + BOX.h / 2],
  ];
}

const VIEWERS: readonly Viewer[] = ['all', 'volunteer', 'field_auditor', 'content_moderator', 'financial_officer', 'super_admin', 'system'];

/**
 * The case pipeline drawn from CASE_TRANSITIONS. Choosing a role lights up the moves its
 * permissions allow; "funded" belongs to the platform alone.
 */
export function Lifecycle() {
  const { t, locale } = useT();
  const rtl = locale === 'ar';
  const [viewer, setViewer] = useState<Viewer>('all');
  const X = (x: number) => (rtl ? W - x : x);
  const grant = viewer === 'all' || viewer === 'system' ? null : permissionsFor([viewer]);
  const allowed = (rule: TransitionRule) =>
    viewer === 'all' ? true : viewer === 'system' ? rule.permission === 'system' : rule.permission !== 'system' && grant!.has(rule.permission);
  const visibleRules = CASE_TRANSITIONS.filter(allowed);
  const label = (option: Viewer) => (option === 'all' ? t('proto.tech.everyone') : option === 'system' ? t('proto.tech.platform') : t(`roles.${option}`));

  return (
    <div className="lifecycle">
      <div className="chip-row" role="group" aria-label={t('proto.tech.lifecycleRole')}>
        {VIEWERS.map((option) => (
          <Chip
            key={option}
            selected={viewer === option}
            onClick={() => setViewer(option)}
            icon={option === 'system' ? 'zap' : option === 'all' ? 'workflow' : undefined}
          >
            {label(option)}
          </Chip>
        ))}
      </div>

      <figure className="lifecycle-figure">
        <svg viewBox={`0 ${ROW - 76} ${W} ${SIDE + BOX.h - ROW + 96}`} className="lifecycle-svg" role="img" aria-label={t('proto.tech.lifecycleCaption')}>
          <defs>
            {['base', 'on', 'gold'].map((kind) => (
              <marker key={kind} id={`lc-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10Z" className={`lc-head is-${kind}`} />
              </marker>
            ))}
          </defs>
          {CASE_TRANSITIONS.map((rule) => {
            const on = viewer !== 'all' && allowed(rule);
            const gold = rule.permission === 'system';
            const points = route(rule)
              .map(([x, y]) => `${X(x)},${y}`)
              .join(' ');
            return (
              <polyline
                key={`${rule.from}-${rule.to}`}
                points={points}
                className={cx('lc-edge', on && 'is-on', viewer !== 'all' && !on && 'is-dim', gold && 'is-gold', rule.requiresReason && 'is-reason')}
                markerEnd={`url(#lc-arrow-${gold ? 'gold' : on ? 'on' : 'base'})`}
              />
            );
          })}
          {(Object.keys(PLACES) as CaseStatus[]).map((status) => {
            const place = PLACES[status];
            const x = rtl ? W - place.x - BOX.w : place.x;
            const involved = viewer === 'all' || visibleRules.some((rule) => rule.from === status || rule.to === status);
            return (
              <g key={status} className={cx('lc-node', `is-${status}`, !involved && 'is-dim', !MAIN.includes(status) && 'is-side')}>
                <rect x={x} y={place.y} width={BOX.w} height={BOX.h} rx={14} />
                <text x={x + BOX.w / 2} y={place.y + BOX.h / 2 + 5} textAnchor="middle">
                  {t(`status.${status}`)}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <ul className="lc-rules">
        {visibleRules.map((rule) => (
          <li key={`${rule.from}-${rule.to}`} className={cx(rule.permission === 'system' && 'is-system')}>
            <span className="lc-rule-path">
              {t(`status.${rule.from}`)} <Icon name="arrow-forward" size={14} /> {t(`status.${rule.to}`)}
            </span>
            <span className="lc-rule-permission">
              {rule.permission === 'system' ? t('proto.tech.platform') : t(`permissions.${rule.permission}` as 'permissions.cases:read')}
            </span>
            {rule.requiresReason && <span className="lc-rule-reason">{t('proto.tech.reasonRequired')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
