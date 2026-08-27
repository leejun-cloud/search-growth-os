import { createSiteAction } from "@/app/actions";
import { SubmitButton } from "@/components/ui";

const field = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

export default function NewSitePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">사이트 등록</h1>
      <form action={createSiteAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">사이트 이름 *</label>
          <input name="name" required className={field} placeholder="놀공 드림브릿지" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">도메인 *</label>
          <input name="domain" required className={field} placeholder="https://db.nolgong.app" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">플랫폼</label>
          <select name="platform" className={field} defaultValue="nextjs">
            <option value="nextjs">Next.js</option>
            <option value="wordpress">WordPress</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">주요 서비스 (쉼표로 구분)</label>
          <input name="primaryServices" className={field} placeholder="AI 홈페이지 제작, AI 상담봇, 업무 자동화" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">대상 지역 (쉼표로 구분)</label>
          <input name="targetRegions" className={field} placeholder="대전, 전국" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">전환 목표 (쉼표로 구분)</label>
          <input name="conversionGoals" className={field} placeholder="상담 문의, 견적 요청" />
        </div>
        <SubmitButton>등록</SubmitButton>
      </form>
    </div>
  );
}
