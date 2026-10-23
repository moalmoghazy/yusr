import { CASE_CATEGORIES, EGYPT_GOVERNORATES, parseAmountInput, toMinor, type CaseCategory } from '@yusr/core';
import { useState, type ChangeEvent } from 'react';
import { backend } from '../app/backend';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { categoryIcon } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Button, Checkbox, Chip, Field, Input, Select, Switch, Textarea, cx } from '../ui/primitives';
import { errorCode } from './donation';

type Relation = 'self' | 'family' | 'volunteer';
type Step = 1 | 2 | 3 | 4;

interface Attachment {
  name: string;
  size: number;
  type: string;
  /** Present when a real file was picked; sample files are hashed from their name. */
  file?: File;
}

const STORY_MIN = 80;

/** SHA-256 of the document, sent with the case so reviewers know it is the file that was stored. */
async function sha256Hex(attachment: Attachment): Promise<string> {
  const bytes = attachment.file ? await attachment.file.arrayBuffer() : new TextEncoder().encode(`${attachment.name}:${attachment.size}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function SubmitPage() {
  const { t, f, locale } = useT();
  const { goAdmin } = usePrototype();
  const [step, setStep] = useState<Step>(1);
  const [relation, setRelation] = useState<Relation>('volunteer');
  const [category, setCategory] = useState<CaseCategory>('medical');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [region, setRegion] = useState('EG-C');
  const [goal, setGoal] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [docs, setDocs] = useState<Record<'id' | 'proof', Attachment | null>>({ id: null, proof: null });
  const [pseudonym, setPseudonym] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ reference: string } | null>(null);

  const goalMajor = parseAmountInput(goal);
  const nationalIdValid = nationalId.trim() === '' || /^(\d{14}|\d{10})$/.test(nationalId.trim());
  const detailsValid = title.trim().length >= 8 && story.trim().length >= STORY_MIN && Boolean(goalMajor) && nationalIdValid;
  const docsValid = Boolean(docs.id && docs.proof);

  const attach = (slot: 'id' | 'proof') => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setDocs((current) => ({ ...current, [slot]: { name: file.name, size: file.size, type: file.type || 'application/pdf', file } }));
  };

  /** The real flow: an upload link per document (the file goes straight to private storage), then the case refers to them by key + SHA-256. */
  const send = async () => {
    setSending(true);
    setFailure(null);
    try {
      const slots = [
        { kind: 'national_id' as const, attachment: docs.id! },
        { kind: 'medical_report' as const, attachment: docs.proof! },
      ];
      const documents = await Promise.all(
        slots.map(async ({ kind, attachment }) => {
          const ticket = await backend.client.presignUpload({ kind, contentType: attachment.type, sizeBytes: attachment.size });
          // Production: await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: attachment.file })
          return { kind, storageKey: ticket.key, sha256: await sha256Hex(attachment) };
        }),
      );
      const text = (value: string) => ({ [locale]: value.trim() });
      const result = await backend.client.submitCase({
        category,
        submitterRelation: relation,
        title: text(title),
        story: text(story),
        region,
        goalMinor: goalMajor ? toMinor(goalMajor, 'EGP') : 0,
        currency: 'EGP',
        isUrgent: urgent,
        deadline: urgent && deadline ? new Date(deadline).toISOString() : null,
        beneficiary: { pseudonym: pseudonym.trim() ? text(pseudonym) : null, nationalId: nationalId.trim() || null },
        documents,
        consent: true,
      });
      setSubmitted({ reference: result.reference });
    } catch (error) {
      setFailure(t(`errors.${errorCode(error)}` as 'errors.generic'));
    } finally {
      setSending(false);
    }
  };

  const steps = [t('submit.steps.who'), t('submit.steps.details'), t('submit.steps.documents'), t('submit.steps.review')];

  if (submitted) {
    const pipeline = ['draft', 'under_review', 'field_verified', 'published', 'funded', 'closed'] as const;
    return (
      <div className="container submit-page">
        <div className="submit-done">
          <span className="result-icon">
            <Icon name="check" size={30} strokeWidth={2.4} />
          </span>
          <h1>{t('submit.submitted', { reference: submitted.reference })}</h1>
          <p>{t('submit.nextSteps')}</p>
          <ol className="pipeline">
            {pipeline.map((status, index) => (
              <li key={status} className={cx(index <= 1 && 'is-done', index === 1 && 'is-current')}>
                <span className="pipeline-dot">{index < 1 ? <Icon name="check" size={12} strokeWidth={2.6} /> : f.number(index + 1)}</span>
                <strong>{t(`status.${status}`)}</strong>
                <small>{t(`statusHints.${status}`)}</small>
              </li>
            ))}
          </ol>
          <p className="notice notice-info">
            <Icon name="info" size={16} /> {t('proto.web.submitSuccessAdmin')}
          </p>
          <Button icon="arrow-out" onClick={() => goAdmin({ section: 'cases' }, 'u_youssef')}>
            {t('proto.web.openAdmin')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container submit-page">
      <header className="page-head">
        <h1>{t('submit.title')}</h1>
        <p>{t('submit.subtitle')}</p>
      </header>
      <ol className="flow-steps flow-steps-wide" aria-label={t('proto.web.stepOf', { step, total: 4 })}>
        {steps.map((label, index) => (
          <li
            key={label}
            className={cx(index + 1 < step && 'is-done', index + 1 === step && 'is-current')}
            aria-current={index + 1 === step ? 'step' : undefined}
          >
            <span className="flow-step-dot">{index + 1 < step ? <Icon name="check" size={13} strokeWidth={2.6} /> : f.number(index + 1)}</span>
            <span className="flow-step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="submit-card">
        {step === 1 && (
          <div className="relation-grid" role="radiogroup" aria-label={t('submit.steps.who')}>
            {(['self', 'family', 'volunteer'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={relation === value}
                className={cx('relation-tile', relation === value && 'is-selected')}
                onClick={() => setRelation(value)}
              >
                <Icon name={value === 'self' ? 'user' : value === 'family' ? 'users' : 'hand-heart'} size={24} />
                <strong>{t(`submit.relation.${value}`)}</strong>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="form-stack">
            <div className="filter-group">
              <span className="filter-label">{t('submit.fields.category')}</span>
              <div className="chip-row">
                {CASE_CATEGORIES.map((value) => (
                  <Chip key={value} icon={categoryIcon(value)} selected={category === value} onClick={() => setCategory(value)}>
                    {t(`categories.${value}`)}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label={t('submit.fields.title')} htmlFor="submit-title" hint={`${title.length} / 120`}>
              <Input
                id="submit-title"
                maxLength={120}
                value={title}
                placeholder={t('submit.fields.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field
              label={t('submit.fields.story')}
              htmlFor="submit-story"
              hint={
                story.trim().length < STORY_MIN
                  ? `${t('submit.fields.storyPlaceholder')} · ${t('submit.fields.storyMin', { count: f.number(STORY_MIN) })}`
                  : t('submit.fields.storyPlaceholder')
              }
            >
              <Textarea id="submit-story" rows={5} value={story} onChange={(event) => setStory(event.target.value)} />
            </Field>
            <div className="form-row-2">
              <Field label={t('submit.fields.region')} htmlFor="submit-region">
                <Select id="submit-region" value={region} onChange={(event) => setRegion(event.target.value)}>
                  {EGYPT_GOVERNORATES.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name[locale]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('submit.fields.goal')} htmlFor="submit-goal">
                <span className="amount-input">
                  <input id="submit-goal" className="input" inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} />
                  <span className="amount-suffix">{f.currencyLabel('EGP')}</span>
                </span>
              </Field>
            </div>
            <div className="form-row-2">
              <Field label={t('submit.fields.pseudonym')} htmlFor="submit-pseudonym" hint={t('submit.fields.pseudonymHint')}>
                <Input
                  id="submit-pseudonym"
                  maxLength={60}
                  value={pseudonym}
                  placeholder={t('submit.fields.pseudonymPlaceholder')}
                  onChange={(event) => setPseudonym(event.target.value)}
                />
              </Field>
              <Field
                label={t('submit.fields.nationalId')}
                htmlFor="submit-nid"
                hint={t('submit.fields.nationalIdHint')}
                error={nationalIdValid ? undefined : t('errors.VALIDATION_FAILED')}
              >
                <Input
                  id="submit-nid"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={14}
                  value={nationalId}
                  onChange={(event) => setNationalId(event.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>
            <Switch checked={urgent} onChange={setUrgent} label={t('submit.fields.urgent')} />
            {!title && !story && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setTitle(locale === 'ar' ? 'جلسات علاج طبيعي لطفل بعد جراحة في العمود الفقري' : 'Physiotherapy for a child after spinal surgery');
                  setStory(
                    locale === 'ar'
                      ? 'أجرى «زياد» (٩ سنوات) جراحة لتقويم العمود الفقري، ويحتاج إلى ٤٠ جلسة علاج طبيعي خلال ثلاثة أشهر لاستعادة الحركة. الأسرة تسكن في حلوان والأب يعمل موظفًا بأجر محدود لا يكفي تكلفة الجلسات.'
                      : 'Ziad, 9, had spinal correction surgery and needs 40 physiotherapy sessions over three months to walk normally again. The family lives in Helwan and the father’s modest salary cannot cover the sessions.',
                  );
                  setGoal('24000');
                  setPseudonym(locale === 'ar' ? 'والد زياد' : 'Ziad’s father');
                }}
              >
                {locale === 'ar' ? 'املأ بمثال' : 'Fill with an example'}
              </button>
            )}
            {urgent && (
              <Field label={t('submit.fields.deadline')} htmlFor="submit-deadline">
                <Input id="submit-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </Field>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="form-stack">
            <p className="notice notice-info">
              <Icon name="lock" size={16} /> {t('submit.docsHint')}
            </p>
            <p className="flow-note">{t('submit.docsRequired')}</p>
            {(['id', 'proof'] as const).map((slot) => (
              <label key={slot} className={cx('upload-slot', docs[slot] && 'is-filled')}>
                <input type="file" accept="image/*,application/pdf" onChange={attach(slot)} className="sr-only" />
                <span className="upload-icon">
                  <Icon name={docs[slot] ? 'check' : 'upload'} size={20} />
                </span>
                <span className="upload-text">
                  <strong>{slot === 'id' ? t('proto.web.docId') : t('proto.web.docProof')}</strong>
                  <small>{docs[slot] ? `${docs[slot]!.name} · ${f.number(Math.max(1, Math.round(docs[slot]!.size / 1024)))} KB` : t('submit.upload')}</small>
                </span>
                <span className="upload-cta">{docs[slot] ? t('proto.web.attached') : t('proto.web.attach')}</span>
              </label>
            ))}
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                setDocs({
                  id: { name: 'national-id.jpg', size: 482_133, type: 'image/jpeg' },
                  proof: { name: 'medical-report.pdf', size: 1_204_551, type: 'application/pdf' },
                })
              }
            >
              {locale === 'ar' ? 'استخدم ملفات تجريبية' : 'Use sample files'}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="form-stack">
            <dl className="review-list">
              <div>
                <dt>{t('submit.steps.who')}</dt>
                <dd>{t(`submit.relation.${relation}`)}</dd>
              </div>
              <div>
                <dt>{t('submit.fields.category')}</dt>
                <dd>{t(`categories.${category}`)}</dd>
              </div>
              <div>
                <dt>{t('submit.fields.title')}</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>{t('submit.fields.goal')}</dt>
                <dd>{goalMajor ? f.money(toMinor(goalMajor, 'EGP'), 'EGP') : '—'}</dd>
              </div>
              <div>
                <dt>{t('submit.steps.documents')}</dt>
                <dd>{t('units.documents', { count: Number(Boolean(docs.id)) + Number(Boolean(docs.proof)) })}</dd>
              </div>
            </dl>
            <Checkbox checked={consent} onChange={setConsent} label={t('submit.consent')} />
            {failure && (
              <p className="notice notice-warning" role="alert">
                <Icon name="alert" size={16} /> {failure}
              </p>
            )}
          </div>
        )}

        <div className="flow-footer">
          {step > 1 ? (
            <Button variant="ghost" icon="back" onClick={() => setStep((step - 1) as Step)}>
              {t('common.back')}
            </Button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <Button iconEnd="forward" disabled={(step === 2 && !detailsValid) || (step === 3 && !docsValid)} onClick={() => setStep((step + 1) as Step)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button icon="send" disabled={!consent || sending} onClick={() => void send()}>
              {sending ? t('submit.uploading') : t('submit.send')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
