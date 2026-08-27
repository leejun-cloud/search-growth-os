// 사업 지식 입력 (Business Knowledge Seeder) + Entity Graph

import { db } from "@/lib/db";
import { deleteEntityAction, saveKnowledgeAction, seedEntitiesAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const field = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
const label = "mb-1 block text-sm font-medium";

const TYPE_LABEL: Record<string, string> = {
  service: "서비스", audience: "고객", problem: "문제", region: "지역", institution: "기관",
  question: "질문", intent: "의도", topic: "주제", case: "사례", datapoint: "데이터",
};

export default async function KnowledgePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [profile, entities] = await Promise.all([
    db.businessProfiles.getBySite(siteId),
    db.entities.bySite(siteId),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">사업 지식 입력</h2>
        <p className="mb-4 text-sm text-zinc-500">
          여기 입력된 내용만 콘텐츠의 사실 근거로 사용됩니다. 구체적일수록 페이지 품질이 올라갑니다.
        </p>
        <form action={saveKnowledgeAction.bind(null, siteId)} className="space-y-3">
          <div><label className={label}>업종</label>
            <input name="industry" defaultValue={profile?.industry} className={field} placeholder="AI 홈페이지 제작 및 업무 자동화" /></div>
          <div><label className={label}>서비스 (상세)</label>
            <textarea name="services" defaultValue={profile?.services} rows={3} className={field} placeholder="AI 홈페이지 제작: 2주 내 제작, 반응형..." /></div>
          <div><label className={label}>서비스 지역</label>
            <input name="regions" defaultValue={profile?.regions} className={field} placeholder="대전 기반, 전국 온라인 대응" /></div>
          <div><label className={label}>고객 유형</label>
            <input name="customerTypes" defaultValue={profile?.customerTypes} className={field} placeholder="중소기업, 병원, 교육기관, NGO" /></div>
          <div><label className={label}>가격/요금</label>
            <textarea name="pricing" defaultValue={profile?.pricing} rows={2} className={field} placeholder="홈페이지 제작 OO만원부터, 월 유지보수 OO만원" /></div>
          <div><label className={label}>FAQ (자주 받는 질문과 답)</label>
            <textarea name="faq" defaultValue={profile?.faq} rows={4} className={field} placeholder="Q: 제작 기간은? A: 평균 2주..." /></div>
          <div><label className={label}>회사 소개</label>
            <textarea name="companyIntro" defaultValue={profile?.companyIntro} rows={2} className={field} /></div>
          <div><label className={label}>서비스 프로세스</label>
            <textarea name="process" defaultValue={profile?.process} rows={2} className={field} placeholder="상담 → 기획 → 제작 → 검수 → 오픈" /></div>
          <div><label className={label}>기타 (실제 사례, 데이터 등)</label>
            <textarea name="extraNotes" defaultValue={profile?.extraNotes} rows={2} className={field} /></div>
          <SubmitButton>저장</SubmitButton>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Entity Graph ({entities.length})</h2>
            <p className="text-sm text-zinc-500">사업 지식에서 추출된 검색 단위 — 페이지 생성과 내부링크의 기반</p>
          </div>
          <form action={seedEntitiesAction.bind(null, siteId)}>
            <SubmitButton pendingText="AI 추출 중…" variant="secondary">
              {entities.length ? "Entity 추가 추출" : "Entity 추출 (AI)"}
            </SubmitButton>
          </form>
        </div>
        {entities.length === 0 ? (
          <p className="text-sm text-zinc-400">사업 지식을 저장한 뒤 &quot;Entity 추출&quot;을 실행하세요.</p>
        ) : (
          <ul className="max-h-[600px] space-y-1.5 overflow-y-auto">
            {entities.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm">
                <Badge tone="blue">{TYPE_LABEL[e.type] ?? e.type}</Badge>
                <span className="flex-1">
                  <span className="font-medium">{e.name}</span>
                  {e.description && <span className="ml-2 text-xs text-zinc-500">{e.description}</span>}
                  {e.data && <span className="ml-2 text-xs text-green-700">{JSON.stringify(e.data)}</span>}
                </span>
                <form action={deleteEntityAction.bind(null, siteId, e.id)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600">삭제</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
