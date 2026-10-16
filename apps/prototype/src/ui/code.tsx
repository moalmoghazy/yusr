import { Fragment, useMemo, useRef } from 'react';
import { tokenize, toLines, type CodeLang } from './highlight';
import { CopyCodeButton, cx } from './primitives';

export { langFromPath, type CodeLang } from './highlight';

export interface CodeBlockProps {
  code: string;
  lang: CodeLang;
  /** Shown in the header bar, e.g. the file path. */
  title?: string;
  copyLabel: string;
  copiedLabel: string;
  lineNumbers?: boolean;
  className?: string;
  /** Highlights these 1-based line numbers. */
  marked?: readonly number[];
}

export function CodeBlock({ code, lang, title, copyLabel, copiedLabel, lineNumbers = true, className, marked }: CodeBlockProps) {
  const lines = useMemo(() => toLines(tokenize(code.replace(/\n$/, ''), lang)), [code, lang]);
  const body = useRef<HTMLElement>(null);
  const markedSet = useMemo(() => new Set(marked ?? []), [marked]);
  const width = String(lines.length).length;
  return (
    <div className={cx('code-block', className)} dir="ltr">
      <div className="code-head">
        <span className="code-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {title && <span className="code-title">{title}</span>}
        <CopyCodeButton value={code} label={copyLabel} copiedLabel={copiedLabel} target={body} />
      </div>
      <pre className="code-pre" tabIndex={0}>
        <code ref={body} className={cx('code', lineNumbers && 'has-lines')} style={{ ['--ln-width' as string]: `${width + 1}ch` }}>
          {lines.map((line, i) => (
            <Fragment key={i}>
              <span className={cx('code-line', markedSet.has(i + 1) && 'is-marked')}>
                {lineNumbers && (
                  <span className="ln" aria-hidden>
                    {i + 1}
                  </span>
                )}
                {line.length === 0
                  ? ' '
                  : line.map((token, j) =>
                      token.type === 'plain' ? (
                        token.text
                      ) : (
                        <span key={j} className={`tk-${token.type}`}>
                          {token.text}
                        </span>
                      ),
                    )}
              </span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
