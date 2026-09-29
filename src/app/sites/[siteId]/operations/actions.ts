'use server';
import {revalidatePath} from 'next/cache';import {redirect} from 'next/navigation';
import {requireOperator,unlockOperator} from '@/lib/operator-access';
import {db} from '@/lib/db';import {newId,nowIso} from '@/lib/types';
import {saveEvidence,listEvidence} from '@/lib/growth-store';
import {runOperations,latestOperation,validateCitation} from '@/lib/growth-operations';import type {CitationObservation,ChangeExperiment} from '@/lib/growth-operations';
import {runQualityGate} from '@/lib/quality';import {runGrowthAgent} from '@/lib/growth';import {submitIndexNow} from '@/lib/indexnow';
const text=(data:FormData,key:string,max=5000)=>String(data.get(key)??'').trim().slice(0,max);
const refresh=(id:string)=>revalidatePath(`/sites/${id}/operations`);
export async function unlockAction(siteId:string,form:FormData){await unlockOperator(text(form,'password',1000));redirect(`/sites/${siteId}/operations`);}
export async function operateAction(siteId:string,form:FormData){await requireOperator();await runOperations(siteId,text(form,'target',2000)||'/');await runGrowthAgent(siteId);refresh(siteId);}
export async function citationAction(siteId:string,form:FormData){
 await requireOperator();const site=await db.sites.get(siteId);if(!site)throw new Error('site not found');
 const payload=validateCitation(site.domain,{question:text(form,'question',500),engine:text(form,'engine',100),result:text(form,'result') as CitationObservation['result'],citedUrl:text(form,'citedUrl',2000)||null,evidenceUrl:text(form,'evidenceUrl',2000),excerpt:text(form,'excerpt'),observedAt:text(form,'observedAt',50),method:'operator_recorded'});
 await saveEvidence({id:newId('citation'),siteId,kind:'citation',target:payload.question,createdAt:nowIso(),payload});refresh(siteId);
}
export async function experimentAction(siteId:string,form:FormData){
 await requireOperator();const site=await db.sites.get(siteId),baseline=await latestOperation(siteId);if(!site||!baseline?.payload.search)throw new Error('실측 기준선을 먼저 수집하세요.');
 const url=new URL(text(form,'target',2000)||'/',site.domain);if(url.origin!==new URL(site.domain).origin)throw new Error('대상 사이트가 다릅니다.');
 const proof=new URL(text(form,'changeProof',2000));if(proof.protocol!=='https:')throw new Error('변경 커밋/배포 증거 HTTPS URL을 입력하세요.');
 const name=text(form,'name',150),hypothesis=text(form,'hypothesis',1000);if(!name||!hypothesis)throw new Error('변경 내용과 가설을 입력하세요.');
 const payload:ChangeExperiment={name,url:url.href,hypothesis,changeProof:proof.href,appliedAt:nowIso(),baseline:baseline.payload,note:'운영자가 적용을 확인한 변경 기록. 전후 비교만으로 인과효과를 주장하지 않습니다.'};
 await saveEvidence({id:newId('experiment'),siteId,kind:'experiment',target:url.href,createdAt:nowIso(),payload});refresh(siteId);
}
export async function contentAction(siteId:string,form:FormData){
 await requireOperator();const page=await db.pages.get(text(form,'pageId',150));if(!page||page.siteId!==siteId)throw new Error('page not found for site');
 const answer=text(form,'directAnswer',2000),reviewer=text(form,'reviewer',150),asOf=text(form,'dataAsOf',10);
 if(!answer||!reviewer||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||asOf>nowIso().slice(0,10)||new Date(asOf).toISOString().slice(0,10)!==asOf)throw new Error('직답·검토자·실제 자료 기준일을 입력하세요.');
 const sources=text(form,'sources').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 for(const source of sources){const u=new URL(source);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('출처는 HTTP(S) URL이어야 합니다.');}
 const at=nowIso();await saveEvidence({id:newId('version'),siteId,kind:'page_version',target:page.id,createdAt:at,payload:page});
 await db.pages.put({...page,summary:answer,sources,status:'review',updatedAt:at});
 await saveEvidence({id:newId('profile'),siteId,kind:'content_profile',target:page.id,createdAt:at,payload:{directAnswer:answer,dataAsOf:asOf,reviewer,lastReviewedAt:at,sources}});
 await runQualityGate(page.id);refresh(siteId);revalidatePath(`/sites/${siteId}/pages/${page.id}`);
}
export async function indexNowAction(siteId:string){
 await requireOperator();const site=await db.sites.get(siteId),operation=await latestOperation(siteId);
 if(!site||!operation||operation.payload.verification.status!=='verified'||Date.parse(operation.createdAt)<Date.now()-86400000)throw new Error('24시간 이내 실제 URL 검증 통과가 먼저 필요합니다.');
 const result=await submitIndexNow(site,operation.payload.verification.url);
 await saveEvidence({id:newId('indexnow'),siteId,kind:'indexnow',target:operation.payload.verification.url,createdAt:nowIso(),payload:result});refresh(siteId);
}
