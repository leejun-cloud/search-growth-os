import type {Metadata} from 'next';import Link from 'next/link';import {notFound} from 'next/navigation';import {marked} from 'marked';
import {db} from '@/lib/db';import {contentProfile} from '@/lib/content-profile';
export const dynamic='force-dynamic';
type Props={params:Promise<{siteId:string;slug:string[]}>};
async function loadPage(siteId:string,slug:string[]){return db.pages.bySlug(siteId,slug.map(decodeURIComponent).join('/'));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {siteId,slug}=await params;const page=await loadPage(siteId,slug);if(!page)return {};const indexable=page.status==='published'&&page.indexPolicy==='index';return {title:page.seoTitle,description:page.metaDescription,alternates:{canonical:page.canonicalUrl},robots:{index:indexable,follow:indexable},openGraph:{title:page.seoTitle,description:page.metaDescription,type:'article'}};}
export default async function PublicPage({params}:Props){
 const {siteId,slug}=await params;const [page,site]=await Promise.all([loadPage(siteId,slug),db.sites.get(siteId)]);if(!page||!site)notFound();
 const profile=await contentProfile(siteId,page.id);const bodyHtml=await marked.parse(page.body);const preview=page.status!=='published';
 const sources=page.sources.filter(source=>{try{return ['https:','http:'].includes(new URL(source).protocol);}catch{return false;}});
 return <>{(page.schemaJsonld??[]).map((block,i)=><script key={i} type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(block).replace(/</g,'\\u003c')}}/>)}
 {preview&&<div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm">미리보기 — 대상 사이트 게시 검증 전입니다. 검색 제외(noindex).</div>}
 <article className="mx-auto max-w-2xl"><nav className="mb-4 text-xs text-zinc-500"><Link href={site.domain}>{site.name}</Link> › {page.slug.split('/').slice(0,-1).join(' › ')}</nav>
 <h1 className="text-3xl font-bold leading-tight">{page.h1}</h1>{page.summary&&<p className="mt-4 rounded-lg bg-zinc-50 p-4 text-lg text-zinc-700" data-direct-answer>{page.summary}</p>}
 {profile&&<p className="mt-3 text-xs text-zinc-500">자료 기준일: <time dateTime={profile.dataAsOf} data-asof={profile.dataAsOf}>{profile.dataAsOf}</time> · 검토: {profile.reviewer} · 검토일: <time dateTime={profile.lastReviewedAt}>{profile.lastReviewedAt.slice(0,10)}</time></p>}
 <div className="prose prose-zinc mt-8 max-w-none [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:my-3 [&_li]:my-1 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{__html:bodyHtml}}/>
 {page.faq.length>0&&<section className="mt-10"><h2 className="text-xl font-semibold">자주 묻는 질문</h2>{page.faq.map((f,i)=><div key={i} className="mt-4"><h3 className="font-semibold">{f.question}</h3><p className="mt-1 text-zinc-600">{f.answer}</p></div>)}</section>}
 {page.internalLinks.length>0&&<section className="mt-10 border-t pt-6"><h2 className="font-semibold">관련 페이지</h2><ul>{page.internalLinks.map(l=><li key={l.slug}><Link href={preview?`/p/${siteId}/${l.slug}`:new URL('/'+l.slug,site.domain).href} className="text-blue-700 hover:underline">{l.anchor}</Link></li>)}</ul></section>}
 {sources.length>0&&<section className="mt-8 border-t pt-4 text-xs text-zinc-500"><h2 className="font-semibold">확인한 출처</h2><ul className="mt-2 space-y-2">{sources.map(s=><li key={s}><a href={s} rel="noopener noreferrer" className="break-all text-blue-700">{s}</a></li>)}</ul></section>}
 </article></>;
}
