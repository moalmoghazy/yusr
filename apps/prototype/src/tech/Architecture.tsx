import { useT } from '../app/i18n';
import { Icon, type IconName } from '../ui/icons';

const W = 1000;
const H = 520;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The system on one page: three apps → one API → PostgreSQL, Redis and object storage;
 * gateways on one side (checkout out, signed webhooks in), the outbox worker on the other.
 * Laid out left-to-right and mirrored for Arabic.
 */
export function Architecture() {
  const { t, locale } = useT();
  const rtl = locale === 'ar';
  const X = (x: number) => (rtl ? W - x : x);
  const rect = (box: Box) => ({ x: rtl ? W - box.x - box.w : box.x, y: box.y, width: box.w, height: box.h });
  const cx = (box: Box) => X(box.x + box.w / 2);

  const web: Box = { x: 100, y: 24, w: 200, h: 80 };
  const mobile: Box = { x: 400, y: 24, w: 200, h: 80 };
  const admin: Box = { x: 700, y: 24, w: 200, h: 80 };
  const api: Box = { x: 300, y: 170, w: 400, h: 180 };
  const pay: Box = { x: 10, y: 180, w: 180, h: 150 };
  const worker: Box = { x: 810, y: 180, w: 180, h: 100 };
  const out: Box = { x: 796, y: 400, w: 194, h: 100 };
  const pg: Box = { x: 300, y: 420, w: 124, h: 80 };
  const redis: Box = { x: 438, y: 420, w: 124, h: 80 };
  const store: Box = { x: 576, y: 420, w: 124, h: 80 };

  const modules = [
    { key: 'auth', icon: 'lock' },
    { key: 'cases', icon: 'clipboard-check' },
    { key: 'donations', icon: 'heart' },
    { key: 'finance', icon: 'landmark' },
    { key: 'documents', icon: 'file-text' },
  ] as const;

  return (
    <figure className="arch">
      <svg viewBox={`0 0 ${W} ${H}`} className="arch-svg" role="img" aria-label={t('proto.tech.architectureCaption')}>
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10Z" className="arch-head" />
          </marker>
          <marker id="arch-arrow-gold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10Z" className="arch-head is-gold" />
          </marker>
        </defs>

        {/* ------------------------------------------------ edges (under the boxes) */}
        <Edge from={[X(200), 104]} to={[X(370), 170]} />
        <Edge from={[X(500), 104]} to={[X(500), 170]} />
        <Edge from={[X(800), 104]} to={[X(630), 170]} />
        <Label at={[X(500), 138]} text={t('proto.tech.arch.edges.https')} />

        {[
          { box: pg, label: t('proto.tech.arch.edges.sql') },
          { box: redis, label: t('proto.tech.arch.edges.redis') },
          { box: store, label: t('proto.tech.arch.edges.upload') },
        ].map(({ box, label }) => (
          <g key={box.x}>
            <Edge from={[cx(box), 350]} to={[cx(box), 420]} />
            <Label at={[cx(box), 386]} text={label} />
          </g>
        ))}

        <Edge from={[X(300), 222]} to={[X(190), 222]} gold />
        <Label at={[X(245), 204]} text={t('proto.tech.arch.edges.checkout')} />
        <Edge from={[X(190), 298]} to={[X(300), 298]} gold />
        <Label at={[X(245), 318]} text={t('proto.tech.arch.edges.webhook')} />

        <Edge from={[X(700), 232]} to={[X(810), 232]} dashed />
        <Label at={[X(755), 214]} text={t('proto.tech.arch.edges.outbox')} />
        <Edge from={[cx(worker), 280]} to={[cx(worker), 400]} />
        <Label at={[cx(worker), 340]} text={t('proto.tech.arch.edges.notify')} />

        {/* ------------------------------------------------ clients */}
        <Node box={web} rect={rect} cx={cx} icon="monitor" title={t('proto.tech.arch.web')} sub={t('proto.tech.arch.webTech')} />
        <Node box={mobile} rect={rect} cx={cx} icon="smartphone" title={t('proto.tech.arch.mobile')} sub={t('proto.tech.arch.mobileTech')} />
        <Node box={admin} rect={rect} cx={cx} icon="kanban" title={t('proto.tech.arch.admin')} sub={t('proto.tech.arch.adminTech')} />

        {/* ------------------------------------------------ the API */}
        <rect {...rect(api)} rx={16} className="arch-box is-api" />
        <g transform={`translate(${cx(api) - 9} 184)`}>
          <Icon name="server" size={18} />
        </g>
        <text x={cx(api)} y={222} textAnchor="middle" className="arch-title is-large">
          {t('proto.tech.arch.api')}
        </text>
        <text x={cx(api)} y={242} textAnchor="middle" className="arch-sub">
          {t('proto.tech.arch.apiTech')}
        </text>
        {modules.map((module, i) => {
          const row = i < 3 ? 0 : 1;
          const inRow = row === 0 ? 3 : 2;
          const position = row === 0 ? i : i - 3;
          const chipW = 120;
          const gap = 12;
          const start = api.x + (api.w - (inRow * chipW + (inRow - 1) * gap)) / 2;
          const box: Box = { x: start + position * (chipW + gap), y: 262 + row * 40, w: chipW, h: 30 };
          return (
            <g key={module.key} className="arch-chip">
              <rect {...rect(box)} rx={15} />
              <g transform={`translate(${rtl ? X(box.x) - 26 : box.x + 12} ${box.y + 8})`}>
                <Icon name={module.icon} size={14} />
              </g>
              <text x={rtl ? X(box.x) - 32 : box.x + 32} y={box.y + 19.5} textAnchor="start">
                {t(`proto.tech.arch.modules.${module.key}`)}
              </text>
            </g>
          );
        })}

        {/* ------------------------------------------------ sides */}
        <rect {...rect(pay)} rx={14} className="arch-box is-pay" />
        <g transform={`translate(${cx(pay) - 9} ${pay.y + 18})`}>
          <Icon name="credit-card" size={18} />
        </g>
        <text x={cx(pay)} y={pay.y + 58} textAnchor="middle" className="arch-title">
          {t('proto.tech.arch.gateways')}
        </text>
        {t('proto.tech.arch.gatewaysTech')
          .split(' · ')
          .map((name, i, all) => (
            <text key={name} x={cx(pay)} y={pay.y + 80 + i * 14 - (all.length > 4 ? 4 : 0)} textAnchor="middle" className="arch-sub">
              {name}
            </text>
          ))}

        <Node box={worker} rect={rect} cx={cx} icon="send" title={t('proto.tech.arch.worker')} sub={t('proto.tech.arch.workerTech')} />
        <rect {...rect(out)} rx={14} className="arch-box" />
        {[
          { icon: 'message' as const, text: t('proto.tech.arch.channels'), y: out.y + 38 },
          { icon: 'activity' as const, text: t('proto.tech.arch.ops'), y: out.y + 72 },
        ].map((row) => (
          <g key={row.y}>
            <g transform={`translate(${rtl ? X(out.x) - 30 : out.x + 14} ${row.y - 12})`}>
              <Icon name={row.icon} size={16} />
            </g>
            <text x={rtl ? X(out.x) - 38 : out.x + 38} y={row.y} textAnchor="start" className="arch-sub is-strong">
              {row.text}
            </text>
          </g>
        ))}

        {/* ------------------------------------------------ data */}
        <Node box={pg} rect={rect} cx={cx} icon="database" title={t('proto.tech.arch.postgres')} sub={t('proto.tech.arch.postgresTech')} small />
        <Node box={redis} rect={rect} cx={cx} icon="zap" title={t('proto.tech.arch.redis')} sub={t('proto.tech.arch.redisTech')} small />
        <Node box={store} rect={rect} cx={cx} icon="cloud" title={t('proto.tech.arch.storage')} sub={t('proto.tech.arch.storageTech')} small />
      </svg>
      <figcaption className="sr-only">{t('proto.tech.architectureCaption')}</figcaption>
    </figure>
  );
}

