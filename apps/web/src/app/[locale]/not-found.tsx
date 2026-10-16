import { buttonClasses, Icon, LogoMark } from '@yusr/ui';
import Link from 'next/link';

/**
 * Not-found pages get no params, so the copy is bilingual. (The locale layout around it still
 * sets the page language and direction.)
 */
export default function NotFound() {
  return (
    <section className="container-page flex min-h-[60dvh] flex-col items-center justify-center gap-5 py-16 text-center">
      <LogoMark size={64} />
      <h1 className="font-display text-3xl font-bold">
        <span lang="ar">الصفحة غير موجودة</span> · <span lang="en">Page not found</span>
      </h1>
      <p className="max-w-md text-muted-foreground">
        <span lang="ar">ربما نُقلت الحالة أو اكتمل تمويلها.</span> <span lang="en">The case may have moved or been fully funded.</span>
      </p>
      <Link href="/" className={buttonClasses({})}>
        <Icon name="home" size={17} />
        <span lang="ar">الرئيسية</span> · <span lang="en">Home</span>
      </Link>
    </section>
  );
}
