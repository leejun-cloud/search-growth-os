import { db } from './db';import {newId,nowIso} from './types';
import {saveEvidence,listEvidence} from './growth-store';
import {verifyLivePage} from './live-verification';import type {LiveReport} from './live-verification';
import {gscConfig,getGoogleReadToken,readGscReport,persistGscReport} from './searchconsole';import type {GscReport} from './searchconsole';
import {readOrganicAnalytics} from './organic-analytics';import type {OrganicReport} from './organic-analytics';
export interface OperationReport {siteId:string;checkedAt:string;verification:LiveReport;search:GscReport|null;analytics:OrganicReport|null;errors:string[];businessSuccessVerified:false}
export async function runOperations(siteId:string,target='/'):Promise<OperationReport>{
 const site=await db.sites.get(siteId);if(!site)throw new Error('site not found');
 const started=nowIso();await saveEvidence({id:newId('run'),siteId,kind:'operation_start',target,createdAt:started,payload:{status:'started'}});
 const report:OperationReport={siteId,checkedAt:started,verification:await verifyLivePage(site.domain,target),search:null,analytics:null,errors:[],businessSuccessVerified:false};
 let cfg;try{cfg=gscConfig(site);}catch(error){report.errors.push('GSC 설정 오류: '+String(error).slice(0,250));}
 if(cfg){
  try{const token=await getGoogleReadToken(cfg,fetch,true);report.search=await readGscReport(site,cfg,token);await persistGscReport(siteId,report.search);
   try{report.analytics=await readOrganicAnalytics(site,token,{current:report.search.current.period,previous:report.search.previous.period});}catch(error){report.errors.push('GA4: '+String(error).slice(0,250));}
  }catch(error){report.errors.push('GSC: '+String(error).slice(0,250));}
 }else report.errors.push('GSC 읽기 권한/자격증명이 설정되지 않았습니다. 방문 0이나 성공으로 판정하지 않습니다.');
 await saveEvidence({id:newId('verify'),siteId,kind:'verification',target:report.verification.url,createdAt:report.verification.checkedAt,payload:report.verification});
 await saveEvidence({id:newId('operation'),siteId,kind:'operation',target:report.verification.url,createdAt:nowIso(),payload:report});return report;
}
export interface ChangeExperiment {name:string;url:string;hypothesis:string;changeProof:string;appliedAt:string;baseline:OperationReport;note:string}
export function experimentComparison(experiment:ChangeExperiment,current:OperationReport|null){
 const before=experiment.baseline.search,after=current?.search;
 if(!before||!after)return {status:'측정 자료 부족',clicks:null,sessions:null};
 const periodDays=(p:{startDate:string;endDate:string})=>Math.round((Date.parse(p.endDate)-Date.parse(p.startDate))/86400000)+1;
 const sameScope=before.site===after.site&&before.property===after.property;
 const ready=after.current.period.startDate>experiment.appliedAt.slice(0,10)&&before.current.period.endDate<=experiment.appliedAt.slice(0,10)&&periodDays(before.current.period)===periodDays(after.current.period);
 if(!sameScope||!ready)return {status:'비교 가능한 변경 후 기간 대기',clicks:null,sessions:null};
 const change=(a:number|null|undefined,b:number|null|undefined)=>typeof a==='number'&&typeof b==='number'?{before:b,after:a,delta:a-b,percent:b?(a-b)/b*100:null}:null;
 const sessions=current?.analytics?.propertyId===experiment.baseline.analytics?.propertyId&&current?.analytics?.status==='observed'&&experiment.baseline.analytics?.status==='observed'
  ?change(current?.analytics?.sessions.current,experiment.baseline.analytics?.sessions.current):null;
 return {status:'전후 변화 관측 — 인과효과 입증 아님',clicks:change(after.current.totals?.clicks,before.current.totals?.clicks),sessions};
}
export interface CitationObservation {question:string;engine:string;result:'cited'|'mentioned'|'not_seen';citedUrl:string|null;evidenceUrl:string;excerpt:string;observedAt:string;method:'operator_recorded'}
export function validateCitation(siteDomain:string,input:CitationObservation):CitationObservation{
 if(!input.question.trim()||!input.engine.trim()||input.excerpt.trim().length<20||!['cited','mentioned','not_seen'].includes(input.result))throw new Error('질문·엔진·답변 발췌(20자 이상)·결과를 입력하세요.');
 const evidence=new URL(input.evidenceUrl);if(evidence.protocol!=='https:'||evidence.username||evidence.password)throw new Error('증거 URL은 HTTPS여야 합니다.');
 const when=Date.parse(input.observedAt);if(!Number.isFinite(when)||when>Date.now()+300000)throw new Error('실제 관측 시각을 입력하세요.');
 if(input.result==='cited'){
  if(!input.citedUrl)throw new Error('인용된 URL이 필요합니다.');const u=new URL(input.citedUrl);
  if(u.origin!==new URL(siteDomain).origin)throw new Error('다른 사이트의 인용을 이 사이트 성과로 기록할 수 없습니다.');
 }
 return {...input,method:'operator_recorded'};
}
export async function latestOperation(siteId:string){return (await listEvidence<OperationReport>(siteId,'operation',1))[0]??null;}
