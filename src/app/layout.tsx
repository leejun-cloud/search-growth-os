import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Search Growth OS",
  description: "검색 유입을 만들어내는 성장 시스템 — 멀티테넌트 SEO/GEO 엔진",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              🔎 Search Growth OS
            </Link>
            <span className="text-xs text-zinc-500">
              검색기회 발견 → 채점 → 근거 확보 → 품질 통과 페이지만 발행 → 성과 피드백
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
