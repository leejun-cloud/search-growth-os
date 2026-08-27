"use client";

// 공용 UI 조각 — 서버 액션 실행 중 로딩 표시가 핵심 (AI 호출은 수십 초 걸릴 수 있음)

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "실행 중…",
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const styles =
    variant === "primary"
      ? "bg-zinc-900 text-white hover:bg-zinc-700"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-500"
      : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${styles}`}
    >
      {pending ? `⏳ ${pendingText}` : children}
    </button>
  );
}

export function Badge({ tone, children }: { tone: "green" | "yellow" | "red" | "gray" | "blue"; children: React.ReactNode }) {
  const map = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}
