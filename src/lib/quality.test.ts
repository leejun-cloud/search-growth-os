// 실행: npm test  (node:test — 새 의존성 없음)
//
// 이 파일이 지키려는 것은 임계값 자체가 아니라 **임계값이 겨냥한 상황**이다.
// 숫자는 실측으로 바뀔 수 있지만, "리라이트 중복은 잡고 정상 형제는 통과한다"
// 는 유지돼야 한다.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keywordDensity, similarity, titleTokens, tokenWeights, topicSimilarity } from "./quality";

// ---------- 본문 유사도 / 검색어 밀도 (PR #2, onyouk0327-coder) ----------

describe("similarity", () => {
  it("동일 문서는 1", () => {
    assert.equal(similarity("same text", "same text"), 1);
  });

  it("완전히 다른 문서는 0", () => {
    assert.equal(similarity("abcdefg", "xyz123"), 0);
  });

  it("일부만 겹치면 0과 1 사이", () => {
    const sim = similarity("daejeon companion cost", "busan companion cost");
    assert.ok(sim > 0 && sim < 1);
  });

  it("지역명만 바꾸면 유사도가 45% 기준을 넘는다 — Template Family 검사가 이걸 잡아야 하는 이유", () => {
    const base = "our companion service helps elderly visit hospitals in daejeon";
    const s = similarity(base, base.replace("daejeon", "busan"));
    assert.ok(s > 0.45);
  });
});

describe("keywordDensity", () => {
  it("검색어가 없으면 0", () => {
    assert.equal(keywordDensity("companion service", "cost"), 0);
  });

  it("검색어로 도배되면 1에 가까움", () => {
    assert.equal(keywordDensity("costcostcost", "cost"), 1);
  });

  it("자연스러운 밀도는 5% 미만", () => {
    const filler = "our hospital visit assistance in the city area is available every weekday from nine to six. ";
    const body = filler.repeat(16) + "our companion service helps you book easily.";
    const d = keywordDensity(body, "companion");
    assert.ok(d < 0.05);
  });
});

/** 실제 사이트에서 가져온 제목들. 24편 블로그의 축약 말뭉치. */
const CORPUS = [
  "Beat the Heat: The Ultimate Summer Travel Guide to South Korea for Indian Adventurers",
  "Beat the Heat: The Ultimate Summer Travel Guide to South Korea for Indian Travelers",
  "Beat the Heat: The Ultimate Summer Travel Alert and Guide to South Korea",
  "Must-Buy in Korea: The Ultimate Shopping Guide for Indian Travelers",
  "The Ultimate 'Must-Buy in Korea' Shopping Guide for Indian Travelers",
  "KAIST: Where India's Future Innovators Meet Korea's Tech Dreams",
  "Sizzle, Spice, and Sweet Snow: The Ultimate Korean Food Guide for Indian Travelers",
  "Timeless Alleys of Bukchon: A Curated Heritage Walk Through Seoul's Historic Heart",
  "Navigating South Korea: The Ultimate Guide for Indian Students",
  "Chasing Colors and Coastlines: 5 Spectacular Summer Destinations in Korea",
];
const W = tokenWeights(CORPUS);
const topic = (a: string, b: string) => topicSimilarity(a, b, W);

describe("주제 중복 — 다시 쓴 같은 글", () => {
  it("제목이 사실상 같은 글을 잡는다", () => {
    // 끝 단어 하나(Adventurers/Travelers)만 다르다.
    assert.ok(topic(CORPUS[0]!, CORPUS[1]!) >= 0.5, "여름 가이드 중복");
    // 어순만 다르고 같다.
    assert.ok(topic(CORPUS[3]!, CORPUS[4]!) >= 0.5, "쇼핑 가이드 중복");
  });

  it("주제가 다른 글은 통과시킨다", () => {
    assert.ok(topic(CORPUS[5]!, CORPUS[6]!) < 0.5, "KAIST vs 음식");
    assert.ok(topic(CORPUS[6]!, CORPUS[7]!) < 0.5, "음식 vs 북촌");
  });

  it("흔한 단어만 겹치면 중복으로 보지 않는다", () => {
    // "Ultimate / Guide / Indian / Travelers" 는 말뭉치 전체에 흔하다.
    // 이것만 겹치는 두 글은 서로 다른 주제다.
    assert.ok(topic(CORPUS[6]!, CORPUS[8]!) < 0.5, "흔한 단어만 공유");
  });

  it("본문 셔글로는 이 중복을 못 잡는다 — 그래서 이 검사가 필요하다", () => {
    // 같은 내용을 다른 문장으로 쓰면 문자 5-gram 은 거의 안 겹친다.
    const a = "Korean summer is humid. Pack light cotton and carry a folding umbrella.";
    const b = "The humidity in Korea peaks in summer. Bring breathable fabrics and a compact umbrella.";
    assert.ok(similarity(a, b) < 0.6, "셔글은 리라이트를 못 잡는다");
    // topic() 은 위 CORPUS 가중치를 쓰는 헬퍼라, 여기서는 별도 말뭉치로 직접 잰다.
    const small = ["Korean Summer Packing Guide", "Korean Summer Packing Tips", "KAIST Campus Visit", "Busan Beaches"];
    const sw = tokenWeights(small);
    assert.ok(topicSimilarity(small[0]!, small[1]!, sw) >= 0.5, "제목으로는 잡힌다");
  });
});

describe("제목 토큰", () => {
  it("두 글자 미만과 기호를 버린다", () => {
    assert.deepEqual(titleTokens("A K-Pop Guide!"), ["pop", "guide"]);
  });

  it("한글도 같은 방식으로 자른다", () => {
    assert.deepEqual(titleTokens("청주 주성교회 예배 안내"), ["청주", "주성교회", "예배", "안내"]);
  });
});

describe("가중치", () => {
  it("모든 문서에 나오는 단어는 0이 된다", () => {
    const w = tokenWeights(["korea guide", "korea tips", "korea food"]);
    assert.equal(w.get("korea"), 0);
    assert.ok((w.get("guide") ?? 0) > 0);
  });
});
