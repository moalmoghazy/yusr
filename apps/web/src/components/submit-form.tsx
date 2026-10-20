'use client';

import {
  CASE_CATEGORIES,
  CATEGORY_META,
  EGYPT_GOVERNORATES,
  parseAmountInput,
  SAUDI_REGIONS,
  toE164,
  toMinor,
  type CaseCategory,
  type DocumentKind,
  type Locale,
  type SubmitCaseResult,
} from '@yusr/core';
import { buttonClasses, cn, Icon, textFor, type IconName } from '@yusr/ui';
import Link from 'next/link';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { href } from '@/lib/i18n';
import { requestUpload, sendCase } from '@/lib/submit';

type Slot = 'id' | 'proof';
type Upload =
  | { status: 'uploading'; name: string }
  | { status: 'done'; name: string; size: number; kind: DocumentKind; storageKey: string; sha256: string }
  | { status: 'error'; name: string; message: string };

const PROOF_KINDS = ['medical_report', 'price_quote', 'invoice', 'debt_proof', 'court_ruling', 'school_record'] as const satisfies readonly DocumentKind[];
const CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_BYTES = 20 * 1024 * 1024;
const TITLE_MIN = 8;
const STORY_MIN = 80;
const GOAL_MIN_MINOR = 1_000_00;
const GOAL_MAX_MINOR = 10_000_000_00;

const control =
  'w-full rounded-control border border-input bg-card px-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid]:border-destructive';

/** SHA-256 of the file, computed in the browser: the case refers to exactly the bytes that were stored. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The case submission portal, for partner associations (جمعيات أهلية registered with the Ministry of
 * Social Solidarity). Submissions by individuals are paused: shown greyed out, not selectable.
 * Documents go straight from the browser to private storage through ten-minute upload links;
 * the case then refers to them by key and hash. Nothing is published from here: every case is
 * reviewed and visited in the field first.
 */
