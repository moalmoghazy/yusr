/**
 * A small, dependency-free syntax highlighter for the languages this repository uses.
 * It only has to be good at *our* files (TypeScript/TSX, SQL, YAML, JSON, CSS, shell),
 * so a sticky-regex scanner with a classifier for identifiers is enough.
 */
export type CodeLang = 'ts' | 'tsx' | 'sql' | 'json' | 'css' | 'bash' | 'yaml' | 'md';

export type TokenType = 'kw' | 'str' | 'com' | 'num' | 'type' | 'fn' | 'tag' | 'prop' | 'punct' | 'deco' | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}

const TS_KEYWORDS = new Set(
  (
    'import export from const let var function return if else for while do of in new class extends implements interface type enum ' +
    'async await throw try catch finally switch case default break continue typeof keyof readonly as satisfies public private ' +
    'protected static void null undefined true false this super declare namespace abstract yield delete instanceof get set is'
  ).split(' '),
);

const SQL_KEYWORDS = new Set(
  (
    'CREATE TABLE TYPE AS ENUM NOT NULL DEFAULT PRIMARY KEY REFERENCES UNIQUE CHECK CONSTRAINT INDEX ON DELETE CASCADE RESTRICT ' +
    'SET FUNCTION RETURNS TRIGGER BEGIN END IF THEN ELSE ELSIF RAISE EXCEPTION LANGUAGE EXECUTE PROCEDURE BEFORE AFTER FOR EACH ROW ' +
    'STATEMENT INSERT UPDATE SELECT FROM WHERE GROUP BY HAVING AND OR IN IS EXISTS EXTENSION GENERATED ALWAYS IDENTITY DEFERRABLE ' +
    'INITIALLY DEFERRED IMMEDIATE REVOKE GRANT ALL TO PUBLIC WITH USING SCHEMA COMMENT VIEW REPLACE RETURN DECLARE INTO VALUES TRUE ' +
    'FALSE LIMIT ORDER ASC DESC ALTER ADD DROP COLUMN NO ACTION MATCH SIMPLE LIKE BETWEEN CASE WHEN DISTINCT JOIN LEFT INNER OUTER ' +
    'NEW OLD TG_OP PERFORM FOUND ROLE LOGIN OWNED CONCURRENTLY PARTIAL COLLATE STORED VARIADIC STRICT IMMUTABLE STABLE VOLATILE ' +
    'SECURITY DEFINER INVOKER COMMIT ROLLBACK TRANSACTION LOCK SHARE MODE NOWAIT SKIP LOCKED OVER PARTITION WINDOW FILTER ANY'
  ).split(' '),
);

const SQL_TYPES = new Set(
  'uuid text bigint integer int smallint boolean bool timestamptz timestamp jsonb json numeric char varchar date citext bytea inet trigger void record interval'.split(
    ' ',
  ),
);

type Classifier = (match: string, source: string, end: number, previous: Token | undefined, lang: CodeLang) => TokenType;
interface Rule {
  re: RegExp;
  type: TokenType | Classifier;
}

const rule = (pattern: string, type: Rule['type'], flags = ''): Rule => ({ re: new RegExp(pattern, `y${flags}`), type });

const isIdentChar = (char: string | undefined) => char !== undefined && /[\w$)\]]/.test(char);

