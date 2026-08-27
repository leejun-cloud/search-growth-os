// SQL 연습/조회 도구.
// 사용법:  npm run sql -- "SELECT id, name FROM sites"
// DATABASE_URL이 있으면 Neon, 없으면 로컬 PGlite에 실행된다.

import { sql } from "../src/lib/sqldb";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.log('사용법: npm run sql -- "SELECT * FROM sites"');
    console.log("\n테이블 목록 보기:");
    console.log('  npm run sql -- "SELECT tablename FROM pg_tables WHERE schemaname = \'public\'"');
    process.exit(0);
  }
  const r = await sql(query);
  if (r.rows.length === 0) {
    console.log("(결과 없음 — 실행은 성공)");
  } else {
    console.table(r.rows);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("SQL 오류:", e.message);
  process.exit(1);
});
