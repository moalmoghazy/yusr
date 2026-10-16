import { createFormatters } from '@yusr/i18n';
import type { Currency, Locale, Localized } from '@yusr/core';

/**
 * Message templates, Arabic first. Short enough for SMS (one Arabic SMS part is 70
 * characters, so the long versions go to email, push and the in-app inbox).
 */
export interface Rendered {
  subject: string;
  text: string;
  /** Up to ~140 characters: SMS, WhatsApp and push body. */
  short: string;
}

const money = (locale: Locale, minor: number, currency: Currency) => createFormatters(locale).money(minor, currency);

export const templates = {
  otp(locale: Locale, code: string): Rendered {
    return locale === 'ar'
      ? { subject: 'رمز الدخول', text: `رمز الدخول إلى يُسر: ${code}\nلا تشاركه مع أحد. صالح لمدة ٥ دقائق.`, short: `رمز يُسر: ${code} — لا تشاركه مع أحد` }
      : {
          subject: 'Your sign-in code',
          text: `Your Yusr sign-in code is ${code}.\nDo not share it. It expires in 5 minutes.`,
          short: `Yusr code: ${code}. Do not share it.`,
        };
  },

  receipt(locale: Locale, data: { receiptNo: string; amountMinor: number; currency: Currency; caseTitle: Localized; link: string }): Rendered {
    const amount = money(locale, data.amountMinor, data.currency);
    const title = data.caseTitle[locale] || data.caseTitle.ar;
    return locale === 'ar'
      ? {
          subject: `إيصال تبرعك ${data.receiptNo}`,
          text: `شكرًا لك. وصل تبرعك بقيمة ${amount} إلى حالة «${title}».\nرقم الإيصال: ${data.receiptNo}\nسنرسل لك إثبات الصرف عند الدفع للجهة المستفيدة.\n${data.link}`,
          short: `وصل تبرعك ${amount} — إيصال ${data.receiptNo}. شكرًا لك.`,
        }
      : {
          subject: `Your donation receipt ${data.receiptNo}`,
          text: `Thank you. Your gift of ${amount} reached “${title}”.\nReceipt no. ${data.receiptNo}\nWe will send proof of payment once the institution is paid.\n${data.link}`,
          short: `Your gift of ${amount} arrived. Receipt ${data.receiptNo}. Thank you.`,
        };
  },

  retry(locale: Locale, data: { receiptNo: string; link: string }): Rendered {
    return locale === 'ar'
      ? {
          subject: 'لم يكتمل تبرعك',
          text: `لم تكتمل عملية الدفع للتبرع ${data.receiptNo}. لم يُخصم أي مبلغ. يمكنك المحاولة مرة أخرى:\n${data.link}`,
          short: `لم يكتمل تبرعك ${data.receiptNo}، ولم يُخصم أي مبلغ.`,
        }
      : {
          subject: 'Your donation did not go through',
          text: `The payment for ${data.receiptNo} was not completed and nothing was charged. You can try again:\n${data.link}`,
          short: `Donation ${data.receiptNo} did not go through. Nothing was charged.`,
        };
  },

  funded(locale: Locale, data: { caseTitle: Localized; link: string }): Rendered {
    const title = data.caseTitle[locale] || data.caseTitle.ar;
    return locale === 'ar'
      ? {
          subject: 'اكتمل تمويل الحالة التي دعمتها',
          text: `بفضل الله ثم بفضلك، اكتمل تمويل «${title}». سنبلغك عند صرف المبلغ للجهة المستفيدة.\n${data.link}`,
          short: `اكتمل تمويل «${title}» بفضل عطائك.`,
        }
      : {
          subject: 'A case you supported is fully funded',
          text: `Thanks to you, “${title}” is fully funded. We will let you know when the institution is paid.\n${data.link}`,
          short: `“${title}” is fully funded thanks to you.`,
        };
  },

  disbursed(locale: Locale, data: { caseTitle: Localized; payee: Localized; amountMinor: number; currency: Currency; link: string }): Rendered {
    const title = data.caseTitle[locale] || data.caseTitle.ar;
    const payee = data.payee[locale] || data.payee.ar;
    const amount = money(locale, data.amountMinor, data.currency);
    return locale === 'ar'
      ? {
          subject: 'وصل تبرعك إلى الجهة المستفيدة',
          text: `صرفنا ${amount} إلى ${payee} لصالح «${title}». إيصال الصرف متاح في صفحة الحالة.\n${data.link}`,
          short: `وصل عطاؤك: صرفنا ${amount} إلى ${payee}.`,
        }
      : {
          subject: 'Your gift reached the institution',
          text: `We paid ${amount} to ${payee} for “${title}”. The payment receipt is on the case page.\n${data.link}`,
          short: `Your gift arrived: ${amount} paid to ${payee}.`,
        };
  },

  refunded(locale: Locale, data: { receiptNo: string; amountMinor: number; currency: Currency }): Rendered {
    const amount = money(locale, data.amountMinor, data.currency);
    return locale === 'ar'
      ? {
          subject: `استرداد للتبرع ${data.receiptNo}`,
          text: `أعدنا ${amount} إلى وسيلة الدفع الخاصة بك للتبرع ${data.receiptNo}. قد يستغرق ظهوره بضعة أيام.`,
          short: `أعدنا ${amount} للتبرع ${data.receiptNo}.`,
        }
      : {
          subject: `Refund for ${data.receiptNo}`,
          text: `We returned ${amount} to your payment method for ${data.receiptNo}. It may take a few days to appear.`,
          short: `We refunded ${amount} for ${data.receiptNo}.`,
        };
  },
};
