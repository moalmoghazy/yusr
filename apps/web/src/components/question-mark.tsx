'use client';

import { brand } from '@yusr/theme';
import { useEffect, useState } from 'react';

const { logo } = brand;

/** The bowl as absolute cubics, so the question mark can share its commands and SMIL can morph between them. */
const BOWL = 'M12.5 24C12.5 36.4 21.2 45 32 45C42.8 45 51.5 36.4 51.5 24';
/** "?" on the same grid and pen; its stem ends above where the ي's dots sit, which becomes its dot. */
const QUESTION = 'M19 22C19 8 45 8 45 21C45 30 32 30 32 41';
/** "؟" is the mirror image. */
const QUESTION_RTL = 'M45 22C45 8 19 8 19 21C19 30 32 30 32 41';

// Mark (2s), morph (1s), question mark (2.5s), morph back (1s), mark (1.5s).
const DURATION = '8s';
const TIMES = '0;0.25;0.375;0.6875;0.8125;1';
const SPLINES = '0 0 1 1;0.65 0 0.35 1;0 0 1 1;0.65 0 0.35 1;0 0 1 1';
const loop = (from: string, to: string) => [from, from, to, to, from, from].join(';');
const timing = { dur: DURATION, repeatCount: 'indefinite', calcMode: 'spline', keyTimes: TIMES, keySplines: SPLINES } as const;

/**
 * Beside «من نحن؟»: the mark turns into a question mark and back. The bowl of ي bends into the hook,
 * its two dots draw together and fade, and the golden ḍamma falls to become the question mark's dot.
 * With reduced motion (and before hydration) it is the still mark.
 */
export function QuestionMark({ rtl }: { rtl: boolean }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimate(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const drop = logo.guides.drop;
  const [first, second] = logo.dots.items;
  const fall = `${(32 - drop.cx).toFixed(2)} ${(first!.cy - drop.cy).toFixed(2)}`;

  return (
    <svg viewBox="-18 -18 100 100" className="size-64 xl:size-72" aria-hidden focusable="false">
      <circle cx="32" cy="32" r="44" className="ym-ring" />
      <circle cx="32" cy="32" r="35" className="ym-ring ym-ring-2" />
      <path d={BOWL} fill="none" stroke="var(--primary)" strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {animate && <animate attributeName="d" values={loop(BOWL, rtl ? QUESTION_RTL : QUESTION)} {...timing} />}
      </path>
      {[first!, second!].map((dot) => (
        <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill="var(--primary)">
          {animate && (
            <>
              <animate attributeName="cx" values={loop(String(dot.cx), '32')} {...timing} />
              <animate attributeName="opacity" values={loop('1', '0')} {...timing} />
            </>
          )}
        </circle>
      ))}
      <g>
        {animate && <animateTransform attributeName="transform" type="translate" values={loop('0 0', fall)} {...timing} />}
        <g transform={`translate(${drop.cx} ${drop.cy})`}>
          <g>
            {animate && <animateTransform attributeName="transform" type="scale" values={loop('1', '0.6')} {...timing} />}
            <path d={logo.drop.d} transform={`translate(${-drop.cx} ${-drop.cy}) ${logo.drop.transform}`} fill="var(--highlight)" />
          </g>
        </g>
      </g>
    </svg>
  );
}
