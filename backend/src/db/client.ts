import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const { Pool } = pg;

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  readonly driver: 'pg' | 'pglite';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export function createDbClient(databaseUrl?: string): DbClient {
  const rawUrl = (databaseUrl ?? process.env.DATABASE_URL ?? '').trim();

  if (rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://')) {
    const pool = new Pool({
      connectionString: rawUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    return {
      driver: 'pg',
      async query<T = Record<string, unknown>>(
        sql: string,
        params: unknown[] = []
      ): Promise<QueryResult<T>> {
        const res = await pool.query(sql, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rowCount ?? res.rows.length,
        };
      },
      async exec(sql: string): Promise<void> {
        await pool.query(sql);
      },
      async close(): Promise<void> {
        await pool.end();
      },
    };
  }

  let pgliteInstance: PGlite;
  if (rawUrl === ':memory:' || rawUrl === 'pglite://:memory:' || rawUrl === 'memory://') {
    pgliteInstance = new PGlite();
  } else {
    const dirRaw = rawUrl.startsWith('pglite://')
      ? rawUrl.slice('pglite://'.length).trim()
      : rawUrl || './postgres-data/local';

    if (!dirRaw || dirRaw === ':memory:') {
      pgliteInstance = new PGlite();
    } else {
      const resolvedDir = path.resolve(process.cwd(), dirRaw);
      mkdirSync(path.dirname(resolvedDir), { recursive: true });
      pgliteInstance = new PGlite(resolvedDir);
    }
  }

  return {
    driver: 'pglite',
    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = []
    ): Promise<QueryResult<T>> {
      const res = await pgliteInstance.query<T>(sql, params);
      return {
        rows: res.rows,
        rowCount: res.affectedRows ?? res.rows.length,
      };
    },
    async exec(sql: string): Promise<void> {
      await pgliteInstance.exec(sql);
    },
    async close(): Promise<void> {
      await pgliteInstance.close();
    },
  };
}

export function toIso(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? val : parsed.toISOString();
  }
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  return new Date().toISOString();
}

export function toIsoOrNull(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  return toIso(val);
}

export function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export function parseJsonColumn<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) {
    return fallback;
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof val === 'object') {
    return val as T;
  }
  return fallback;
}