const classifyTs: Classifier = (word, source, end, previous, lang) => {
  if (previous?.type === 'tag' && previous.text.startsWith('<')) return 'tag';
  if (TS_KEYWORDS.has(word)) return 'kw';
  if (/^[A-Z]/.test(word)) return 'type';
  const rest = source.slice(end, end + 60);
  if (/^\s*\(/.test(rest) || /^<[\w\s,<>[\]|'".]*>\(/.test(rest)) return 'fn';
  if (/^\??:(?!:)/.test(rest) && previous?.text.trim() !== '?') return 'prop';
  if (lang === 'tsx' && /^=[^=>]/.test(rest)) return 'prop';
  return 'plain';
};

const classifySql: Classifier = (word, source, end) => {
  if (SQL_KEYWORDS.has(word.toUpperCase())) return 'kw';
  if (SQL_TYPES.has(word.toLowerCase())) return 'type';
  if (/^\s*\(/.test(source.slice(end, end + 4))) return 'fn';
  return 'plain';
};

const TS_RULES: Rule[] = [
  rule('\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', 'com'),
  rule('\'(?:\\\\.|[^\'\\\\\\n])*\'|"(?:\\\\.|[^"\\\\\\n])*"|`(?:\\\\[\\s\\S]|[^`\\\\])*`', 'str'),
  rule('(?:0x[\\da-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?n?)(?![\\w$])', 'num'),
  rule('@[A-Za-z_]\\w*', 'deco'),
  rule('<\\/?(?=[A-Za-z])', (match, source, end, _previous, lang) => (lang === 'tsx' && !isIdentChar(source[end - match.length - 1]) ? 'tag' : 'punct')),
  rule('[A-Za-z_$][\\w$]*', classifyTs),
  rule('\\s+', 'plain'),
  rule('[{}()[\\];,.:?!=+\\-*/%&|^~]+', 'punct'),
  rule('[<>]', 'punct'),
];

const SQL_RULES: Rule[] = [
  rule('--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', 'com'),
  rule("'(?:''|[^'])*'", 'str'),
  rule('\\$\\$|\\$[A-Za-z_]*\\$', 'kw'),
  rule('\\d+(?:\\.\\d+)?(?![\\w$])', 'num'),
  rule('"[^"]*"', 'plain'),
  rule('[A-Za-z_][\\w]*', classifySql),
  rule('\\s+', 'plain'),
  rule('[(),;.:=<>+\\-*/|!&\\[\\]]+', 'punct'),
];

const YAML_RULES: Rule[] = [
  rule('#[^\\n]*', 'com'),
  rule('\'[^\'\\n]*\'|"(?:\\\\.|[^"\\\\\\n])*"', 'str'),
  rule('[A-Za-z_][\\w.-]*(?=\\s*:(?:\\s|$))', 'prop', 'm'),
  rule('\\$\\{\\{[^}]*\\}\\}', 'deco'),
  rule('\\b(?:true|false|null)\\b', 'kw'),
  rule('\\d+(?:\\.\\d+)?\\b', 'num'),
  rule('[^\\s#\'"]+', 'plain'),
  rule('\\s+', 'plain'),
];

const JSON_RULES: Rule[] = [
  rule('"(?:\\\\.|[^"\\\\])*"(?=\\s*:)', 'prop'),
  rule('"(?:\\\\.|[^"\\\\])*"', 'str'),
  rule('-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?', 'num'),
  rule('\\b(?:true|false|null)\\b', 'kw'),
  rule('\\s+', 'plain'),
  rule('[{}[\\],:]', 'punct'),
];

const CSS_RULES: Rule[] = [
  rule('\\/\\*[\\s\\S]*?\\*\\/', 'com'),
  rule('\'[^\'\\n]*\'|"[^"\\n]*"', 'str'),
  rule('--[\\w-]+|[a-z-]+(?=\\s*:)', 'prop'),
  rule('#[0-9a-fA-F]{3,8}\\b|\\d+(?:\\.\\d+)?(?:px|rem|em|ms|s|%|deg|vh|vw)?', 'num'),
  rule('@[\\w-]+', 'kw'),
  rule('[.#]?[A-Za-z_][\\w-]*', 'plain'),
  rule('\\s+', 'plain'),
  rule('[{}();:,>+~*=\\[\\]]', 'punct'),
];

const BASH_RULES: Rule[] = [
  rule('#[^\\n]*', 'com'),
  rule('\'[^\']*\'|"(?:\\\\.|[^"\\\\])*"', 'str'),
  rule('\\$\\{?[A-Za-z_]\\w*\\}?', 'deco'),
  rule('(?<=^|\\n|&&\\s|\\|\\s)[a-z][\\w-]*', 'fn'),
  rule('--?[\\w-]+', 'prop'),
  rule('[^\\s\'"#$]+', 'plain'),
  rule('\\s+', 'plain'),
];

const MD_RULES: Rule[] = [
  rule('^#{1,6} [^\\n]*', 'kw', 'm'),
  rule('`[^`\\n]+`', 'str'),
  rule('\\*\\*[^*\\n]+\\*\\*', 'type'),
  rule('\\[[^\\]\\n]+\\]\\([^)\\n]+\\)', 'fn'),
  rule('^\\s*(?:[-*]|\\d+\\.) ', 'punct', 'm'),
  rule('[^`*[\\n#-]+|[\\s\\S]', 'plain'),
];

const RULES: Record<CodeLang, Rule[]> = {
  ts: TS_RULES,
  tsx: TS_RULES,
  sql: SQL_RULES,
  yaml: YAML_RULES,
  json: JSON_RULES,
  css: CSS_RULES,
  bash: BASH_RULES,
  md: MD_RULES,
};

export function tokenize(source: string, lang: CodeLang): Token[] {
  const rules = RULES[lang];
  const tokens: Token[] = [];
  let previous: Token | undefined;
  const push = (type: TokenType, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type && (type === 'plain' || type === 'punct')) last.text += text;
    else tokens.push({ type, text });
    if (text.trim()) previous = tokens[tokens.length - 1];
  };
  let index = 0;
  while (index < source.length) {
    let matched = false;
    for (const { re, type } of rules) {
      re.lastIndex = index;
      const match = re.exec(source);
      if (!match || match[0].length === 0) continue;
      const end = index + match[0].length;
      push(typeof type === 'function' ? type(match[0], source, end, previous, lang) : type, match[0]);
      index = end;
      matched = true;
      break;
    }
    if (!matched) {
      push('plain', source[index]!);
      index += 1;
    }
  }
  return tokens;
}

/** Splits tokens at line breaks so each line can be rendered (and numbered) on its own. */
export function toLines(tokens: readonly Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ type: token.type, text: part });
    });
  }
  return lines;
}

export function langFromPath(path: string): CodeLang {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'tsx':
      return 'tsx';
    case 'sql':
      return 'sql';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
      return 'bash';
    case 'md':
      return 'md';
    default:
      return 'ts';
  }
}
