import { useState } from 'react';
import endpointsSource from '../../../../packages/api/src/http/endpoints/public.endpoints.ts?raw';
import dispatchSource from '../../../../packages/api/src/http/dispatch.ts?raw';
import donationsSource from '../../../../packages/api/src/donations/donations.service.ts?raw';
import schemaSource from '../../../../packages/api/src/db/migrations/0000_init.sql?raw';
import ledgerSource from '../../../../packages/core/src/ledger.ts?raw';
import patternSource from '../../../../packages/theme/src/pattern.ts?raw';
import tokensSource from '../../../../packages/theme/src/tokens.ts?raw';
import caseCardSource from '../../../../packages/ui/src/case-card.tsx?raw';
import nativeCardSource from '../../../mobile/src/components/CaseCard.tsx?raw';
import { useT } from '../app/i18n';
import { CodeBlock, langFromPath } from '../ui/code';
import { Icon, type IconName } from '../ui/icons';
import { cx } from '../ui/primitives';

/** Real files, embedded at build time (the `?raw` imports above): what you read is what runs. */
const FILES: ReadonlyArray<{
  key: 'theme' | 'pattern' | 'donations' | 'endpoints' | 'dispatch' | 'ledger' | 'schema' | 'caseCard' | 'caseCardNative';
  path: string;
  source: string;
  icon: IconName;
}> = [
  { key: 'donations', path: 'packages/api/src/donations/donations.service.ts', source: donationsSource, icon: 'heart' },
  { key: 'endpoints', path: 'packages/api/src/http/endpoints/public.endpoints.ts', source: endpointsSource, icon: 'workflow' },
  { key: 'dispatch', path: 'packages/api/src/http/dispatch.ts', source: dispatchSource, icon: 'server' },
  { key: 'ledger', path: 'packages/core/src/ledger.ts', source: ledgerSource, icon: 'coins' },
  { key: 'schema', path: 'packages/api/src/db/migrations/0000_init.sql', source: schemaSource, icon: 'database' },
  { key: 'theme', path: 'packages/theme/src/tokens.ts', source: tokensSource, icon: 'sun' },
  { key: 'pattern', path: 'packages/theme/src/pattern.ts', source: patternSource, icon: 'grid' },
  { key: 'caseCard', path: 'packages/ui/src/case-card.tsx', source: caseCardSource, icon: 'monitor' },
  { key: 'caseCardNative', path: 'apps/mobile/src/components/CaseCard.tsx', source: nativeCardSource, icon: 'smartphone' },
];

export function CodeViewer() {
  const { t, f } = useT();
  const [selected, setSelected] = useState<(typeof FILES)[number]['key']>('donations');
  const file = FILES.find((item) => item.key === selected) ?? FILES[0]!;
  return (
    <div className="code-viewer">
      <nav className="code-files" aria-label={t('proto.tech.files')}>
        {FILES.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cx('code-file', item.key === selected && 'is-selected')}
            aria-pressed={item.key === selected}
            onClick={() => setSelected(item.key)}
          >
            <Icon name={item.icon} size={16} />
            <span>
              <strong>{t(`proto.tech.codeFiles.${item.key}`)}</strong>
              <code>{item.path.split('/').pop()}</code>
            </span>
            <small>{f.number(item.source.split('\n').length)}</small>
          </button>
        ))}
      </nav>
      <CodeBlock
        key={file.key}
        code={file.source}
        lang={langFromPath(file.path)}
        title={file.path}
        copyLabel={t('proto.tech.copyCode')}
        copiedLabel={t('common.copied')}
        className="code-viewer-block"
      />
    </div>
  );
}
