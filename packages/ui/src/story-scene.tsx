import type { CaseCategory } from '@yusr/core';
import { useId, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * Illustrated scenes for «قصص نجاح»: where the help landed (a hospital room, a potter's workshop, a
 * relief distribution, a classroom, a home), with every face blurred. Yusr does not publish
 * beneficiaries' photos; these drawings stand in for them and keep the same rule, nobody can be
 * recognised. One scene per category; fixed illustration colours (not brand tokens) so a scene
 * reads the same in light and dark.
 */

/** The illustration palette: skin tones, hair and fabrics. */
const C = {
  skin: '#C68B66',
  skinLight: '#D9A47F',
  skinDark: '#9E6A4B',
  hair: '#2A1C15',
  white: '#FFFFFF',
  ink: '#1F2D2E',
  shadow: 'rgba(20, 30, 32, 0.14)',
} as const;

type Cover = { kind: 'hijab'; color: string } | { kind: 'hair'; color?: string } | { kind: 'cap'; color: string };

/** A head with its face drawn, then blurred: it reads as a person, but not as anyone in particular. */
function Head({ x, y, r, skin = C.skin, cover, blur }: { x: number; y: number; r: number; skin?: string; cover: Cover; blur: string }) {
  return (
    <g filter={`url(#${blur})`}>
      {cover.kind === 'hijab' && (
        <path
          d={`M${x - r * 1.35} ${y + r * 2.1} Q${x - r * 1.5} ${y - r * 1.5} ${x} ${y - r * 1.38} Q${x + r * 1.5} ${y - r * 1.5} ${x + r * 1.35} ${y + r * 2.1} Z`}
          fill={cover.color}
        />
      )}
      {cover.kind === 'hair' && <circle cx={x} cy={y - r * 0.18} r={r * 1.06} fill={cover.color ?? C.hair} />}
      <ellipse cx={x} cy={y + r * 0.08} rx={r * 0.86} ry={r} fill={skin} />
      {cover.kind === 'cap' && <path d={`M${x - r * 0.9} ${y - r * 0.35} Q${x} ${y - r * 1.45} ${x + r * 0.9} ${y - r * 0.35} Z`} fill={cover.color} />}
      <circle cx={x - r * 0.32} cy={y} r={r * 0.1} fill={C.ink} />
      <circle cx={x + r * 0.32} cy={y} r={r * 0.1} fill={C.ink} />
      <path
        d={`M${x - r * 0.3} ${y + r * 0.42} Q${x} ${y + r * 0.66} ${x + r * 0.3} ${y + r * 0.42}`}
        stroke={C.ink}
        strokeWidth={r * 0.08}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function Hospital({ blur }: { blur: string }) {
  return (
    <>
      <rect width="640" height="400" fill="#E6F1F0" />
      <rect y="300" width="640" height="100" fill="#CBD9D6" />
      <path d="M0 300h640" stroke="#B7C9C5" strokeWidth="3" />
      {/* window with morning light */}
      <rect x="54" y="56" width="150" height="150" rx="6" fill={C.white} />
      <rect x="64" y="66" width="130" height="130" rx="3" fill="#BFE4EA" />
      <circle cx="160" cy="104" r="20" fill="#FFE3A3" />
      <path d="M64 170c30-18 58-10 82-22s34-8 48-4v52H64Z" fill="#9FD2C4" />
      <path d="M129 66v130M64 131h130" stroke={C.white} strokeWidth="6" />
      <path d="M40 56c10 60 6 120 18 160l-18 4Z" fill="#7FB9C0" opacity=".7" />
      {/* monitor */}
      <rect x="474" y="62" width="122" height="84" rx="10" fill="#17323A" />
      <path d="M486 110h22l8-22 10 40 9-30 7 12h42" stroke="#5BE0A6" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="582" cy="76" r="4" fill="#F2A93B" />
      {/* IV pole */}
      <path d="M440 96v228M422 324h36" stroke="#9AA9AC" strokeWidth="5" strokeLinecap="round" />
      <rect x="426" y="100" width="28" height="40" rx="7" fill="#DDF3F6" stroke="#9AA9AC" strokeWidth="2" />
      <path d="M440 140c0 40-20 60-40 82" stroke="#9AA9AC" strokeWidth="2" fill="none" />
      {/* bed */}
      <rect x="170" y="196" width="18" height="128" rx="6" fill="#B9C6C9" />
      <rect x="170" y="252" width="312" height="44" rx="10" fill={C.white} />
      <rect x="176" y="296" width="12" height="34" fill="#9AA9AC" />
      <rect x="462" y="296" width="12" height="34" fill="#9AA9AC" />
      <rect x="196" y="214" width="64" height="44" rx="18" fill={C.white} stroke="#D9E3E4" strokeWidth="2" />
      {/* the girl sitting up, blanket over her legs */}
      <path d="M226 258c2-46 18-70 44-70s40 24 42 70Z" fill="#8FCBD3" />
      <rect x="200" y="238" width="270" height="40" rx="16" fill="#0F8A93" />
      <path d="M220 248h230M220 262h230" stroke="#3FC6CF" strokeWidth="3" opacity=".6" />
      <path d="M292 220c22 6 36 14 42 26" stroke={C.skinLight} strokeWidth="11" strokeLinecap="round" fill="none" />
      <rect x="326" y="236" width="20" height="13" rx="3" fill="#33454A" />
      <circle cx="342" cy="242" r="2" fill="#5BE0A6" />
      <Head x={270} y={164} r={24} skin={C.skinLight} cover={{ kind: 'hair' }} blur={blur} />
      {/* teddy bear */}
      <circle cx="420" cy="226" r="16" fill="#C9945F" />
      <circle cx="408" cy="212" r="6" fill="#C9945F" />
      <circle cx="432" cy="212" r="6" fill="#C9945F" />
      <ellipse cx="420" cy="252" rx="20" ry="14" fill="#C9945F" />
      {/* her mother on a chair */}
      <rect x="66" y="262" width="78" height="12" rx="4" fill="#8A6B4E" />
      <path d="M72 274v56M138 274v56" stroke="#8A6B4E" strokeWidth="6" />
      <path d="M78 270c-4-58 6-92 28-92s34 34 30 92Z" fill="#6B4E8A" />
      <path d="M128 214c22 8 40 16 56 30" stroke="#6B4E8A" strokeWidth="14" strokeLinecap="round" fill="none" />
      <circle cx="186" cy="246" r="8" fill={C.skin} />
      <Head x={108} y={156} r={22} cover={{ kind: 'hijab', color: '#8E5A9C' }} blur={blur} />
    </>
  );
}

function Workshop({ blur }: { blur: string }) {
  return (
    <>
      <rect width="640" height="400" fill="#F1E3CD" />
      <rect y="304" width="640" height="96" fill="#D7B78F" />
      {/* doorway with daylight */}
      <path d="M470 304V120a60 60 0 0 1 120 0v184Z" fill="#FFF3D9" />
      <path d="M470 304V120a60 60 0 0 1 120 0v184" stroke="#C99E6B" strokeWidth="8" fill="none" />
      <path d="M500 304c10-40 40-60 70-64v64Z" fill="#E9C98F" opacity=".7" />
      {/* shelves of finished pots */}
      {[118, 198].map((y) => (
        <rect key={y} x="40" y={y} width="250" height="10" rx="3" fill="#9C6B3F" />
      ))}
      <path d="M62 118c-12-30 0-46 14-46s26 16 14 46Z" fill="#B5653A" />
      <path d="M112 118c-6-22-2-38 16-38s22 16 16 38Z" fill="#2F7F8A" />
      <ellipse cx="128" cy="84" rx="12" ry="4" fill="#256870" />
      <path d="M168 118c-14-26-4-50 18-50s32 24 18 50Z" fill="#D9A441" />
      <path d="M170 92h34" stroke="#B5653A" strokeWidth="4" />
      <path d="M232 118c-6-18 0-34 16-34s22 16 16 34Z" fill="#C9824F" />
      <path d="M60 198c-8-24 4-40 20-40s28 16 20 40Z" fill="#2F7F8A" />
      <path d="M64 178h32" stroke="#F3D69B" strokeWidth="4" />
      <path d="M128 198c-10-30 2-46 18-46s28 16 18 46Z" fill="#B5653A" />
      <path d="M198 198c-4-20 2-32 18-32s22 12 18 32Z" fill="#D9A441" />
      <path d="M252 198c-8-26 2-40 14-40s22 14 14 40Z" fill="#9C5A2E" />
      {/* the potter at his wheel, clear of the shelves */}
      <g transform="translate(76 0)">
        <ellipse cx="300" cy="330" rx="150" ry="14" fill={C.shadow} />
        <rect x="196" y="270" width="64" height="14" rx="5" fill="#7A5232" />
        <path d="M204 284v40M252 284v40" stroke="#7A5232" strokeWidth="6" />
        <path d="M206 276c-8-64 8-104 34-104s40 40 34 104Z" fill="#5E6E7C" />
        <path d="M266 216c26 8 46 26 60 46" stroke="#5E6E7C" strokeWidth="16" strokeLinecap="round" fill="none" />
        <path d="M266 240c30 4 50 14 62 26" stroke="#5E6E7C" strokeWidth="15" strokeLinecap="round" fill="none" />
        <Head x={240} y={150} r={24} skin={C.skinDark} cover={{ kind: 'cap', color: '#F4EFE6' }} blur={blur} />
        <rect x="336" y="282" width="56" height="44" rx="8" fill="#6E4A2E" />
        <ellipse cx="364" cy="282" rx="48" ry="10" fill="#8A5E3A" />
        <path d="M340 278c-6-28 6-48 24-48s30 20 24 48Z" fill="#B5653A" />
        <ellipse cx="364" cy="232" rx="14" ry="5" fill="#9C5A2E" />
        <circle cx="334" cy="262" r="9" fill={C.skinDark} />
        <circle cx="392" cy="262" r="9" fill={C.skinDark} />
      </g>
      {/* settled: the receipt pinned on the wall */}
      <rect x="380" y="70" width="58" height="74" rx="4" fill={C.white} transform="rotate(4 409 107)" />
      <path d="M392 92h34M392 104h34M392 116h22" stroke="#B9AE9C" strokeWidth="3" transform="rotate(4 409 107)" />
      <circle cx="409" cy="72" r="4" fill="#C2410C" />
    </>
  );
}

function Relief({ blur }: { blur: string }) {
  return (
    <>
      <rect width="640" height="400" fill="#DCEAF2" />
      <path d="M40 210a250 250 0 0 1 500 0" stroke="#F3C969" strokeWidth="10" fill="none" opacity=".45" />
      <path d="M60 210a230 230 0 0 1 460 0" stroke="#7FC4C8" strokeWidth="10" fill="none" opacity=".4" />
      <circle cx="560" cy="70" r="28" fill="#FFE3A3" />
      <path d="M90 74a22 22 0 0 1 42-6 18 18 0 0 1 24 18h-74a14 14 0 0 1 8-12Z" fill={C.white} opacity=".9" />
      {/* village after the flood */}
      <rect x="20" y="170" width="120" height="110" fill="#C9A27A" />
      <rect x="130" y="196" width="96" height="84" fill="#B98F66" />
      <rect x="48" y="206" width="22" height="28" fill="#7A5A3E" />
      <rect x="160" y="222" width="18" height="22" fill="#7A5A3E" />
      <path d="M560 290c-2-60 2-110 8-150" stroke="#7C4A1E" strokeWidth="8" fill="none" />
      <path d="M568 140c-24-14-48-8-62 6 22-4 42-2 62-6Zm0 0c22-16 46-12 60 0-20-2-40-2-60 0Zm0 0c-6-20 0-34 12-42 0 14-4 28-12 42Z" fill="#3E8C5A" />
      <rect y="280" width="640" height="120" fill="#BFA27A" />
      <ellipse cx="120" cy="330" rx="60" ry="8" fill="#A9C6D6" opacity=".7" />
      <ellipse cx="520" cy="350" rx="44" ry="6" fill="#A9C6D6" opacity=".7" />
      {/* table with folded blankets and rolled mattresses */}
      <rect x="236" y="254" width="190" height="12" rx="4" fill="#8A6B4E" />
      <path d="M246 266v56M416 266v56" stroke="#8A6B4E" strokeWidth="6" />
      {['#0F8A93', '#D9A441', '#9C5A2E', '#3FC6CF'].map((fill, index) => (
        <rect key={fill} x="250" y={232 - index * 18} width="76" height="18" rx="5" fill={fill} />
      ))}
      <rect x="338" y="216" width="78" height="38" rx="19" fill="#E9E1D2" />
      <circle cx="357" cy="235" r="17" fill="#D8CDB9" />
      {/* a volunteer hands a blanket to a mother */}
      <ellipse cx="320" cy="344" rx="230" ry="12" fill={C.shadow} />
      <path d="M440 340c-6-90 6-150 34-150s42 60 36 150Z" fill="#4A5763" />
      <path d="M446 220c4-22 14-30 28-30s24 8 28 30l-4 60h-48Z" fill="#0F8A93" />
      <path d="M454 230c-24 14-40 26-52 40" stroke="#4A5763" strokeWidth="15" strokeLinecap="round" fill="none" />
      <Head x={474} y={166} r={23} cover={{ kind: 'hair' }} blur={blur} />
      <rect x="380" y="262" width="56" height="24" rx="6" fill="#D9A441" transform="rotate(-8 408 274)" />
      <path d="M150 340c-6-96 8-152 40-152s46 56 40 152Z" fill="#2F4F6B" />
      <path d="M218 236c40 6 92 14 168 32" stroke="#2F4F6B" strokeWidth="15" strokeLinecap="round" fill="none" />
      <Head x={190} y={164} r={24} cover={{ kind: 'hijab', color: '#1F3A52' }} blur={blur} />
      <path d="M118 340c-2-46 4-74 22-74s24 28 22 74Z" fill="#C2410C" />
      <Head x={140} y={250} r={15} skin={C.skinLight} cover={{ kind: 'hair' }} blur={blur} />
    </>
  );
}

function Classroom({ blur }: { blur: string }) {
  return (
    <>
      <rect width="640" height="400" fill="#F4EEDF" />
      <rect y="310" width="640" height="90" fill="#D6C3A0" />
      <rect x="150" y="50" width="340" height="150" rx="8" fill="#8A6B4E" />
      <rect x="160" y="60" width="320" height="130" rx="4" fill="#2E5E4E" />
      <path
        d="M190 100h40M210 80v40M260 100h30M310 92h24M310 108h24M356 100c10-16 30-16 40 0s30 16 40 0"
        stroke="#E8F2EC"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M190 150h120M190 166h80" stroke="#E8F2EC" strokeWidth="3" opacity=".6" strokeLinecap="round" />
      <rect x="520" y="70" width="90" height="120" rx="6" fill={C.white} />
      <rect x="528" y="78" width="74" height="104" rx="3" fill="#BFE4EA" />
      <path d="M565 78v104" stroke={C.white} strokeWidth="5" />
      {/* desks */}
      <rect x="60" y="262" width="150" height="14" rx="4" fill="#B5864F" />
      <path d="M72 276v54M198 276v54" stroke="#8A6B4E" strokeWidth="6" />
      <rect x="430" y="262" width="150" height="14" rx="4" fill="#B5864F" />
      <path d="M442 276v54M568 276v54" stroke="#8A6B4E" strokeWidth="6" />
      {/* the student with new books and bag */}
      <ellipse cx="320" cy="350" rx="80" ry="10" fill={C.shadow} />
      <path d="M282 346c-6-90 8-140 38-140s44 50 38 140Z" fill="#2F7F8A" />
      <rect x="276" y="222" width="20" height="70" rx="8" fill="#C2410C" />
      <path d="M346 240c12 12 18 22 22 34" stroke="#2F7F8A" strokeWidth="14" strokeLinecap="round" fill="none" />
      <rect x="352" y="252" width="34" height="44" rx="3" fill="#D9A441" transform="rotate(-10 369 274)" />
      <rect x="358" y="248" width="34" height="44" rx="3" fill="#0F8A93" transform="rotate(-4 375 270)" />
      <Head x={320} y={172} r={24} skin={C.skinLight} cover={{ kind: 'hijab', color: '#F3F0EA' }} blur={blur} />
      <rect x="96" y="240" width="40" height="22" rx="3" fill="#9C5A2E" />
      <rect x="470" y="246" width="30" height="16" rx="3" fill="#3FC6CF" />
    </>
  );
}

function Home({ blur }: { blur: string }) {
  return (
    <>
      <rect width="640" height="400" fill="#FBEFE3" />
      <rect y="300" width="640" height="100" fill="#E4CDB3" />
      <rect x="70" y="70" width="120" height="110" rx="6" fill={C.white} />
      <rect x="80" y="80" width="100" height="90" rx="3" fill="#CDE6EC" />
      <path d="M130 80v90M80 125h100" stroke={C.white} strokeWidth="5" />
      <rect x="440" y="80" width="130" height="90" rx="4" fill="#E9D6BE" stroke="#C99E6B" strokeWidth="4" />
      <path d="M460 150l30-34 22 22 14-12 24 24Z" fill="#9FD2C4" />
      {/* sofa */}
      <rect x="380" y="232" width="220" height="70" rx="20" fill="#B5653A" />
      <rect x="370" y="216" width="40" height="90" rx="16" fill="#9C5A2E" />
      <rect x="570" y="216" width="40" height="90" rx="16" fill="#9C5A2E" />
      {/* caretaker and two children with a gift */}
      <ellipse cx="300" cy="346" rx="200" ry="12" fill={C.shadow} />
      <path d="M180 344c-6-100 8-160 42-160s48 60 42 160Z" fill="#0A4A50" />
      <path d="M252 236c20 10 34 20 44 34" stroke="#0A4A50" strokeWidth="15" strokeLinecap="round" fill="none" />
      <Head x={222} y={158} r={24} cover={{ kind: 'hijab', color: '#0F8A93' }} blur={blur} />
      <path d="M300 344c-4-56 4-90 26-90s30 34 26 90Z" fill="#D9A441" />
      <Head x={326} y={232} r={17} skin={C.skinLight} cover={{ kind: 'hair' }} blur={blur} />
      <path d="M372 344c-4-46 4-74 22-74s26 28 22 74Z" fill="#3FC6CF" />
      <Head x={394} y={252} r={15} cover={{ kind: 'hair' }} blur={blur} />
      <rect x="338" y="276" width="34" height="28" rx="4" fill="#C2410C" />
      <path d="M355 276v28M338 290h34" stroke="#F3D69B" strokeWidth="4" />
    </>
  );
}

const SCENES: Readonly<Record<CaseCategory, (props: { blur: string }) => ReactNode>> = {
  medical: Hospital,
  debt_relief: Workshop,
  relief: Relief,
  education: Classroom,
  orphans: Home,
};

export interface StorySceneProps {
  category: CaseCategory;
  className?: string;
}

/** Where a closed case's help landed, drawn with blurred faces (decorative: the story says it in words). */
export function StoryScene({ category, className }: StorySceneProps) {
  const blur = `ysr-blur-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const Scene = SCENES[category];
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" className={cn('block', className)} aria-hidden focusable="false">
      <defs>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
      </defs>
      <Scene blur={blur} />
    </svg>
  );
}