function Node({
  box,
  rect,
  cx,
  icon,
  title,
  sub,
  small,
}: {
  box: Box;
  rect: (box: Box) => { x: number; y: number; width: number; height: number };
  cx: (box: Box) => number;
  icon: IconName;
  title: string;
  sub: string;
  small?: boolean;
}) {
  const center = cx(box);
  return (
    <g>
      <rect {...rect(box)} rx={14} className="arch-box" />
      <g transform={`translate(${center - 9} ${box.y + 12})`}>
        <Icon name={icon} size={18} />
      </g>
      <text x={center} y={box.y + (small ? 48 : 50)} textAnchor="middle" className="arch-title">
        {title}
      </text>
      <text x={center} y={box.y + (small ? 66 : 68)} textAnchor="middle" className={small ? 'arch-sub is-small' : 'arch-sub'}>
        {sub}
      </text>
    </g>
  );
}

function Edge({ from, to, gold, dashed }: { from: [number, number]; to: [number, number]; gold?: boolean; dashed?: boolean }) {
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      className={gold ? 'arch-edge is-gold' : dashed ? 'arch-edge is-dashed' : 'arch-edge'}
      markerEnd={`url(#${gold ? 'arch-arrow-gold' : 'arch-arrow'})`}
    />
  );
}

/** A small pill on an edge; its width follows the text length. */
function Label({ at, text }: { at: [number, number]; text: string }) {
  const width = Math.max(44, text.length * 6.2 + 16);
  return (
    <g className="arch-label">
      <rect x={at[0] - width / 2} y={at[1] - 10} width={width} height={20} rx={10} />
      <text x={at[0]} y={at[1] + 3.5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
