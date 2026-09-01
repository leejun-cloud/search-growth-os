import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/lib/analytics";

describe("parseCsv", () => {
  it("기본 CSV 파싱", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("따옴표 필드와 내부 쉼표 지원", () => {
    const rows = parseCsv('"hello, world",x\n"a ""quote""",y\n');
    expect(rows).toEqual([
      ["hello, world", "x"],
      ['a "quote"', "y"],
    ]);
  });

  it("BOM 제거", () => {
    const rows = parseCsv("\uFEFFa,b\n1,2\n");
    expect(rows[0][0]).toBe("a");
  });

  it("빈 줄 무시", () => {
    const rows = parseCsv("a,b\n\n1,2\n\n");
    expect(rows).toHaveLength(2);
  });
});