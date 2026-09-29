import Link from 'next/link';import {notFound} from 'next/navigation';import {db} from '@/lib/db';
const TABS=[{href:'',label:'개요'},{href:'/coverage',label:'적용 현황'},{href:'/operations',label:'성과 검증'},{href:'/knowledge',label:'사업 지식'},{href:'/opportunities',label:'검색기회'},{href:'/pages',label:'페이지'},{href:'/analytics',label:'성과'},{href:'/growth',label:'Growth'}];
export default async function SiteLayout({children,params}:{children:React.ReactNode;params:Promise<{siteId:string}>}){
 const {siteId}=await params;const site=await db.sites.get(siteId);if(!site)notFound();
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold">{site.name}</h1><a href={site.domain} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">{site.domain}</a></div><nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 text-sm" aria-label="사이트 운영 메뉴">{TABS.map(t=><Link key={t.href} href={`/sites/${siteId}${t.href}`} className="whitespace-nowrap rounded-t-md px-4 py-2 font-medium text-zinc-600 hover:bg-white hover:text-zinc-900">{t.label}</Link>)}</nav>{children}</div>;
}