export function SubmitForm({ locale }: { locale: Locale }) {
  const { t, f, l } = textFor(locale);
  const ids = useId();
  const [orgName, setOrgName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [category, setCategory] = useState<CaseCategory>('medical');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [region, setRegion] = useState('EG-C');
  const [goal, setGoal] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [proofKind, setProofKind] = useState<(typeof PROOF_KINDS)[number]>('medical_report');
  const [uploads, setUploads] = useState<Partial<Record<Slot, Upload>>>({});
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<{ message: string; fields: string[] } | null>(null);
  const [done, setDone] = useState<SubmitCaseResult | null>(null);

  const currency = region.startsWith('SA-') ? 'SAR' : 'EGP';
  const goalMajor = parseAmountInput(goal);
  const goalMinor = goalMajor === null ? null : toMinor(goalMajor, currency);
  const goalValid = goalMinor !== null && goalMinor >= GOAL_MIN_MINOR && goalMinor <= GOAL_MAX_MINOR;
  const nationalIdValid = nationalId === '' || /^(\d{14}|\d{10})$/.test(nationalId);
  const today = new Date().toISOString().slice(0, 10);
  const deadlineValid = !urgent || (deadline !== '' && deadline >= today);
  const idDoc = uploads.id?.status === 'done' ? uploads.id : null;
  const proofDoc = uploads.proof?.status === 'done' ? uploads.proof : null;
  const contactE164 = toE164(contactPhone, currency === 'SAR' ? 'SA' : 'EG');
  const associationValid = orgName.trim().length >= 3 && orgNumber.trim() !== '' && contactName.trim().length >= 2 && contactE164 !== null;
  const ready =
    associationValid &&
    title.trim().length >= TITLE_MIN &&
    story.trim().length >= STORY_MIN &&
    goalValid &&
    nationalIdValid &&
    deadlineValid &&
    Boolean(idDoc && proofDoc) &&
    consent;
  const flagged = (field: string) => problem?.fields.includes(field) || undefined;

  async function attach(slot: Slot, file: File | undefined) {
    if (!file) return;
    const contentType = file.type || (/\.heic$/i.test(file.name) ? 'image/heic' : '');
    if (!CONTENT_TYPES.includes(contentType) || file.size === 0 || file.size > MAX_BYTES) {
      setUploads((current) => ({ ...current, [slot]: { status: 'error', name: file.name, message: t('submit.fileInvalid') } }));
      return;
    }
    const kind: DocumentKind = slot === 'id' ? 'national_id' : proofKind;
    setUploads((current) => ({ ...current, [slot]: { status: 'uploading', name: file.name } }));
    try {
      const [sha256, grant] = await Promise.all([sha256Hex(file), requestUpload({ kind, contentType, sizeBytes: file.size })]);
      if (!grant.ok) throw new Error(t(`errors.${grant.code}`));
      // The browser sets Content-Length itself (it may not be set by script).
      const headers = Object.fromEntries(Object.entries(grant.ticket.headers).filter(([name]) => name.toLowerCase() !== 'content-length'));
      const response = await fetch(grant.ticket.url, { method: 'PUT', headers, body: file });
      if (!response.ok) throw new Error(t('submit.uploadFailed'));
      setUploads((current) => ({ ...current, [slot]: { status: 'done', name: file.name, size: file.size, kind, storageKey: grant.ticket.key, sha256 } }));
    } catch (error) {
      setUploads((current) => ({
        ...current,
        [slot]: { status: 'error', name: file.name, message: error instanceof Error && error.message ? error.message : t('submit.uploadFailed') },
      }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !idDoc || !proofDoc || goalMinor === null || !contactE164) return;
    setSending(true);
    setProblem(null);
    const text = (value: string) => ({ [locale]: value.trim() });
    const result = await sendCase(locale, {
      category,
      submitterRelation: 'association',
      association: { name: orgName.trim(), registrationNumber: orgNumber.trim(), contactName: contactName.trim(), contactPhone: contactE164 },
      title: text(title),
      story: text(story),
      region,
      currency,
      goalMinor,
      isUrgent: urgent,
      // The end of the chosen day, in the submitter's time zone.
      deadline: urgent && deadline ? new Date(`${deadline}T23:59:00`).toISOString() : null,
      beneficiary: { pseudonym: pseudonym.trim() ? text(pseudonym) : null, nationalId: nationalId || null },
      documents: [idDoc, proofDoc].map(({ kind, storageKey, sha256 }) => ({ kind, storageKey, sha256 })),
      consent: true,
    }).catch(() => ({ ok: false as const, code: 'generic' as const, fields: [] }));
    setSending(false);
    if (result.ok) {
      setDone(result.result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setProblem({ message: t(`errors.${result.code}`), fields: result.fields });
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-card border border-border bg-card p-8 text-center shadow-sm" role="status">
        <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
          <Icon name="check" size={30} strokeWidth={2.4} />
        </span>
        <h2 className="font-display text-2xl font-bold">
          {t('submit.submitted', { reference: '' })}
          <span dir="ltr" className="font-mono">
            {done.reference}
          </span>
        </h2>
        <p className="text-muted-foreground">{t('submit.nextSteps')}</p>
        {done.possibleDuplicate && (
          <p className="flex items-start gap-2 rounded-control bg-warning-soft p-3 text-start text-sm text-warning-soft-foreground">
            <Icon name="alert" size={18} className="mt-0.5" /> {t('submit.possibleDuplicate')}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={href(locale, '/cases')} className={buttonClasses({ variant: 'outline' })}>
            {t('landing.heroPrimary')}
          </Link>
          <button type="button" className={buttonClasses({ variant: 'soft' })} onClick={() => window.location.reload()}>
            <Icon name="plus" size={18} />
            {t('submit.another')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate aria-describedby={problem ? `${ids}-problem` : undefined}>
      {/* ------------------------------------------------------------ 1 · who */}
      <Step number={1} total={4} title={t('submit.steps.who')} locale={locale}>
        <div role="radiogroup" aria-label={t('submit.steps.who')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PathCard icon="landmark" title={t('submit.path.association.title')} body={t('submit.path.association.body')} value="association" checked />
          <PathCard
            icon="users"
            title={t('submit.path.individual.title')}
            body={t('submit.path.individual.body')}
            value="individual"
            badge={t('submit.path.individual.badge')}
            disabled
          />
        </div>
        <Field label={t('submit.association.name')} htmlFor={`${ids}-org`}>
          <input
            id={`${ids}-org`}
            maxLength={120}
            value={orgName}
            placeholder={t('submit.association.namePlaceholder')}
            onChange={(event) => setOrgName(event.target.value)}
            aria-invalid={flagged('association')}
            autoComplete="organization"
            dir="auto"
            className={cn(control, 'h-11')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('submit.association.registrationNumber')} htmlFor={`${ids}-org-number`} hint={t('submit.association.registrationHint')}>
            <input
              id={`${ids}-org-number`}
              maxLength={40}
              value={orgNumber}
              onChange={(event) => setOrgNumber(event.target.value)}
              aria-invalid={flagged('association')}
              dir="ltr"
              className={cn(control, 'h-11 text-start')}
            />
          </Field>
          <Field label={t('submit.association.contactName')} htmlFor={`${ids}-contact`}>
            <input
              id={`${ids}-contact`}
              maxLength={80}
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              aria-invalid={flagged('association')}
              autoComplete="name"
              dir="auto"
              className={cn(control, 'h-11')}
            />
          </Field>
        </div>
        <Field
          label={t('submit.association.contactPhone')}
          htmlFor={`${ids}-contact-phone`}
          hint={t('submit.association.contactHint')}
          invalid={contactPhone !== '' && contactE164 === null}
        >
          <input
            id={`${ids}-contact-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            aria-invalid={(contactPhone !== '' && contactE164 === null) || flagged('association')}
            dir="ltr"
            className={cn(control, 'h-11 text-start')}
          />
        </Field>
      </Step>

      {/* ------------------------------------------------------------ 2 · the case */}
      <Step number={2} total={4} title={t('submit.steps.details')} locale={locale}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('submit.fields.category')}</legend>
          <div className="flex flex-wrap gap-2">
            {CASE_CATEGORIES.map((value) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} className="peer sr-only" />
                <span className="inline-flex h-10 items-center gap-1.5 rounded-chip border border-border bg-card px-4 text-sm font-semibold transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
                  <Icon name={CATEGORY_META[value].icon} size={16} />
                  {t(`categories.${value}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={t('submit.fields.title')} htmlFor={`${ids}-title`} hint={`${f.number(title.length)} / ${f.number(120)}`}>
          <input
            id={`${ids}-title`}
            maxLength={120}
            value={title}
            placeholder={t('submit.fields.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={flagged('title')}
            dir="auto"
            className={cn(control, 'h-11')}
          />
        </Field>
        <Field
          label={t('submit.fields.story')}
          htmlFor={`${ids}-story`}
          hint={
            story.trim().length < STORY_MIN
              ? t('submit.fields.storyMin', { count: f.number(STORY_MIN) })
              : `${f.number(story.trim().length)} / ${f.number(6000)}`
          }
        >
          <textarea
            id={`${ids}-story`}
            rows={6}
            maxLength={6000}
            value={story}
            placeholder={t('submit.fields.storyPlaceholder')}
            onChange={(event) => setStory(event.target.value)}
            aria-invalid={flagged('story')}
            dir="auto"
            className={cn(control, 'py-2.5 leading-relaxed')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('submit.fields.region')} htmlFor={`${ids}-region`}>
            <select id={`${ids}-region`} value={region} onChange={(event) => setRegion(event.target.value)} className={cn(control, 'h-11')}>
              {(
                [
                  ['EG', EGYPT_GOVERNORATES],
                  ['SA', SAUDI_REGIONS],
                ] as const
              ).map(([country, regions]) => (
                <optgroup key={country} label={t(`submit.countries.${country}`)}>
                  {regions.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {l(entry.name)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field
            label={t('submit.fields.goal')}
            htmlFor={`${ids}-goal`}
            hint={t('submit.goalRange', {
              min: f.money(GOAL_MIN_MINOR, currency, { fractionDigits: 0 }),
              max: f.money(GOAL_MAX_MINOR, currency, { compact: true }),
            })}
            invalid={goal !== '' && !goalValid}
          >
            <span className="relative block">
              <input
                id={`${ids}-goal`}
                inputMode="decimal"
                autoComplete="off"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                aria-invalid={(goal !== '' && !goalValid) || flagged('goalMinor')}
                className={cn(control, 'h-11 pe-14 font-bold tabular-nums')}
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{f.currencyLabel(currency)}</span>
            </span>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('submit.fields.pseudonym')} htmlFor={`${ids}-pseudonym`} hint={t('submit.fields.pseudonymHint')}>
            <input
              id={`${ids}-pseudonym`}
              maxLength={60}
              value={pseudonym}
              placeholder={t('submit.fields.pseudonymPlaceholder')}
              onChange={(event) => setPseudonym(event.target.value)}
              dir="auto"
              className={cn(control, 'h-11')}
            />
          </Field>
          <Field label={t('submit.fields.nationalId')} htmlFor={`${ids}-nid`} hint={t('submit.fields.nationalIdHint')} invalid={!nationalIdValid}>
            <input
              id={`${ids}-nid`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              value={nationalId}
              // Accepts Arabic-Indic digits too: «٢٩٠٠١٠١…» becomes 2900101….
              onChange={(event) => setNationalId(event.target.value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/\D/g, ''))}
              aria-invalid={!nationalIdValid || flagged('beneficiary')}
              dir="ltr"
              className={cn(control, 'h-11 font-mono tracking-wider')}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} className="size-4 accent-[var(--primary)]" />
          {t('submit.fields.urgent')}
        </label>
        {urgent && (
          <Field label={t('submit.fields.deadline')} htmlFor={`${ids}-deadline`} invalid={deadline !== '' && !deadlineValid}>
            <input
              id={`${ids}-deadline`}
              type="date"
              min={today}
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className={cn(control, 'h-11 sm:max-w-xs')}
            />
          </Field>
        )}
      </Step>

      {/* ------------------------------------------------------------ 3 · documents */}
      <Step number={3} total={4} title={t('submit.steps.documents')} locale={locale}>
        <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
          <Icon name="lock" size={17} className="mt-0.5" />
          {t('submit.docsHint')}
        </p>
        <p className="text-sm text-muted-foreground">{t('submit.docsRequired')}</p>
        <UploadSlot
          label={t('submit.docId')}
          upload={uploads.id}
          locale={locale}
          onFile={(file) => void attach('id', file)}
          onClear={() => setUploads(({ id: _id, ...rest }) => rest)}
        />
        <Field label={t('submit.docProofKind')} htmlFor={`${ids}-proof-kind`}>
          <select
            id={`${ids}-proof-kind`}
            value={proofKind}
            // The kind is fixed once the file is uploaded under it; replacing the file frees it.
            disabled={Boolean(uploads.proof && uploads.proof.status !== 'error')}
            onChange={(event) => setProofKind(event.target.value as (typeof PROOF_KINDS)[number])}
            className={cn(control, 'h-11 disabled:opacity-60 sm:max-w-sm')}
          >
            {PROOF_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`case.documentKinds.${kind}`)}
              </option>
            ))}
          </select>
        </Field>
        <UploadSlot
          label={t('submit.docProof')}
          upload={uploads.proof}
          locale={locale}
          onFile={(file) => void attach('proof', file)}
          onClear={() => setUploads(({ proof: _proof, ...rest }) => rest)}
        />
      </Step>

      {/* ------------------------------------------------------------ 4 · review and send */}
      <Step number={4} total={4} title={t('submit.steps.review')} locale={locale}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[
            [t('submit.steps.who'), orgName.trim() || t('submit.relation.association')],
            [t('submit.fields.category'), t(`categories.${category}`)],
            [t('submit.fields.title'), title.trim() || '—'],
            [t('submit.fields.goal'), goalValid && goalMinor !== null ? f.money(goalMinor, currency) : '—'],
            [t('submit.steps.documents'), t('units.documents', { count: Number(Boolean(idDoc)) + Number(Boolean(proofDoc)) })],
            [
              t('submit.fields.region'),
              l([...EGYPT_GOVERNORATES, ...SAUDI_REGIONS].find((entry) => entry.code === region)?.name ?? { ar: region, en: region }),
            ],
          ].map(([term, value]) => (
            <div key={term} className="flex flex-col gap-0.5 border-b border-border pb-2">
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd className="font-semibold" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
          <span className="font-semibold">{t('submit.consent')}</span>
        </label>
        {problem && (
          <p
            id={`${ids}-problem`}
            role="alert"
            className="flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm font-medium text-destructive-soft-foreground"
          >
            <Icon name="alert" size={18} className="mt-0.5" />
            {problem.message}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={!ready || sending} className={buttonClasses({ size: 'lg' })}>
            <Icon name="send" size={18} />
            {sending ? t('submit.uploading') : t('submit.send')}
          </button>
        </div>
      </Step>
    </form>
  );
}

function Step({ number, total, title, locale, children }: { number: number; total: number; title: string; locale: Locale; children: ReactNode }) {
  const { t, f } = textFor(locale);
  return (
    <section
      aria-label={t('submit.stepOf', { step: f.number(number), total: f.number(total) })}
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-sm md:p-6"
    >
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground" aria-hidden>
          {f.number(number)}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One way to submit: a partner association (the only open one) or an individual (paused, greyed out). */
function PathCard({
  icon,
  title,
  body,
  value,
  checked,
  disabled,
  badge,
}: {
  icon: IconName;
  title: string;
  body: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <label className={cn('relative', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input type="radio" name="path" value={value} checked={Boolean(checked)} disabled={disabled} readOnly className="peer sr-only" />
      <span
        className={cn(
          'flex h-full flex-col gap-2 rounded-control border p-4 transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
          disabled
            ? 'border-dashed border-border bg-muted/60 text-muted-foreground opacity-70 grayscale'
            : 'border-border bg-card peer-checked:border-primary peer-checked:bg-primary-soft/60 peer-checked:text-primary-soft-foreground',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2.5 font-bold">
            <Icon name={icon} size={22} />
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 whitespace-nowrap rounded-chip bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{badge}</span>
          ) : checked ? (
            <Icon name="check" size={18} strokeWidth={2.4} />
          ) : null}
        </span>
        <span className="text-sm leading-relaxed opacity-90">{body}</span>
      </span>
    </label>
  );
}

function Field({ label, htmlFor, hint, invalid, children }: { label: string; htmlFor: string; hint?: string; invalid?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className={cn('text-xs', invalid ? 'text-destructive' : 'text-muted-foreground')}>{hint}</p>}
    </div>
  );
}

function UploadSlot({
  label,
  upload,
  locale,
  onFile,
  onClear,
}: {
  label: string;
  upload: Upload | undefined;
  locale: Locale;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const { t, f } = textFor(locale);
  const inputId = useId();
  const state = upload?.status;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-control border border-dashed p-4 transition-colors',
        state === 'done'
          ? 'border-success bg-success-soft/40'
          : state === 'error'
            ? 'border-destructive bg-destructive-soft/40'
            : 'border-border-strong bg-background',
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full',
          state === 'done' ? 'bg-success text-success-foreground' : state === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-primary',
        )}
      >
        <Icon
          name={state === 'done' ? 'check' : state === 'error' ? 'alert' : state === 'uploading' ? 'refresh' : 'upload'}
          size={19}
          className={cn(state === 'uploading' && 'motion-safe:animate-spin')}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{label}</span>
        <span className={cn('truncate text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
          {upload?.status === 'done'
            ? `${upload.name} · ${f.number(Math.max(1, Math.round(upload.size / 1024)))} KB`
            : upload?.status === 'error'
              ? upload.message
              : upload?.status === 'uploading'
                ? `${upload.name} · ${t('submit.uploading')}`
                : t('submit.fileRules')}
        </span>
      </span>
      {state === 'done' ? (
        <button type="button" onClick={onClear} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
          {t('submit.replace')}
        </button>
      ) : (
        <label
          htmlFor={inputId}
          className={buttonClasses({
            variant: 'outline',
            size: 'sm',
            className: cn('cursor-pointer', state === 'uploading' && 'pointer-events-none opacity-50'),
          })}
        >
          <Icon name="upload" size={16} />
          {t('submit.attach')}
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        disabled={state === 'uploading'}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
