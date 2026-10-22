import {
  caseAmountsFor,
  toMinor,
  type CaseAmounts,
  type CaseCategory,
  type CaseStatus,
  type Currency,
  type DocumentKind,
  type Localized,
  type PartnerAssociation,
  type PayeeType,
} from '@yusr/core';

/**
 * Demo cases. Content is fictional and written the way real Yusr cases should be:
 * pseudonyms, no faces, costs itemised, money paid to institutions — never cash.
 */
export interface SeedPlanLine {
  payeeType: PayeeType;
  payee: Localized;
  purpose: Localized;
  /** Major units in the case currency. */
  amount: number;
}

export interface SeedCase {
  slug: string;
  ref: number;
  category: CaseCategory;
  status: CaseStatus;
  region: string;
  currency: Currency;
  goal: number;
  raised: number;
  zakat: boolean;
  /** Hours from now until the urgent deadline. */
  urgentInHours?: number;
  priority?: number;
  createdDaysAgo: number;
  publishedDaysAgo?: number;
  fundedDaysAgo?: number;
  closedDaysAgo?: number;
  title: Localized;
  summary: Localized;
  /** «نص المشاركة»: the line used when the case is shared (the promise is appended); absent = composed. */
  shareText?: Localized;
  story: Localized;
  beneficiary: Localized;
  plan: SeedPlanLine[];
  documents: Array<{ kind: DocumentKind; pages: number }>;
  updates?: Array<{ daysAgo: number; body: Localized }>;
  submittedBy: { name: string; relation: 'self' | 'family' | 'volunteer' };
  auditorId?: string;
  reason?: string;
  /** Payout state of the plan for funded/closed cases. */
  payout?: 'approved' | 'paid';
}

/**
 * Partner associations for the demo. Fictional (marked «تجريبية»), so no demo case is ever
 * attributed to a real association; the contact details are placeholders.
 */
export const DEMO_PARTNERS: readonly PartnerAssociation[] = [
  { name: 'جمعية الرحمة لتنمية المجتمع (تجريبية)', registrationNumber: '0001/2026', contactName: 'منسق الحالات', contactPhone: '+201000000001' },
  { name: 'جمعية سنابل الخير (تجريبية)', registrationNumber: '0002/2026', contactName: 'منسق الحالات', contactPhone: '+201000000002' },
  { name: 'جمعية يد العون الخيرية (تجريبية)', registrationNumber: '0003/2026', contactName: 'منسق الحالات', contactPhone: '+201000000003' },
];

/** The demo partner behind a seed case (stable per case). */
/**
 * A seed's money in minor units. `goal` and `plan` in a seed are what the partner needs; donors are
 * asked for that plus Yusr's 10%, and `raised` grows by the same ratio so progress reads as written.
 */
export function seedAmounts(seed: SeedCase): CaseAmounts & { raisedMinor: number } {
  const amounts = caseAmountsFor(toMinor(seed.goal, seed.currency));
  const raised = toMinor(seed.raised, seed.currency);
  const raisedMinor = seed.raised >= seed.goal ? amounts.goalMinor : Math.round((raised * amounts.goalMinor) / amounts.needMinor);
  return { ...amounts, raisedMinor };
}

export function demoPartnerFor(slug: string): PartnerAssociation {
  const index = Math.max(
    0,
    SEED_CASES.findIndex((seed) => seed.slug === slug),
  );
  return DEMO_PARTNERS[index % DEMO_PARTNERS.length]!;
}

const P = (ar: string[], en: string[]): Localized => ({ ar: ar.join('\n\n'), en: en.join('\n\n') });

