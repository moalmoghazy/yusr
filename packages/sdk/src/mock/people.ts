import type { Localized, Role } from '@yusr/core';

export interface SeedDonor {
  id: string;
  name: Localized;
  region: string;
  /** Relative likelihood of giving (major donors give less often but more). */
  weight: number;
  major?: boolean;
}

export const DONORS: readonly SeedDonor[] = [
  { id: 'd01', name: { ar: 'أحمد م.', en: 'Ahmed M.' }, region: 'EG-C', weight: 3 },
  { id: 'd02', name: { ar: 'منى ع.', en: 'Mona A.' }, region: 'EG-GZ', weight: 3 },
  { id: 'd03', name: { ar: 'محمد س.', en: 'Mohamed S.' }, region: 'EG-ALX', weight: 3 },
  { id: 'd04', name: { ar: 'سارة ح.', en: 'Sara H.' }, region: 'EG-C', weight: 2 },
  { id: 'd05', name: { ar: 'عمر ف.', en: 'Omar F.' }, region: 'EG-DK', weight: 2 },
  { id: 'd06', name: { ar: 'نورهان ك.', en: 'Nourhan K.' }, region: 'EG-C', weight: 2 },
  { id: 'd07', name: { ar: 'خالد ر.', en: 'Khaled R.' }, region: 'SA-01', weight: 1, major: true },
  { id: 'd08', name: { ar: 'ياسمين ط.', en: 'Yasmine T.' }, region: 'EG-GZ', weight: 2 },
  { id: 'd09', name: { ar: 'مصطفى ج.', en: 'Mostafa G.' }, region: 'EG-SHR', weight: 2 },
  { id: 'd10', name: { ar: 'هدى ن.', en: 'Hoda N.' }, region: 'EG-MNF', weight: 2 },
  { id: 'd11', name: { ar: 'كريم ع.', en: 'Karim A.' }, region: 'EG-C', weight: 1, major: true },
  { id: 'd12', name: { ar: 'دينا م.', en: 'Dina M.' }, region: 'EG-ALX', weight: 2 },
  { id: 'd13', name: { ar: 'إبراهيم ش.', en: 'Ibrahim Sh.' }, region: 'EG-AST', weight: 1 },
  { id: 'd14', name: { ar: 'ريم ب.', en: 'Reem B.' }, region: 'SA-02', weight: 1 },
  { id: 'd15', name: { ar: 'طارق ز.', en: 'Tarek Z.' }, region: 'EG-GH', weight: 2 },
  { id: 'd16', name: { ar: 'فاطمة ي.', en: 'Fatma Y.' }, region: 'EG-KB', weight: 2 },
  { id: 'd17', name: { ar: 'عبدالله ق.', en: 'Abdullah Q.' }, region: 'SA-04', weight: 1, major: true },
  { id: 'd18', name: { ar: 'لمياء د.', en: 'Lamiaa D.' }, region: 'EG-C', weight: 2 },
  { id: 'd19', name: { ar: 'يوسف ه.', en: 'Youssef H.' }, region: 'EG-IS', weight: 1 },
  { id: 'd20', name: { ar: 'شيماء و.', en: 'Shaimaa W.' }, region: 'EG-BH', weight: 2 },
  { id: 'd21', name: { ar: 'حسن ل.', en: 'Hassan L.' }, region: 'EG-SUZ', weight: 1 },
  { id: 'd22', name: { ar: 'مريم س.', en: 'Mariam S.' }, region: 'EG-C', weight: 2 },
  { id: 'd23', name: { ar: 'أسامة ك.', en: 'Osama K.' }, region: 'EG-MN', weight: 1 },
  { id: 'd24', name: { ar: 'نادية ر.', en: 'Nadia R.' }, region: 'EG-GZ', weight: 1 },
  { id: 'd25', name: { ar: 'Adam K.', en: 'Adam K.' }, region: 'INT', weight: 1 },
  { id: 'd26', name: { ar: 'Leila B.', en: 'Leila B.' }, region: 'INT', weight: 1 },
];

/** The signed-in donor persona used by the prototype's "My giving" page. */
export const CURRENT_DONOR = {
  id: 'me',
  name: { ar: 'أحمد سامي', en: 'Ahmed Samy' },
  email: 'ahmed.samy@example.com',
  region: 'EG-C',
} as const;

export interface StaffSeed {
  id: string;
  name: Localized;
  email: string;
  roles: Role[];
  mfa: boolean;
}

export const STAFF: readonly StaffSeed[] = [
  { id: 'u_sara', name: { ar: 'سارة الشريف', en: 'Sara El-Sherif' }, email: 'sara@yusr.example', roles: ['super_admin'], mfa: true },
  { id: 'u_mahmoud', name: { ar: 'محمود عبد الحميد', en: 'Mahmoud Abdelhamid' }, email: 'mahmoud@yusr.example', roles: ['field_auditor'], mfa: true },
  { id: 'u_aya', name: { ar: 'آية حسن', en: 'Aya Hassan' }, email: 'aya@yusr.example', roles: ['field_auditor'], mfa: false },
  { id: 'u_heba', name: { ar: 'هبة فؤاد', en: 'Heba Fouad' }, email: 'heba@yusr.example', roles: ['financial_officer'], mfa: true },
  { id: 'u_karim', name: { ar: 'كريم سامي', en: 'Karim Samy' }, email: 'karim@yusr.example', roles: ['financial_officer'], mfa: true },
  { id: 'u_youssef', name: { ar: 'يوسف منصور', en: 'Youssef Mansour' }, email: 'youssef@yusr.example', roles: ['content_moderator'], mfa: true },
];

export const VOLUNTEERS = [
  { id: 'v01', name: { ar: 'هالة إبراهيم', en: 'Hala Ibrahim' }, region: 'EG-DK', cases: 14, visits: 22, status: 'active' as const },
  { id: 'v02', name: { ar: 'مينا جرجس', en: 'Mina Girgis' }, region: 'EG-AST', cases: 9, visits: 17, status: 'active' as const },
  { id: 'v03', name: { ar: 'رحاب عادل', en: 'Rehab Adel' }, region: 'EG-C', cases: 21, visits: 30, status: 'active' as const },
  { id: 'v04', name: { ar: 'علي حمدي', en: 'Ali Hamdy' }, region: 'EG-SHG', cases: 6, visits: 11, status: 'active' as const },
  { id: 'v05', name: { ar: 'إسراء ممدوح', en: 'Esraa Mamdouh' }, region: 'EG-ALX', cases: 3, visits: 4, status: 'onboarding' as const },
  { id: 'v06', name: { ar: 'عبدالرحمن فتحي', en: 'Abdelrahman Fathy' }, region: 'EG-KN', cases: 11, visits: 19, status: 'active' as const },
  { id: 'v07', name: { ar: 'نهى صلاح', en: 'Noha Salah' }, region: 'EG-GZ', cases: 7, visits: 8, status: 'paused' as const },
  { id: 'v08', name: { ar: 'سعد الدوسري', en: 'Saad Al-Dosari' }, region: 'SA-01', cases: 4, visits: 6, status: 'active' as const },
];
