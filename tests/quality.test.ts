import { describe, expect, it } from "vitest";
import { keywordDensity, similarity } from "../src/lib/quality";

describe("similarity", () => {
  it("identical", () => {
    expect(similarity("same text", "same text")).toBe(1);
  });

  it("different", () => {
    expect(similarity("abcdefg", "xyz123")).toBe(0);
  });

  it("partial", () => {
    const sim = similarity("daejeon companion cost", "busan companion cost");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("location swap above gate", () => {
    const base = "our companion service helps elderly visit hospitals in daejeon";
    const s = similarity(base, base.replace("daejeon", "busan"));
    expect(s).toBeGreaterThan(0.45);
  });
});

describe("keywordDensity", () => {
  it("no keyword", () => {
    expect(keywordDensity("companion service", "cost")).toBe(0);
  });

  it("full overlap", () => {
    expect(keywordDensity("costcostcost", "cost")).toBe(1);
  });

  it("low density", () => {
    const filler = "our hospital visit assistance in the city area is available every weekday from nine to six. ";
    const body = filler.repeat(16) + "our companion service helps you book easily.";
    const d = keywordDensity(body, "companion");
    expect(d).toBeLessThan(0.05);
  });
});
