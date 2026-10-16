/** Typed access to scripts/tech-manifest.ts output (regenerated on every build). */
import data from './manifest.json';

export interface EndpointFact {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: 'public' | 'user' | 'staff';
  tag: string;
  summary: string;
  permission: string | null;
  rateLimit: string | null;
  cacheSeconds: number | null;
  returns: string | null;
}

export interface ColumnFact {
  name: string;
  type: string;
  pk: boolean;
  fk: string | null;
  notNull: boolean;
  note: string | null;
}

export type Domain = 'identity' | 'cases' | 'money' | 'operations';

export interface TableFact {
  name: string;
  domain: Domain;
  note: string | null;
  columns: ColumnFact[];
  checks: number;
}

export interface PackageFact {
  name: string;
  dir: string;
  description: string;
  workspaceDeps: string[];
  sourceFiles: number;
  sourceLines: number;
  testFiles: number;
}

export interface VerifiedRun {
  at: string;
  node: string;
  postgres: string | null;
  suites: Array<{ package: string; tests: number; pass: number; fail: number; skipped: number; durationMs: number }>;
  total: number;
  failed: number;
}

export interface TechManifest {
  generatedAt: string;
  endpoints: EndpointFact[];
  schema: {
    tables: TableFact[];
    views: Array<{ name: string; note: string | null }>;
    enums: number;
    indexes: number;
    triggers: number;
    functions: number;
    lines: number;
  };
  packages: PackageFact[];
  verified: VerifiedRun | null;
}

export const manifest = data as unknown as TechManifest;
