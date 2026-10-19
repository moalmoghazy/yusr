import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ar as arMessages, caseShareMessage, createTranslator, en as enMessages } from '../src/index';

const ar = createTranslator({ locale: 'ar', messages: arMessages }).t;
const en = createTranslator({ locale: 'en', messages: enMessages }).t;

describe('the share line', () => {
  it('uses the case’s own line, then Yusr’s promise', () => {
    const line = caseShareMessage(ar, 'ar', {
      title: { ar: 'عنوان', en: 'Title' },
      category: 'medical',
      shareText: { ar: 'تبرعك يقرّبنا من إنقاذ إيناس من حروق الدرجة الثانية، وتستطيع أن تساهم في اكتمال تكاليف علاجها.', en: 'x' },
    });
    assert.equal(line, 'تبرعك يقرّبنا من إنقاذ إيناس من حروق الدرجة الثانية، وتستطيع أن تساهم في اكتمال تكاليف علاجها مع يُسر: تبرع آمن، موثوق، ويصل للمستحق.');
  });

  it('composes one from the title and category until the team writes it', () => {
    const item = { title: { ar: 'زراعة قوقعة لطفل', en: 'A cochlear implant for a child' }, category: 'medical' as const, shareText: null };
    assert.equal(
      caseShareMessage(ar, 'ar', item),
      'تبرعك يقرّبنا من زراعة قوقعة لطفل، وتستطيع أن تساهم في اكتمال تكاليف العلاج مع يُسر: تبرع آمن، موثوق، ويصل للمستحق.',
    );
    assert.equal(
      caseShareMessage(en, 'en', item),
      'Your gift brings us closer to a cochlear implant for a child, and you can help complete the cost of treatment with Yusr — safe, trusted giving that reaches the person in need.',
    );
  });
});
