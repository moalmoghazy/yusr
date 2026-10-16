import { useT } from '../app/i18n';
import { Icon, type IconName } from '../ui/icons';
import { manifest, type PackageFact } from './manifest';

const COPY: Readonly<Record<string, { icon: IconName; ar: string; en: string }>> = {
  '@yusr/web': { icon: 'monitor', ar: 'موقع المتبرعين على Next.js، بالعربية والإنجليزية.', en: 'The donor website on Next.js, in Arabic and English.' },
  '@yusr/admin': { icon: 'kanban', ar: 'لوحة التحكم لفريق العمل على Next.js.', en: 'The control hub for staff, on Next.js.' },
  '@yusr/mobile': { icon: 'smartphone', ar: 'تطبيق iOS وAndroid على Expo.', en: 'The iOS and Android app, on Expo.' },
  '@yusr/prototype': {
    icon: 'play',
    ar: 'هذا النموذج التفاعلي، مبني من الحزم الحقيقية في ملف واحد.',
    en: 'This interactive prototype, built from the real packages into one file.',
  },
  '@yusr/api': {
    icon: 'server',
    ar: 'الـ API على NestJS وPostgreSQL: المدفوعات والدفتر ودورة الحالة والصلاحيات والتدقيق.',
    en: 'The NestJS API on PostgreSQL: payments, ledger, case pipeline, RBAC and audit.',
  },
  '@yusr/core': {
    icon: 'layers',
    ar: 'قواعد المجال بلا إطار عمل: المال ودورة الحالة والصلاحيات والرسوم والقيود وقواعد التحقق.',
    en: 'Framework-free domain rules: money, case lifecycle, RBAC, fees, ledger postings and validation.',
  },
  '@yusr/sdk': {
    icon: 'code',
    ar: 'عميل الـ API بأنواع كاملة، وخادم تجريبي في الذاكرة بالعقد نفسه.',
    en: 'Typed API client, plus an in-memory demo backend with the same contract.',
  },
  '@yusr/theme': {
    icon: 'sun',
    ar: 'الهوية: الألوان والخطوط والشعار والنقشة، بمخرجات CSS وTailwind والجوال.',
    en: 'The brand: colours, type, logo and pattern, with CSS, Tailwind and native outputs.',
  },
  '@yusr/i18n': {
    icon: 'languages',
    ar: 'نصوص العربية والإنجليزية، وتنسيق الأرقام والعملات والتواريخ وصيغ الجمع.',
    en: 'Arabic and English copy; number, currency and date formatting; plural rules.',
  },
  '@yusr/ui': {
    icon: 'grid',
    ar: 'مكوّنات React المشتركة للموقع ولوحة التحكم، ومنها بطاقة الحالة.',
    en: 'Shared React components for the website and control hub, including the case card.',
  },
  '@yusr/config': { icon: 'sliders', ar: 'إعدادات TypeScript المشتركة.', en: 'Shared TypeScript configuration.' },
};

/** The workspace as it is: every app and package, read from its package.json and sources. */
export function Monorepo() {
  const groups = [
    { key: 'apps', items: manifest.packages.filter((item) => item.dir.startsWith('apps/')) },
    { key: 'packages', items: manifest.packages.filter((item) => item.dir.startsWith('packages/') && item.name !== '@yusr/config') },
  ];
  return (
    <div className="monorepo">
      {groups.map((group) => (
        <div key={group.key} className="mono-group">
          <h3 className="mono-group-title" dir="ltr">
            <Icon name="package" size={16} /> {group.key}/
          </h3>
          <div className="mono-grid">
            {group.items.map((item) => (
              <PackageCard key={item.name} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PackageCard({ item }: { item: PackageFact }) {
  const { t, f, locale } = useT();
  const copy = COPY[item.name];
  return (
    <article className="mono-card">
      <header>
        <span className="mono-icon">
          <Icon name={copy?.icon ?? 'package'} size={18} />
        </span>
        <div>
          <code className="mono-name">{item.name}</code>
          <code className="mono-dir">{item.dir}</code>
        </div>
      </header>
      <p>{copy?.[locale] ?? item.description}</p>
      <footer>
        <span>{t('proto.tech.sourceSize', { files: f.number(item.sourceFiles), lines: f.number(item.sourceLines) })}</span>
        <span>{t('proto.tech.testFiles', { count: item.testFiles })}</span>
        {item.workspaceDeps.length > 0 && (
          <span className="mono-uses">
            {t('proto.tech.uses')}{' '}
            {item.workspaceDeps.map((dep) => (
              <code key={dep}>{dep.replace('@yusr/', '')}</code>
            ))}
          </span>
        )}
      </footer>
    </article>
  );
}
