// AI Provider 계층 — claude-cli(기본) / codex-cli / mock
// API 키 없이 로그인된 CLI를 서브프로세스로 호출한다.
// 나중에 API 직접 호출 provider를 추가해도 인터페이스는 동일.

import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

export interface AIProvider {
  name: string;
  generateText(prompt: string): Promise<string>;
}

const CLI_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 10 * 1024 * 1024;

class ClaudeCliProvider implements AIProvider {
  name = "claude-cli";
  async generateText(prompt: string): Promise<string> {
    const { stdout } = await execFileP(
      "claude",
      ["-p", prompt, "--output-format", "text"],
      { timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_BUFFER }
    );
    return stdout.trim();
  }
}

class CodexCliProvider implements AIProvider {
  name = "codex-cli";
  async generateText(prompt: string): Promise<string> {
    const { stdout } = await execFileP(
      "codex",
      ["exec", prompt],
      { timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_BUFFER }
    );
    return stdout.trim();
  }
}

/** 키/CLI 없이 파이프라인을 검증하기 위한 목업 — 프롬프트에 포함된 JSON 스켈레톤을 그대로 돌려준다. */
class MockProvider implements AIProvider {
  name = "mock";
  async generateText(prompt: string): Promise<string> {
    const m = prompt.match(/<<<MOCK_FALLBACK>>>([\s\S]*?)<<<\/MOCK_FALLBACK>>>/);
    if (m) return m[1].trim();
    return "{}";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** OpenRouter API를 직접 호출하는 프로바이더 — OPENROUTER_API_KEY 환경변수 필요. */
class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  async generateText(prompt: string): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY 환경변수가 필요합니다.");
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter API 오류: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter 응답에 content가 없습니다.");
    return content.trim();
  }
}

let provider: AIProvider | null = null;

export function getAI(): AIProvider {
  if (provider) return provider;
  const name = process.env.SGO_AI ?? "claude-cli";
  provider =
    name === "openrouter" ? new OpenRouterProvider()
    : name === "codex-cli" ? new CodexCliProvider()
    : name === "mock" ? new MockProvider()
    : new ClaudeCliProvider();
  return provider;
}

/** 응답에서 JSON 블록을 추출해 파싱한다. 실패 시 1회 재시도. */
export async function generateJson<T>(prompt: string, retryOnce = true): Promise<T> {
  const ai = getAI();
  const raw = await ai.generateText(prompt);
  try {
    return extractJson<T>(raw);
  } catch (e) {
    if (!retryOnce) throw e;
    const retryPrompt = `${prompt}\n\n이전 응답이 유효한 JSON이 아니었다. 반드시 JSON만 출력하라. 마크다운 코드펜스, 설명 문장 금지.`;
    const raw2 = await ai.generateText(retryPrompt);
    return extractJson<T>(raw2);
  }
}

export function extractJson<T>(raw: string): T {
  // 코드펜스 제거
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  // 첫 { 또는 [ 부터 마지막 } 또는 ] 까지
  const start = Math.min(
    ...[candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0)
  );
  if (!isFinite(start)) throw new Error("응답에 JSON이 없습니다: " + raw.slice(0, 200));
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
