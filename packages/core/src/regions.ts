import type { Localized } from './types';

export interface Region {
  /** ISO 3166-2 code. */
  code: string;
  country: 'EG' | 'SA';
  name: Localized;
}

/** Egypt's 27 governorates. */
export const EGYPT_GOVERNORATES: readonly Region[] = [
  { code: 'EG-C', country: 'EG', name: { ar: 'القاهرة', en: 'Cairo' } },
  { code: 'EG-GZ', country: 'EG', name: { ar: 'الجيزة', en: 'Giza' } },
  { code: 'EG-ALX', country: 'EG', name: { ar: 'الإسكندرية', en: 'Alexandria' } },
  { code: 'EG-KB', country: 'EG', name: { ar: 'القليوبية', en: 'Qalyubia' } },
  { code: 'EG-DK', country: 'EG', name: { ar: 'الدقهلية', en: 'Dakahlia' } },
  { code: 'EG-SHR', country: 'EG', name: { ar: 'الشرقية', en: 'Sharqia' } },
  { code: 'EG-GH', country: 'EG', name: { ar: 'الغربية', en: 'Gharbia' } },
  { code: 'EG-MNF', country: 'EG', name: { ar: 'المنوفية', en: 'Monufia' } },
  { code: 'EG-BH', country: 'EG', name: { ar: 'البحيرة', en: 'Beheira' } },
  { code: 'EG-KFS', country: 'EG', name: { ar: 'كفر الشيخ', en: 'Kafr El Sheikh' } },
  { code: 'EG-DT', country: 'EG', name: { ar: 'دمياط', en: 'Damietta' } },
  { code: 'EG-PTS', country: 'EG', name: { ar: 'بورسعيد', en: 'Port Said' } },
  { code: 'EG-IS', country: 'EG', name: { ar: 'الإسماعيلية', en: 'Ismailia' } },
  { code: 'EG-SUZ', country: 'EG', name: { ar: 'السويس', en: 'Suez' } },
  { code: 'EG-FYM', country: 'EG', name: { ar: 'الفيوم', en: 'Faiyum' } },
  { code: 'EG-BNS', country: 'EG', name: { ar: 'بني سويف', en: 'Beni Suef' } },
  { code: 'EG-MN', country: 'EG', name: { ar: 'المنيا', en: 'Minya' } },
  { code: 'EG-AST', country: 'EG', name: { ar: 'أسيوط', en: 'Asyut' } },
  { code: 'EG-SHG', country: 'EG', name: { ar: 'سوهاج', en: 'Sohag' } },
  { code: 'EG-KN', country: 'EG', name: { ar: 'قنا', en: 'Qena' } },
  { code: 'EG-LX', country: 'EG', name: { ar: 'الأقصر', en: 'Luxor' } },
  { code: 'EG-ASN', country: 'EG', name: { ar: 'أسوان', en: 'Aswan' } },
  { code: 'EG-BA', country: 'EG', name: { ar: 'البحر الأحمر', en: 'Red Sea' } },
  { code: 'EG-WAD', country: 'EG', name: { ar: 'الوادي الجديد', en: 'New Valley' } },
  { code: 'EG-MT', country: 'EG', name: { ar: 'مطروح', en: 'Matrouh' } },
  { code: 'EG-SIN', country: 'EG', name: { ar: 'شمال سيناء', en: 'North Sinai' } },
  { code: 'EG-JS', country: 'EG', name: { ar: 'جنوب سيناء', en: 'South Sinai' } },
];

/** Saudi Arabia's 13 administrative regions. */
export const SAUDI_REGIONS: readonly Region[] = [
  { code: 'SA-01', country: 'SA', name: { ar: 'الرياض', en: 'Riyadh' } },
  { code: 'SA-02', country: 'SA', name: { ar: 'مكة المكرمة', en: 'Makkah' } },
  { code: 'SA-03', country: 'SA', name: { ar: 'المدينة المنورة', en: 'Madinah' } },
  { code: 'SA-04', country: 'SA', name: { ar: 'المنطقة الشرقية', en: 'Eastern Province' } },
  { code: 'SA-05', country: 'SA', name: { ar: 'القصيم', en: 'Al-Qassim' } },
  { code: 'SA-06', country: 'SA', name: { ar: 'حائل', en: "Ha'il" } },
  { code: 'SA-07', country: 'SA', name: { ar: 'تبوك', en: 'Tabuk' } },
  { code: 'SA-08', country: 'SA', name: { ar: 'الحدود الشمالية', en: 'Northern Borders' } },
  { code: 'SA-09', country: 'SA', name: { ar: 'جازان', en: 'Jazan' } },
  { code: 'SA-10', country: 'SA', name: { ar: 'نجران', en: 'Najran' } },
  { code: 'SA-11', country: 'SA', name: { ar: 'الباحة', en: 'Al-Bahah' } },
  { code: 'SA-12', country: 'SA', name: { ar: 'الجوف', en: 'Al-Jawf' } },
  { code: 'SA-14', country: 'SA', name: { ar: 'عسير', en: 'Asir' } },
];

export const REGIONS: readonly Region[] = [...EGYPT_GOVERNORATES, ...SAUDI_REGIONS];

const BY_CODE = new Map(REGIONS.map((region) => [region.code, region]));

export function regionByCode(code: string): Region | undefined {
  return BY_CODE.get(code);
}
