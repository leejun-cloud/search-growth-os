// Isolated CI database. Only a clearly labelled editing fixture; never invented traffic metrics.
import {db} from '../src/lib/db';import {runOperations} from '../src/lib/growth-operations';import {promises as fs} from 'node:fs';import type {Site,PageDoc} from '../src/lib/types';
async function main(){
 const id='verification-demo',at=new Date().toISOString();const site:Site={id,name:'드림브릿지 · 실제 URL 검증',domain:'https://db.nolgong.app',platform:'nextjs',primaryLanguage:'ko',targetRegions:[],primaryServices:[],audiences:[],conversionGoals:['문의'],autoPublishAllowed:false,thresholds:{autoDraft:80,reviewQueue:65,enrich:50,quality:{minBodyChars:800,thinBlockChars:500,maxSimilarity:0.6,maxFamilySimilarity:0.45,maxKeywordDensity:0.05}},pilotCriteria:{weeks:8,minIndexRate:70,minQueryCount:50},createdAt:at};
 await db.sites.put(site);
 const draft:PageDoc={id:'verification-draft',siteId:id,pageType:'guide',slug:'verification-draft',status:'draft',targetQuery:'편집 기능 검증',primaryIntent:'informational',title:'편집 회귀 검사용 초안 — 실제 콘텐츠 아님',seoTitle:'편집 회귀 검사용 초안',metaDescription:'이 초안은 CI의 편집 및 저장 동작 확인만을 위한 테스트 데이터이며 실제 고객이나 서비스의 실적을 나타내지 않습니다.',h1:'편집 회귀 검사용 초안',summary:'변경 전 테스트 답변',body:'## 테스트 문서\n\n이 문서는 자동화된 편집·저장·렌더링 회귀 검사용 초안입니다. 실제 서비스 콘텐츠나 방문 성과가 아닙니다.',faq:[],sources:[],internalLinks:[],indexPolicy:'noindex',createdAt:at,updatedAt:at};
 await db.pages.put(draft);
 const report=await runOperations(id,'/services/ai-website');await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/live-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({verification:report.verification.status,checks:report.verification.checks,errors:report.errors}));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
