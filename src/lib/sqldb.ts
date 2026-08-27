// SQL 접속 계층.
// - DATABASE_URL이 있으면 → Neon(PostgreSQL 클라우드)에 접속 (pg 드라이버)
// - 없으면 → PGlite(파일로 저장되는 내장형 PostgreSQL)로 로컬 실행
// 두 경우 모두 같은 SQL이 실행된다. 코드의 SQL 문장이 그대로 학습 자료다.

import { promises as fs } from "fs";
import path from "path";

export interface QueryResult<R = Record<string, unknown>> {
  rows: R[];
}

interface SqlClient {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
}

// Next.js 개발서버는 모듈을 여러 번 로드할 수 있어 globalThis에 연결을 캐시한다
// (PGlite는 같은 데이터 폴더에 이중 접속하면 잠금 충돌이 난다)
const g = globalThis as unknown as { __sgoSqlClient?: Promise<SqlClient> };

async function createClient(): Promise<SqlClient> {
  const url = process.env.DATABASE_URL;
  let client: SqlClient;

  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      // Neon은 SSL 필수. 로컬 Postgres 주소면 SSL 없이 접속.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    client = {
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return { rows: r.rows };
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = path.join(process.cwd(), "data", "pglite");
    await fs.mkdir(dataDir, { recursive: true });
    const lite = new PGlite(dataDir);
    client = {
      async query(sql, params) {
        const r = await lite.query(sql, params as unknown[]);
        return { rows: r.rows as Record<string, unknown>[] } as QueryResult<never>;
      },
    };
  }

  // 스키마 적용 (CREATE TABLE IF NOT EXISTS라 여러 번 실행해도 안전)
  const schemaPath = path.join(process.cwd(), "src", "lib", "sql", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf-8");
  for (const stmt of splitStatements(schema)) {
    await client.query(stmt);
  }
  return client;
}

/** 세미콜론 기준으로 SQL 문장 분리 (주석 제거) */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sql<R = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  if (!g.__sgoSqlClient) g.__sgoSqlClient = createClient();
  const client = await g.__sgoSqlClient;
  return client.query<R>(text, params);
}

// ---------- 행(snake_case) ↔ 객체(camelCase) 변환 ----------

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

/** DB 행 → 앱 객체. Date는 ISO 문자열로, JSONB는 그대로. */
export function rowToObj<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v instanceof Date ? v.toISOString() : v ?? undefined;
  }
  return out as T;
}

/**
 * 범용 UPSERT — INSERT 하되 id가 이미 있으면 UPDATE.
 * [SQL 학습 노트] ON CONFLICT (id) DO UPDATE: id 충돌 시 지정한 칸들을 새 값으로 갱신
 */
export async function upsert(table: string, obj: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  const cols = entries.map(([k]) => camelToSnake(k));
  const params = entries.map(([, v]) =>
    v !== null && typeof v === "object" ? JSON.stringify(v) : v
  );
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updates = cols
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  const text = `
    INSERT INTO ${table} (${cols.join(", ")})
    VALUES (${placeholders.join(", ")})
    ON CONFLICT (id) DO UPDATE SET ${updates}
  `;
  await sql(text, params);
}