export const SEED_CASES: readonly SeedCase[] = [
  {
    slug: 'open-heart-surgery-cairo',
    ref: 10482,
    category: 'medical',
    status: 'published',
    region: 'EG-C',
    currency: 'EGP',
    goal: 185_000,
    raised: 142_300,
    zakat: true,
    urgentInHours: 79,
    createdDaysAgo: 14,
    publishedDaysAgo: 6,
    shareText: {
      ar: 'تبرعك يقرّبنا من إنقاذ قلب ملك ذات الست سنوات، وتستطيع أن تساهم في اكتمال تكاليف عمليتها',
      en: 'Your gift brings us closer to saving six-year-old Malak’s heart, and you can help complete the cost of her surgery',
    },
    title: { ar: 'عملية قلب مفتوح لطفلة عمرها ٦ سنوات', en: 'Open-heart surgery for a 6-year-old girl' },
    summary: {
      ar: 'تحتاج «ملك» إلى إصلاح ثقب بين البطينين في مستشفى جامعي بالقاهرة، وموعد العملية محدد.',
      en: 'Malak needs a hole between her heart’s ventricles repaired at a Cairo university hospital — the surgery date is set.',
    },
    story: P(
      [
        'وُلدت «ملك» بثقب في الحاجز بين البطينين، وتدهورت حالتها خلال الأشهر الأخيرة حتى صار صعود السلم يرهقها. قرر الفريق الطبي في مستشفى جامعي حكومي بالقاهرة إجراء جراحة قلب مفتوح قبل نهاية الشهر.',
        'يعمل والدها باليومية في ورشة نجارة، ولا يغطي التأمين الصحي تكلفة الرقعة والمستلزمات المستوردة. زارت الجمعية الشريكة الأسرة في شبرا وتأكدت من التقارير الطبية وعرض السعر الرسمي من المستشفى.',
        'يُصرف المبلغ مباشرة لحساب المستشفى، وسنرفع إيصال السداد وتقرير ما بعد العملية هنا.',
      ],
      [
        'Malak was born with a hole in the wall between her ventricles, and over recent months even climbing stairs has exhausted her. The medical team at a public university hospital in Cairo scheduled open-heart surgery before the end of the month.',
        'Her father is a day labourer at a carpentry workshop, and health insurance does not cover the imported patch and supplies. The partner association visited the family in Shubra and checked the medical reports and the hospital’s official quote.',
        'The money is paid straight to the hospital’s account; we will upload the payment receipt and the post-operative report here.',
      ],
    ),
    beneficiary: { ar: 'ملك (اسم مستعار)، ٦ سنوات', en: 'Malak (pseudonym), 6' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مستشفى جامعي حكومي — القاهرة', en: 'Public university hospital — Cairo' },
        purpose: { ar: 'الجراحة والإقامة في العناية', en: 'Surgery and intensive-care stay' },
        amount: 142_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'مورد مستلزمات جراحية معتمد', en: 'Certified surgical supplier' },
        purpose: { ar: 'رقعة ومستلزمات مستوردة', en: 'Imported patch and supplies' },
        amount: 15_000,
      },
      {
        payeeType: 'pharmacy',
        payee: { ar: 'صيدلية المستشفى', en: 'Hospital pharmacy' },
        purpose: { ar: 'أدوية ومتابعة ٣ أشهر', en: 'Medication and 3 months of follow-up' },
        amount: 28_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 2 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 3 },
    ],
    updates: [
      {
        daysAgo: 2,
        body: {
          ar: 'ثبّت المستشفى موعد العملية يوم الخميس القادم، ودخلت ملك لإجراء الفحوص التحضيرية.',
          en: 'The hospital confirmed surgery for next Thursday; Malak has been admitted for pre-op tests.',
        },
      },
    ],
    submittedBy: { name: 'رحاب عادل', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'overdue-rent-eviction-qalyubia',
    ref: 10477,
    category: 'debt_relief',
    status: 'published',
    region: 'EG-KB',
    currency: 'EGP',
    goal: 42_000,
    raised: 39_800,
    zakat: true,
    urgentInHours: 128,
    createdDaysAgo: 18,
    publishedDaysAgo: 9,
    shareText: {
      ar: 'تبرعك يقرّبنا من إبقاء أسرة أبو يوسف في بيتها، وتستطيع أن تساهم في سداد إيجارها المتأخر',
      en: 'Your gift brings us closer to keeping Abu Youssef’s family in their home, and you can help pay their overdue rent',
    },
    title: { ar: 'إيجار متأخر ١٤ شهرًا لأسرة مهددة بالطرد', en: '14 months of overdue rent for a family facing eviction' },
    summary: {
      ar: 'فقد «أبو يوسف» عمله بعد إصابة في ظهره، وتراكم الإيجار حتى صدر حكم بالإخلاء خلال أيام.',
      en: 'Abu Youssef lost his job after a back injury; the rent piled up and an eviction order takes effect within days.',
    },
    story: P(
      [
        'كان «أبو يوسف» يعمل سائقًا حتى أصيب بانزلاق غضروفي منعه من العمل منذ أكثر من عام. تعيش الأسرة المكونة من خمسة أفراد في شقة صغيرة بشبين القناطر، وتراكمت عليهم ١٤ شهرًا من الإيجار.',
        'حصل المالك على حكم بالإخلاء، ووافق على التصالح إذا سُدد المبلغ كاملًا قبل موعد التنفيذ. تحققت الجمعية الشريكة من الحكم وعقد الإيجار وقابلت المالك شخصيًا.',
        'يُسدَّد المبلغ للمالك مباشرة بموجب محضر تصالح موثّق، ونرفع صورة المحضر هنا بعد التوقيع.',
      ],
      [
        'Abu Youssef worked as a driver until a slipped disc stopped him working more than a year ago. The family of five lives in a small flat in Shebin El Qanater, and 14 months of rent have built up.',
        'The landlord obtained an eviction ruling and agreed to settle if the full amount is paid before the enforcement date. The partner association checked the ruling and the lease and met the landlord in person.',
        'The amount is paid to the landlord directly under a notarised settlement; we will upload the settlement record once it is signed.',
      ],
    ),
    beneficiary: { ar: 'أسرة أبو يوسف (اسم مستعار)، ٥ أفراد', en: 'Abu Youssef’s family (pseudonym), 5 people' },
    plan: [
      {
        payeeType: 'landlord',
        payee: { ar: 'مالك العقار — بموجب محضر تصالح', en: 'Landlord — under a notarised settlement' },
        purpose: { ar: 'سداد ١٤ شهرًا من الإيجار المتأخر', en: 'Settle 14 months of overdue rent' },
        amount: 42_000,
      },
    ],
    documents: [
      { kind: 'court_ruling', pages: 2 },
      { kind: 'debt_proof', pages: 3 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'أبو يوسف', relation: 'self' },
    auditorId: 'u_aya',
  },
  {
    slug: 'gharima-promissory-notes-beni-suef',
    ref: 10469,
    category: 'debt_relief',
    status: 'published',
    region: 'EG-BNS',
    currency: 'EGP',
    goal: 48_000,
    raised: 31_200,
    zakat: true,
    priority: 5,
    createdDaysAgo: 21,
    publishedDaysAgo: 11,
    shareText: {
      ar: 'تبرعك يقرّبنا من فكّ كرب أم منة، أمٍّ لأربعة أطفال، وتستطيع أن تساهم في سداد دينها',
      en: 'Your gift brings us closer to lifting the burden from Um Menna, a mother of four, and you can help pay off her debt',
    },
    title: { ar: 'فكّ كرب غارمة: سداد إيصالات أمانة لأم لأربعة أطفال', en: 'Freeing a mother of four from promissory-note debt' },
    summary: {
      ar: 'وقّعت «أم منة» إيصالات أمانة لتجهيز ابنتها، ثم مرض زوجها وتعثّر السداد وصدر ضدها حكم بالحبس.',
      en: 'Um Menna signed promissory notes to furnish her daughter’s wedding; then her husband fell ill, payments stopped and she was sentenced to prison.',
    },
    story: P(
      [
        'اشترت «أم منة» أجهزة منزلية بالتقسيط لتجهيز ابنتها الكبرى، ووقّعت إيصالات أمانة بقيمة المديونية كما هو شائع في القرى. بعد أشهر مرض زوجها وتوقف عن العمل، فتعثّر السداد.',
        'أقام التاجر دعوى وصدر حكم بحبسها، وهي الآن العائل الوحيد لأربعة أطفال. راجعت الجمعية الشريكة الحكم وأصول الإيصالات وتواصلت مع التاجر الذي وافق على التنازل عند السداد.',
        'يُسدَّد المبلغ للدائن عبر محامي الجمعية الشريكة مقابل تنازل رسمي وإيصال مخالصة يُرفع هنا.',
      ],
      [
        'Um Menna bought household appliances in instalments to furnish her eldest daughter’s home, signing promissory notes for the debt as is common in villages. Months later her husband fell ill and stopped working, and the payments stopped.',
        'The trader sued and she was sentenced to prison — while she is now the only provider for four children. The partner association reviewed the ruling and the original notes and spoke to the trader, who agreed to withdraw on payment.',
        'The creditor is paid through the partner association’s lawyer in exchange for a formal waiver and a settlement receipt, which we upload here.',
      ],
    ),
    beneficiary: { ar: 'أم منة (اسم مستعار)، ٤١ عامًا', en: 'Um Menna (pseudonym), 41' },
    plan: [
      {
        payeeType: 'creditor',
        payee: { ar: 'الدائن — عبر محامي الجمعية الشريكة', en: 'Creditor — via the foundation’s lawyer' },
        purpose: { ar: 'سداد الإيصالات مقابل تنازل رسمي', en: 'Pay the notes in exchange for a formal waiver' },
        amount: 44_500,
      },
      {
        payeeType: 'creditor',
        payee: { ar: 'خزينة المحكمة', en: 'Court treasury' },
        purpose: { ar: 'رسوم التصالح والإجراءات', en: 'Settlement fees and court costs' },
        amount: 3_500,
      },
    ],
    documents: [
      { kind: 'court_ruling', pages: 3 },
      { kind: 'debt_proof', pages: 4 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'هالة إبراهيم', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'village-fire-relief-sohag',
    ref: 10491,
    category: 'relief',
    status: 'published',
    region: 'EG-SHG',
    currency: 'EGP',
    goal: 250_000,
    raised: 97_500,
    zakat: true,
    urgentInHours: 41,
    createdDaysAgo: 5,
    publishedDaysAgo: 3,
    shareText: {
      ar: 'تبرعك يقرّبنا من إعادة ٢٠ أسرة إلى بيوتها بعد الحريق، وتستطيع أن تساهم في اكتمال إغاثتها',
      en: 'Your gift brings us closer to bringing 20 families home after the fire, and you can help complete their relief',
    },
    title: { ar: 'إغاثة ٢٠ أسرة بعد حريق في قرية بسوهاج', en: 'Relief for 20 families after a village fire in Sohag' },
    summary: {
      ar: 'التهم حريق ٢٠ منزلًا ريفيًا بأسقفها الخشبية، والأسر تقيم الآن لدى الجيران.',
      en: 'A fire destroyed 20 rural homes with wooden roofs; the families are staying with neighbours.',
    },
    story: P(
      [
        'امتد حريق في مساء عاصف إلى ٢٠ منزلًا متجاورًا بأسقف من الخشب وجريد النخل. لم يسفر عن وفيات، لكنه أتى على الأثاث والملابس والأجهزة.',
        'أجرت الجمعية الشريكة حصرًا منزلًا منزلًا بالتنسيق مع الوحدة المحلية، وحدد احتياج كل أسرة من أسرّة وبطاطين وأدوات مطبخ، إضافة إلى إعادة بناء الأسقف بالخرسانة الخفيفة.',
        'يُصرف المبلغ لموردين محليين بعقود وفواتير، ونرفع صور التسليم لكل أسرة مع حجب الوجوه.',
      ],
      [
        'On a windy evening a fire spread across 20 adjoining homes roofed with timber and palm fronds. No one died, but furniture, clothes and appliances were lost.',
        'The partner association surveyed every home with the local council and listed each family’s needs — beds, blankets and kitchen essentials — plus rebuilding the roofs in light concrete.',
        'Funds go to local suppliers under contracts and invoices, and we upload delivery photos for every family with faces blurred.',
      ],
    ),
    beneficiary: { ar: '٢٠ أسرة — ١١٢ فردًا', en: '20 families — 112 people' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مورد أثاث ومستلزمات منزلية — سوهاج', en: 'Home furnishing supplier — Sohag' },
        purpose: { ar: 'أسرّة وبطاطين وأدوات مطبخ', en: 'Beds, blankets and kitchenware' },
        amount: 150_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'مقاول محلي معتمد', en: 'Certified local contractor' },
        purpose: { ar: 'إعادة بناء ٢٠ سقفًا', en: 'Rebuild 20 roofs' },
        amount: 100_000,
      },
    ],
    documents: [
      { kind: 'field_report', pages: 6 },
      { kind: 'price_quote', pages: 2 },
      { kind: 'price_quote', pages: 1 },
    ],
    updates: [
      {
        daysAgo: 1,
        body: {
          ar: 'وصلت الدفعة الأولى من البطاطين وسُلّمت لـ١٢ أسرة بكشوف موقّعة.',
          en: 'The first batch of blankets arrived and was delivered to 12 families against signed lists.',
        },
      },
    ],
    submittedBy: { name: 'علي حمدي', relation: 'volunteer' },
    auditorId: 'u_aya',
  },
  {
    slug: 'dialysis-sessions-dakahlia',
    ref: 10455,
    category: 'medical',
    status: 'published',
    region: 'EG-DK',
    currency: 'EGP',
    goal: 94_000,
    raised: 50_400,
    zakat: true,
    createdDaysAgo: 26,
    publishedDaysAgo: 17,
    shareText: {
      ar: 'تبرعك يقرّبنا من ستة أشهر من الغسيل الكلوي لعم سعيد، وتستطيع أن تساهم في اكتمال تكاليف علاجه',
      en: 'Your gift brings us closer to six months of dialysis for Uncle Saeed, and you can help complete the cost of his treatment',
    },
    title: { ar: 'جلسات غسيل كلوي لستة أشهر لأب في الثامنة والخمسين', en: 'Six months of dialysis for a 58-year-old father' },
    summary: {
      ar: 'يحتاج «عم سعيد» إلى ثلاث جلسات أسبوعيًا في مركز خاص بعد إغلاق وحدة القرية للصيانة.',
      en: 'Uncle Saeed needs three sessions a week at a private centre after his village unit closed for repairs.',
    },
    story: P(
      [
        'يعاني «عم سعيد» من فشل كلوي مزمن منذ أربع سنوات، وكان يغسل في وحدة القرية مجانًا حتى أُغلقت للصيانة ستة أشهر. أقرب مركز بديل خاص، وتتجاوز تكلفة الجلسة الواحدة ألف جنيه.',
        'تحققت الجمعية الشريكة من التقارير الطبية ومن عرض المركز وراجعها فريق يُسر، ويُسدَّد المبلغ للمركز مقدمًا على دفعات شهرية مقابل كشف حضور الجلسات.',
      ],
      [
        'Uncle Saeed has had chronic kidney failure for four years and received free dialysis at his village unit until it closed for six months of repairs. The nearest alternative is private, at over a thousand pounds a session.',
        'The partner association verified the medical reports and the centre’s quote, and the Yusr team reviewed them. The centre is paid monthly in advance against a record of attended sessions.',
      ],
    ),
    beneficiary: { ar: 'عم سعيد (اسم مستعار)، ٥٨ عامًا', en: 'Uncle Saeed (pseudonym), 58' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مركز غسيل كلوي — المنصورة', en: 'Dialysis centre — Mansoura' },
        purpose: { ar: '٧٨ جلسة على ٦ أشهر', en: '78 sessions over 6 months' },
        amount: 94_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 3 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'هالة إبراهيم', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'prosthetic-leg-minya',
    ref: 10461,
    category: 'medical',
    status: 'published',
    region: 'EG-MN',
    currency: 'EGP',
    goal: 120_000,
    raised: 18_300,
    zakat: true,
    createdDaysAgo: 12,
    publishedDaysAgo: 4,
    title: { ar: 'طرف صناعي لشاب فقد ساقه في حادث عمل', en: 'A prosthetic leg for a young man injured at work' },
    summary: {
      ar: 'بُترت ساق «مصطفى» بعد حادث في ورشة، ويحتاج طرفًا صناعيًا ليعود إلى عمله ويعول أسرته.',
      en: 'Mostafa lost his leg in a workshop accident and needs a prosthesis to return to work and support his family.',
    },
    story: P(
      [
        'كان «مصطفى» (٢٤ عامًا) يعمل في ورشة حدادة حين سقط عليه لوح معدني ثقيل، وانتهى الأمر ببتر ساقه اليسرى أسفل الركبة. هو العائل لوالدته وأخته الصغرى.',
        'قدّم مركز الأطراف الصناعية عرض سعر لطرف بمفصل كاحل مرن مع جلسات تأهيل، وراجع استشاري التأهيل المتعاون معنا التقرير الطبي والعرض.',
      ],
      [
        'Mostafa, 24, was working at a metal workshop when a heavy steel sheet fell on him, and his left leg was amputated below the knee. He supports his mother and younger sister.',
        'The prosthetics centre quoted a prosthesis with a flexible ankle joint plus rehabilitation sessions, reviewed by our partner rehabilitation consultant.',
      ],
    ),
    beneficiary: { ar: 'مصطفى (اسم مستعار)، ٢٤ عامًا', en: 'Mostafa (pseudonym), 24' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مركز أطراف صناعية معتمد — المنيا', en: 'Certified prosthetics centre — Minya' },
        purpose: { ar: 'طرف صناعي و١٢ جلسة تأهيل', en: 'Prosthesis and 12 rehabilitation sessions' },
        amount: 120_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 2 },
      { kind: 'price_quote', pages: 2 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'مصطفى', relation: 'self' },
    auditorId: 'u_aya',
  },
  {
    slug: 'engineering-student-laptop-asyut',
    ref: 10466,
    category: 'education',
    status: 'published',
    region: 'EG-AST',
    currency: 'EGP',
    goal: 38_000,
    raised: 9_100,
    zakat: false,
    createdDaysAgo: 16,
    publishedDaysAgo: 8,
    title: { ar: 'لابتوب ومصروفات لطالبة هندسة متفوقة', en: 'A laptop and fees for a top engineering student' },
    summary: {
      ar: 'أنهت «نور» عامها الأول بتقدير امتياز، وتذاكر على هاتف مكسور الشاشة.',
      en: 'Nour finished her first year with distinction — studying on a phone with a cracked screen.',
    },
    story: P(
      [
        '«نور» الأولى على دفعتها في هندسة أسيوط، وتسكن مع أسرتها في قرية تبعد ساعة عن الجامعة. تعتمد مقرراتها على برامج تصميم لا تعمل على الهاتف.',
        'تغطي الحالة مصروفات العام الدراسي والمواصلات وجهاز لابتوب يناسب برامج الهندسة، يُشترى من موزع معتمد بفاتورة باسم الطالبة.',
      ],
      [
        'Nour tops her class in engineering at Asyut and lives with her family in a village an hour from campus. Her courses rely on design software that will not run on a phone.',
        'This covers the year’s fees and transport plus a laptop suited to engineering software, bought from an authorised dealer with an invoice in her name.',
      ],
    ),
    beneficiary: { ar: 'نور (اسم مستعار)، ١٩ عامًا', en: 'Nour (pseudonym), 19' },
    plan: [
      {
        payeeType: 'school',
        payee: { ar: 'جامعة أسيوط — حساب المصروفات', en: 'Asyut University — fees account' },
        purpose: { ar: 'مصروفات ومواصلات العام', en: 'Fees and transport for the year' },
        amount: 18_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'موزع أجهزة معتمد', en: 'Authorised electronics dealer' },
        purpose: { ar: 'لابتوب مناسب لبرامج الهندسة', en: 'Engineering-grade laptop' },
        amount: 20_000,
      },
    ],
    documents: [
      { kind: 'school_record', pages: 2 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'مينا جرجس', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'orphan-home-monthly-care-giza',
    ref: 10458,
    category: 'orphans',
    status: 'published',
    region: 'EG-GZ',
    currency: 'EGP',
    goal: 60_000,
    raised: 18_500,
    zakat: true,
    createdDaysAgo: 20,
    publishedDaysAgo: 13,
    title: { ar: 'رعاية شهرية لـ١٢ طفلًا في دار أيتام صغيرة', en: 'Monthly care for 12 children in a small orphan home' },
    summary: {
      ar: 'دار مرخّصة في الجيزة تحتاج إلى تغطية الغذاء والمدارس ثلاثة أشهر بعد توقف متبرعها الرئيسي.',
      en: 'A licensed home in Giza needs three months of food and schooling covered after its main sponsor withdrew.',
    },
    story: P(
      [
        'ترعى الدار ١٢ طفلًا بين ٥ و١٤ عامًا، واعتمدت على متبرع رئيسي توقف دعمه فجأة. راجعنا ترخيص الدار من وزارة التضامن الاجتماعي وسجلاتها المالية لآخر عام.',
        'يُصرف المبلغ لحساب الدار الرسمي على ثلاث دفعات شهرية، مع تقرير إنفاق موقّع يُرفع هنا كل شهر.',
      ],
      [
        'The home cares for 12 children aged 5 to 14 and relied on a main sponsor who suddenly withdrew. We reviewed its Ministry of Social Solidarity licence and last year’s accounts.',
        'Funds go to the home’s official account in three monthly instalments, with a signed spending report uploaded here each month.',
      ],
    ),
    beneficiary: { ar: 'دار رعاية مرخّصة — ١٢ طفلًا', en: 'Licensed care home — 12 children' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'دار الرعاية — الحساب الرسمي', en: 'Care home — official account' },
        purpose: { ar: 'غذاء ومدارس لثلاثة أشهر', en: 'Food and schooling for three months' },
        amount: 60_000,
      },
    ],
    documents: [
      { kind: 'field_report', pages: 3 },
      { kind: 'invoice', pages: 4 },
    ],
    submittedBy: { name: 'نهى صلاح', relation: 'volunteer' },
    auditorId: 'u_aya',
  },
  {
    slug: 'orphan-bride-essentials-sharqia',
    ref: 10463,
    category: 'orphans',
    status: 'published',
    region: 'EG-SHR',
    currency: 'EGP',
    goal: 55_000,
    raised: 44_000,
    zakat: true,
    createdDaysAgo: 15,
    publishedDaysAgo: 10,
    title: { ar: 'تجهيز عروس يتيمة', en: 'Wedding essentials for an orphaned bride' },
    summary: {
      ar: '«سلمى» يتيمة الأب وزفافها بعد شهرين، والأسرة لا تملك ثمن الأجهزة الأساسية.',
      en: 'Salma lost her father; her wedding is in two months and the family can’t afford basic appliances.',
    },
    story: P(
      [
        'تعيش «سلمى» مع والدتها وأخويها، وتعمل الأم في الخياطة من المنزل. تحدد موعد زفافها بعد شهرين، والعرف يقتضي أن توفر أسرة العروس الأجهزة الأساسية.',
        'تُشترى الثلاجة والغسالة والبوتاجاز من معرض محلي بفاتورة، وتُسلَّم في بيت الزوجية مقابل توقيع بالاستلام.',
      ],
      [
        'Salma lives with her mother and two brothers; her mother sews at home. The wedding is in two months, and custom says the bride’s family provides the basic appliances.',
        'The fridge, washing machine and cooker are bought from a local showroom with an invoice and delivered to the new home against a signed receipt.',
      ],
    ),
    beneficiary: { ar: 'سلمى (اسم مستعار)، ٢٢ عامًا', en: 'Salma (pseudonym), 22' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'معرض أجهزة منزلية — الزقازيق', en: 'Appliance showroom — Zagazig' },
        purpose: { ar: 'ثلاجة وغسالة وبوتاجاز', en: 'Fridge, washer and cooker' },
        amount: 55_000,
      },
    ],
    documents: [
      { kind: 'price_quote', pages: 1 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'والدة سلمى', relation: 'family' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'breast-cancer-targeted-therapy-gharbia',
    ref: 10452,
    category: 'medical',
    status: 'published',
    region: 'EG-GH',
    currency: 'EGP',
    goal: 130_000,
    raised: 64_000,
    zakat: true,
    createdDaysAgo: 24,
    publishedDaysAgo: 16,
    title: { ar: 'علاج موجّه لسيدة مصابة بسرطان الثدي', en: 'Targeted therapy for a woman with breast cancer' },
    summary: {
      ar: 'تحتاج «أم أحمد» إلى ست جرعات من علاج موجّه لا يغطيه التأمين الصحي.',
      en: 'Um Ahmed needs six doses of a targeted therapy her health insurance doesn’t cover.',
    },
    story: P(
      [
        'شُخّصت «أم أحمد» بسرطان الثدي في مرحلة مبكرة، وأوصى الفريق الطبي بعلاج موجّه مع الكيماوي لرفع فرص الشفاء. يغطي التأمين الكيماوي التقليدي فقط.',
        'تُشترى الجرعات من صيدلية المستشفى مباشرة وفق جدول العلاج، ونرفع إيصال كل جرعة.',
      ],
      [
        'Um Ahmed was diagnosed with early-stage breast cancer, and her doctors recommend a targeted therapy alongside chemotherapy to improve her chances. Insurance covers only the conventional chemo.',
        'Doses are bought directly from the hospital pharmacy on the treatment schedule, and we upload the receipt for each one.',
      ],
    ),
    beneficiary: { ar: 'أم أحمد (اسم مستعار)، ٤٧ عامًا', en: 'Um Ahmed (pseudonym), 47' },
    plan: [
      {
        payeeType: 'pharmacy',
        payee: { ar: 'صيدلية مستشفى جامعي — طنطا', en: 'University hospital pharmacy — Tanta' },
        purpose: { ar: '٦ جرعات علاج موجّه', en: '6 doses of targeted therapy' },
        amount: 130_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 4 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'ابنة أم أحمد', relation: 'family' },
    auditorId: 'u_aya',
  },
  {
    slug: 'winter-blankets-qena',
    ref: 10470,
    category: 'relief',
    status: 'published',
    region: 'EG-KN',
    currency: 'EGP',
    goal: 150_000,
    raised: 121_000,
    zakat: true,
    createdDaysAgo: 19,
    publishedDaysAgo: 12,
    title: { ar: 'بطاطين وملابس شتوية لـ٣٠٠ أسرة في قنا', en: 'Winter blankets and clothes for 300 families in Qena' },
    summary: {
      ar: 'قرى على أطراف الصحراء تنخفض فيها الحرارة ليلًا إلى أقل من ٥ درجات، والأسر تنام بلا أغطية كافية.',
      en: 'Desert-edge villages where nights drop below 5°C and families sleep without enough covers.',
    },
    story: P(
      [
        'حدد متطوعونا ٣٠٠ أسرة هي الأشد احتياجًا في قرى الظهير الصحراوي بعد حصر ميداني. تحصل كل أسرة على بطانيتين ثقيلتين وطقم ملابس شتوية للأطفال.',
        'تشتري الجمعية الشريكة من مصنع محلي بسعر الجملة وتوزع بكشوف توقيع، ونرفع كشف التوزيع هنا.',
      ],
      [
        'Our volunteers identified the 300 neediest families in desert-edge villages after a field survey. Each family receives two heavy blankets and a winter clothing set for the children.',
        'The partner association buys wholesale from a local factory and distributes against signed lists, which we upload here.',
      ],
    ),
    beneficiary: { ar: '٣٠٠ أسرة', en: '300 families' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مصنع بطاطين — قنا', en: 'Blanket factory — Qena' },
        purpose: { ar: '٦٠٠ بطانية ثقيلة', en: '600 heavy blankets' },
        amount: 90_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'مورد ملابس أطفال', en: 'Children’s clothing supplier' },
        purpose: { ar: '٣٠٠ طقم شتوي', en: '300 winter sets' },
        amount: 60_000,
      },
    ],
    documents: [
      { kind: 'field_report', pages: 5 },
      { kind: 'price_quote', pages: 2 },
    ],
    submittedBy: { name: 'عبدالرحمن فتحي', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'cochlear-implant-port-said',
    ref: 10444,
    category: 'medical',
    status: 'published',
    region: 'EG-PTS',
    currency: 'EGP',
    goal: 480_000,
    raised: 88_000,
    zakat: true,
    createdDaysAgo: 30,
    publishedDaysAgo: 22,
    title: { ar: 'زراعة قوقعة لطفل عمره ٣ سنوات', en: 'A cochlear implant for a 3-year-old' },
    summary: {
      ar: 'وُلد «آدم» بضعف سمع شديد، والزراعة قبل سن الرابعة تمنحه فرصة ليتكلم.',
      en: 'Adam was born with severe hearing loss; an implant before age four gives him the chance to speak.',
    },
    story: P(
      [
        'أكدت الفحوص أن «آدم» يعاني من ضعف سمع حسي عصبي شديد في الأذنين، ولم تفده السماعات الخارجية. يوصي الأطباء بالزراعة قبل الرابعة لأفضل نتائج في اكتساب اللغة.',
        'يُسدَّد ثمن الجهاز والجراحة للمستشفى مباشرة، ويشمل المبلغ برنامج تخاطب لمدة عام.',
      ],
      [
        'Tests confirmed Adam has severe sensorineural hearing loss in both ears, and hearing aids did not help. Doctors recommend implantation before four for the best language outcomes.',
        'The device and surgery are paid to the hospital directly, and the amount includes a year of speech therapy.',
      ],
    ),
    beneficiary: { ar: 'آدم (اسم مستعار)، ٣ سنوات', en: 'Adam (pseudonym), 3' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مستشفى تخصصي — بورسعيد', en: 'Specialist hospital — Port Said' },
        purpose: { ar: 'جهاز القوقعة والجراحة', en: 'Implant device and surgery' },
        amount: 430_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'مركز تخاطب معتمد', en: 'Accredited speech-therapy centre' },
        purpose: { ar: 'برنامج تخاطب لمدة عام', en: 'One year of speech therapy' },
        amount: 50_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 5 },
      { kind: 'price_quote', pages: 2 },
      { kind: 'national_id', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'والد آدم', relation: 'family' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'farmer-crop-loss-debt-faiyum',
    ref: 10459,
    category: 'debt_relief',
    status: 'published',
    region: 'EG-FYM',
    currency: 'EGP',
    goal: 65_000,
    raised: 22_000,
    zakat: true,
    createdDaysAgo: 17,
    publishedDaysAgo: 9,
    title: { ar: 'سداد ديون مزارع بعد تلف محصوله', en: 'Clearing a farmer’s debts after his crop failed' },
    summary: {
      ar: 'اقترض «عم رجب» لشراء البذور والسماد، ثم أتلفت آفة محصول الطماطم بالكامل.',
      en: 'Uncle Ragab borrowed for seeds and fertiliser, then a pest destroyed his entire tomato crop.',
    },
    story: P(
      [
        'يزرع «عم رجب» فدانًا مستأجرًا، واقترض من تاجر مستلزمات زراعية بإيصالات أمانة. أتلفت آفة «التوتا» المحصول قبل الحصاد، وأصبح مهددًا بالحبس.',
        'تحققت الجمعية الشريكة من المديونية مع التاجر ومن تقرير الجمعية الزراعية عن التلف، ويُسدَّد المبلغ للتاجر مقابل مخالصة موقّعة.',
      ],
      [
        'Uncle Ragab farms a rented acre and borrowed from an agricultural supplier on promissory notes. The tomato leaf miner destroyed the crop before harvest, and he now faces prison.',
        'The partner association verified the debt with the supplier and the co-operative’s damage report. The supplier is paid against a signed settlement.',
      ],
    ),
    beneficiary: { ar: 'عم رجب (اسم مستعار)، ٥٢ عامًا', en: 'Uncle Ragab (pseudonym), 52' },
    plan: [
      {
        payeeType: 'creditor',
        payee: { ar: 'تاجر مستلزمات زراعية', en: 'Agricultural supplier' },
        purpose: { ar: 'سداد الإيصالات مقابل مخالصة', en: 'Pay the notes against a settlement' },
        amount: 65_000,
      },
    ],
    documents: [
      { kind: 'debt_proof', pages: 3 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'عم رجب', relation: 'self' },
    auditorId: 'u_aya',
  },
  {
    slug: 'collapsing-roof-kafr-el-sheikh',
    ref: 10486,
    category: 'relief',
    status: 'published',
    region: 'EG-KFS',
    currency: 'EGP',
    goal: 38_000,
    raised: 7_500,
    zakat: true,
    createdDaysAgo: 7,
    publishedDaysAgo: 2,
    title: { ar: 'ترميم سقف منزل آيل للسقوط لأرملة وأطفالها', en: 'Repairing a collapsing roof for a widow and her children' },
    summary: {
      ar: 'تشققات خطيرة في سقف غرفتين، والشتاء يقترب.',
      en: 'Dangerous cracks in the roof over two rooms — with winter approaching.',
    },
    story: P(
      [
        'تسكن «أم ياسين» مع ثلاثة أطفال في منزل ريفي قديم، وأكد مهندس متطوع أن سقف غرفتين مهدد بالانهيار.',
        'ينفذ الترميم مقاول محلي بعقد وتحت إشراف المهندس، ويُسدَّد على دفعتين حسب الإنجاز.',
      ],
      [
        'Um Yassin lives with three children in an old rural house, and a volunteer engineer confirmed the roof over two rooms could collapse.',
        'A local contractor does the work under contract and the engineer’s supervision, paid in two instalments on progress.',
      ],
    ),
    beneficiary: { ar: 'أم ياسين (اسم مستعار)، ٣٦ عامًا', en: 'Um Yassin (pseudonym), 36' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مقاول محلي — كفر الشيخ', en: 'Local contractor — Kafr El Sheikh' },
        purpose: { ar: 'إعادة بناء سقف غرفتين', en: 'Rebuild the roof over two rooms' },
        amount: 38_000,
      },
    ],
    documents: [
      { kind: 'field_report', pages: 2 },
      { kind: 'price_quote', pages: 1 },
    ],
    submittedBy: { name: 'رحاب عادل', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'cerebral-palsy-physiotherapy-riyadh',
    ref: 10474,
    category: 'medical',
    status: 'published',
    region: 'SA-01',
    currency: 'SAR',
    goal: 24_000,
    raised: 16_800,
    zakat: true,
    createdDaysAgo: 13,
    publishedDaysAgo: 7,
    title: { ar: 'علاج طبيعي مكثف لطفل مصاب بالشلل الدماغي', en: 'Intensive physiotherapy for a child with cerebral palsy' },
    summary: {
      ar: 'برنامج تأهيل لستة أشهر يساعد «فيصل» على المشي بمساعدة.',
      en: 'A six-month rehabilitation programme to help Faisal walk with support.',
    },
    story: P(
      [
        '«فيصل» في السابعة، ويستطيع الوقوف بمساعدة منذ بدأ جلسات متقطعة. أوصى أخصائي التأهيل ببرنامج مكثف بثلاث جلسات أسبوعيًا.',
        'يُسدَّد المبلغ لمركز تأهيل مرخّص في الرياض على دفعات شهرية مقابل تقارير التقدم.',
      ],
      [
        'Faisal is seven and has been able to stand with support since starting occasional sessions. His therapist recommends an intensive programme of three sessions a week.',
        'The licensed rehabilitation centre in Riyadh is paid monthly against progress reports.',
      ],
    ),
    beneficiary: { ar: 'فيصل (اسم مستعار)، ٧ سنوات', en: 'Faisal (pseudonym), 7' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مركز تأهيل مرخّص — الرياض', en: 'Licensed rehabilitation centre — Riyadh' },
        purpose: { ar: '٧٢ جلسة على ٦ أشهر', en: '72 sessions over 6 months' },
        amount: 24_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 2 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'سعد الدوسري', relation: 'volunteer' },
    auditorId: 'u_aya',
  },
  {
    slug: 'orphaned-siblings-school-fees-alexandria',
    ref: 10467,
    category: 'education',
    status: 'published',
    region: 'EG-ALX',
    currency: 'EGP',
    goal: 36_000,
    raised: 28_400,
    zakat: false,
    createdDaysAgo: 14,
    publishedDaysAgo: 8,
    title: { ar: 'مصروفات دراسية لثلاثة أشقاء أيتام', en: 'School fees for three orphaned siblings' },
    summary: {
      ar: 'توفي والدهم في يناير، والأم تعمل باليومية ولا تستطيع تغطية المصروفات والكتب.',
      en: 'Their father died in January; their mother works day shifts and can’t cover fees and books.',
    },
    story: P(
      [
        'الأشقاء الثلاثة في المرحلتين الإعدادية والثانوية بمدارس تجريبية بالإسكندرية، وتعمل الأم في مصنع ملابس باليومية.',
        'تُسدَّد المصروفات للمدارس مباشرة، وتُشترى الكتب والزي من مكتبة ومحل معتمدين بفواتير.',
      ],
      [
        'The three siblings attend experimental middle and secondary schools in Alexandria. Their mother works day shifts at a garment factory.',
        'Fees are paid to the schools directly; books and uniforms are bought from approved shops with invoices.',
      ],
    ),
    beneficiary: { ar: '٣ أشقاء (أسماء مستعارة)، ١٢–١٦ عامًا', en: '3 siblings (pseudonyms), aged 12–16' },
    plan: [
      {
        payeeType: 'school',
        payee: { ar: 'مدارس تجريبية — الإسكندرية', en: 'Experimental schools — Alexandria' },
        purpose: { ar: 'مصروفات العام الدراسي', en: 'Fees for the school year' },
        amount: 24_000,
      },
      {
        payeeType: 'vendor',
        payee: { ar: 'مكتبة ومحل زي مدرسي', en: 'Bookshop and uniform store' },
        purpose: { ar: 'كتب وزي مدرسي', en: 'Books and uniforms' },
        amount: 12_000,
      },
    ],
    documents: [
      { kind: 'school_record', pages: 3 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'إسراء ممدوح', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'school-bags-aswan',
    ref: 10439,
    category: 'education',
    status: 'funded',
    region: 'EG-ASN',
    currency: 'EGP',
    goal: 45_000,
    raised: 45_000,
    zakat: false,
    createdDaysAgo: 25,
    publishedDaysAgo: 18,
    fundedDaysAgo: 3,
    title: { ar: 'حقائب وأدوات مدرسية لـ١٥٠ طفلًا في أسوان', en: 'School bags and supplies for 150 children in Aswan' },
    summary: {
      ar: 'اكتمل التمويل، ويجري التوزيع في ثلاث قرى نوبية.',
      en: 'Fully funded — distribution is under way in three Nubian villages.',
    },
    story: P(
      ['حقيبة كاملة لكل طفل تشمل الكراسات والأدوات والزي الرياضي، بالتنسيق مع ثلاث مدارس ابتدائية.'],
      ['A full bag for each child — notebooks, supplies and a PE kit — coordinated with three primary schools.'],
    ),
    beneficiary: { ar: '١٥٠ طفلًا في ٣ قرى', en: '150 children in 3 villages' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مورد أدوات مدرسية — أسوان', en: 'School supplies wholesaler — Aswan' },
        purpose: { ar: '١٥٠ حقيبة مجهزة', en: '150 packed school bags' },
        amount: 45_000,
      },
    ],
    documents: [
      { kind: 'field_report', pages: 2 },
      { kind: 'price_quote', pages: 1 },
    ],
    submittedBy: { name: 'مينا جرجس', relation: 'volunteer' },
    auditorId: 'u_aya',
    payout: 'approved',
  },
  {
    slug: 'insulin-pump-ismailia',
    ref: 10421,
    category: 'medical',
    status: 'closed',
    region: 'EG-IS',
    currency: 'EGP',
    goal: 70_000,
    raised: 70_000,
    zakat: true,
    createdDaysAgo: 40,
    publishedDaysAgo: 29,
    fundedDaysAgo: 27,
    closedDaysAgo: 20,
    title: { ar: 'مضخة إنسولين لطفلة مصابة بسكري النوع الأول', en: 'An insulin pump for a girl with type 1 diabetes' },
    summary: {
      ar: 'تم الصرف ورُفعت فاتورة الجهاز وتقرير المتابعة.',
      en: 'Paid out — the device invoice and follow-up report are uploaded.',
    },
    story: P(
      ['تعاني «جنى» من نوبات هبوط متكررة رغم الحقن المنتظم، وأوصى طبيبها بمضخة إنسولين. اكتمل التمويل خلال ٤١ ساعة، وسُلّم الجهاز وتدربت الأسرة على استخدامه.'],
      [
        'Jana had repeated hypoglycaemic episodes despite regular injections, and her doctor recommended an insulin pump. The case was funded in 41 hours; the device was delivered and the family trained to use it.',
      ],
    ),
    beneficiary: { ar: 'جنى (اسم مستعار)، ٩ سنوات', en: 'Jana (pseudonym), 9' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'الوكيل المعتمد للجهاز', en: 'Authorised device distributor' },
        purpose: { ar: 'مضخة الإنسولين والتدريب', en: 'Insulin pump and training' },
        amount: 62_000,
      },
      {
        payeeType: 'pharmacy',
        payee: { ar: 'صيدلية متخصصة', en: 'Specialist pharmacy' },
        purpose: { ar: 'مستلزمات ٦ أشهر', en: 'Six months of consumables' },
        amount: 8_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 2 },
      { kind: 'invoice', pages: 1 },
      { kind: 'disbursement_proof', pages: 2 },
    ],
    submittedBy: { name: 'والدة جنى', relation: 'family' },
    auditorId: 'u_aya',
    payout: 'paid',
  },
  {
    slug: 'twin-hearing-aids-damietta',
    ref: 10497,
    category: 'medical',
    status: 'draft',
    region: 'EG-DT',
    currency: 'EGP',
    goal: 60_000,
    raised: 0,
    zakat: true,
    createdDaysAgo: 1,
    title: { ar: 'سماعات أذن لطفلين توأم', en: 'Hearing aids for twin boys' },
    summary: { ar: 'بانتظار رفع التقرير الطبي الأخير.', en: 'Waiting for the latest medical report.' },
    story: P(['طلب من والد الطفلين، لم يكتمل رفع المستندات بعد.'], ['Submitted by the boys’ father; documents are still being uploaded.']),
    beneficiary: { ar: 'توأم (أسماء مستعارة)، ٥ سنوات', en: 'Twins (pseudonyms), 5' },
    plan: [],
    documents: [{ kind: 'national_id', pages: 1 }],
    submittedBy: { name: 'والد الطفلين', relation: 'family' },
  },
  {
    slug: 'furniture-instalment-mansoura',
    ref: 10495,
    category: 'debt_relief',
    status: 'under_review',
    region: 'EG-DK',
    currency: 'EGP',
    goal: 18_000,
    raised: 0,
    zakat: true,
    createdDaysAgo: 2,
    title: { ar: 'سداد قسط متأخر على جهاز عروس', en: 'Overdue instalment on a bride’s furniture' },
    summary: { ar: 'متطوعة قدّمت الحالة بإيصالات الأقساط.', en: 'Submitted by a volunteer with the instalment receipts.' },
    story: P(
      ['تأخرت الأسرة ثلاثة أقساط بعد وفاة الأب، والتاجر يهدد برفع دعوى.'],
      ['The family fell three instalments behind after the father died, and the trader is threatening to sue.'],
    ),
    beneficiary: { ar: 'أسرة (اسم مستعار)', en: 'A family (pseudonym)' },
    plan: [],
    documents: [
      { kind: 'debt_proof', pages: 2 },
      { kind: 'national_id', pages: 1 },
    ],
    submittedBy: { name: 'هالة إبراهيم', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'technical-institute-fees-luxor',
    ref: 10493,
    category: 'education',
    status: 'under_review',
    region: 'EG-LX',
    currency: 'EGP',
    goal: 12_000,
    raised: 0,
    zakat: false,
    createdDaysAgo: 3,
    title: { ar: 'مصروفات معهد فني لطالب يعمل ليساعد أسرته', en: 'Technical institute fees for a working student' },
    summary: { ar: 'بانتظار زيارة ميدانية.', en: 'Awaiting a field visit.' },
    story: P(
      ['يعمل الطالب مساءً في ورشة لمساعدة أسرته، ويحتاج لسداد مصروفات السنة النهائية.'],
      ['The student works evenings at a workshop to help his family and needs his final-year fees.'],
    ),
    beneficiary: { ar: 'طالب (اسم مستعار)، ١٩ عامًا', en: 'A student (pseudonym), 19' },
    plan: [],
    documents: [{ kind: 'school_record', pages: 1 }],
    submittedBy: { name: 'الطالب', relation: 'self' },
    auditorId: 'u_aya',
  },
  {
    slug: 'cataract-surgery-suez',
    ref: 10489,
    category: 'medical',
    status: 'field_verified',
    region: 'EG-SUZ',
    currency: 'EGP',
    goal: 22_000,
    raised: 0,
    zakat: true,
    createdDaysAgo: 6,
    title: { ar: 'عملية مياه بيضاء لسيدة مسنة', en: 'Cataract surgery for an elderly woman' },
    summary: {
      ar: 'فقدت «الحاجة زينب» معظم إبصارها في عين واحدة، والعملية تعيد لها الرؤية.',
      en: 'Hajja Zeinab has lost most of the sight in one eye; surgery can restore it.',
    },
    story: P(
      ['«الحاجة زينب» (٧١ عامًا) تعيش وحدها، وتحتاج لعملية مياه بيضاء مع عدسة. أكملت الجمعية الشريكة الزيارة ووافقت على المبلغ.'],
      ['Hajja Zeinab, 71, lives alone and needs cataract surgery with a lens implant. The partner association completed the visit and approved the amount.'],
    ),
    beneficiary: { ar: 'الحاجة زينب (اسم مستعار)، ٧١ عامًا', en: 'Hajja Zeinab (pseudonym), 71' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مستشفى رمد — السويس', en: 'Eye hospital — Suez' },
        purpose: { ar: 'العملية والعدسة', en: 'Surgery and lens' },
        amount: 22_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 1 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'field_report', pages: 2 },
    ],
    submittedBy: { name: 'جارة الحاجة زينب', relation: 'volunteer' },
    auditorId: 'u_mahmoud',
  },
  {
    slug: 'electric-wheelchair-matrouh',
    ref: 10487,
    category: 'medical',
    status: 'field_verified',
    region: 'EG-MT',
    currency: 'EGP',
    goal: 45_000,
    raised: 0,
    zakat: true,
    createdDaysAgo: 8,
    title: { ar: 'كرسي متحرك كهربائي لشاب مصاب بضمور العضلات', en: 'An electric wheelchair for a young man with muscular dystrophy' },
    summary: { ar: 'جاهزة للنشر بعد مراجعة المحتوى.', en: 'Ready to publish after content review.' },
    story: P(
      ['«حازم» (٢٣ عامًا) يدرس عن بُعد، ويحتاج كرسيًا كهربائيًا ليتحرك باستقلالية ويحضر امتحاناته.'],
      ['Hazem, 23, studies remotely and needs an electric wheelchair to move independently and sit his exams.'],
    ),
    beneficiary: { ar: 'حازم (اسم مستعار)، ٢٣ عامًا', en: 'Hazem (pseudonym), 23' },
    plan: [
      {
        payeeType: 'vendor',
        payee: { ar: 'مورد أجهزة تعويضية', en: 'Mobility equipment supplier' },
        purpose: { ar: 'كرسي كهربائي وبطارية احتياطية', en: 'Electric wheelchair and spare battery' },
        amount: 45_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 2 },
      { kind: 'price_quote', pages: 1 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'حازم', relation: 'self' },
    auditorId: 'u_aya',
  },
  {
    slug: 'pediatric-oncology-giza',
    ref: 10448,
    category: 'medical',
    status: 'paused',
    region: 'EG-GZ',
    currency: 'EGP',
    goal: 210_000,
    raised: 40_000,
    zakat: true,
    createdDaysAgo: 28,
    publishedDaysAgo: 21,
    title: { ar: 'علاج أورام لطفل في الجيزة', en: 'Cancer treatment for a child in Giza' },
    summary: { ar: 'متوقفة مؤقتًا لتحديث الخطة العلاجية.', en: 'Paused while the treatment plan is updated.' },
    story: P(
      ['عدّل الفريق الطبي بروتوكول العلاج، وننتظر تقريرًا محدثًا بالتكلفة الجديدة قبل استئناف التبرع.'],
      ['The medical team changed the treatment protocol; we are waiting for an updated cost report before reopening donations.'],
    ),
    beneficiary: { ar: 'طفل (اسم مستعار)، ٨ سنوات', en: 'A boy (pseudonym), 8' },
    plan: [
      {
        payeeType: 'hospital',
        payee: { ar: 'مستشفى أورام أطفال', en: 'Paediatric cancer hospital' },
        purpose: { ar: 'جرعات العلاج', en: 'Treatment doses' },
        amount: 210_000,
      },
    ],
    documents: [
      { kind: 'medical_report', pages: 3 },
      { kind: 'field_report', pages: 1 },
    ],
    submittedBy: { name: 'والد الطفل', relation: 'family' },
    auditorId: 'u_mahmoud',
    reason: 'بانتظار تقرير طبي محدث بعد تعديل بروتوكول العلاج',
  },
  {
    slug: 'private-car-loan-cairo',
    ref: 10484,
    category: 'debt_relief',
    status: 'rejected',
    region: 'EG-C',
    currency: 'EGP',
    goal: 150_000,
    raised: 0,
    zakat: false,
    createdDaysAgo: 9,
    title: { ar: 'سداد قرض سيارة ملاكي', en: 'Repaying a private car loan' },
    summary: { ar: 'لم تستوفِ شروط النشر.', en: 'Did not meet publishing criteria.' },
    story: P(['طلب لسداد أقساط سيارة خاصة.'], ['A request to repay instalments on a private car.']),
    beneficiary: { ar: 'مقدّم الطلب', en: 'Applicant' },
    plan: [],
    documents: [{ kind: 'debt_proof', pages: 1 }],
    submittedBy: { name: 'مقدّم الطلب', relation: 'self' },
    reason: 'لا يندرج ضمن الاحتياجات الأساسية وفق سياسة النشر',
  },
];
