// PR #2 (onyouk0327-coder) — node:test 방식으로 변환

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./analytics";

describe("parseCsv", () => {
  it("기본 CSV 파싱", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    assert.deepEqual(rows, [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("따옴표 필드와 내부 쉼표 지원", () => {
    const rows = parseCsv('"hello, world",x\n"a ""quote""",y\n');
    assert.deepEqual(rows, [
      ["hello, world", "x"],
      ['a "quote"', "y"],
    ]);
  });

  it("BOM 제거", () => {
    const rows = parseCsv("﻿a,b\n1,2\n");
    assert.equal(rows[0][0], "a");
  });

  it("빈 줄 무시", () => {
    const rows = parseCsv("a,b\n\n1,2\n\n");
    assert.equal(rows.length, 2);
  });
});
