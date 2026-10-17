import { permanentRedirect } from 'next/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';

/** The visual identity now lives on the About page; old links land there. */
export default async function IdentityPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  permanentRedirect(`/${locale}/about`);
}
