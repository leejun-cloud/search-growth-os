// Evidence-first recommendations; no destructive action from missing/truncated search rows.
import {db} from './db';import {newId,nowIso} from './types';
import type {GrowthAction,GrowthActionType,SearchMetric} from './types';
import {selectMetricWindow} from './metric-window';
import {listEvidence} from './growth-store';import type {GscReport} from './searchconsole';
export function expectedCtr(position:number):number{return position<=1?0.28:position<=3?0.11:position<=5?0.06:position<=10?0.025:0.01;}
export function measuredRecommendations(metrics:SearchMetric[],now=new Date()):Array<Pick<GrowthAction,'action'|'target'|'reason'>> {
 const window=selectMetricWindow(metrics,now);
 if(window.status!=='fresh')return [{action:'REQUEST_MORE_DATA',target:'measurement',reason:`신뢰할 최신 기간이 없습니다 (${window.status}). 이전 데이터로 신규 발행·병합·삭제를 판단하지 않습니다.`}];
 return window.rows.filter(m=>m.dimension==='page'&&m.impressions>=100&&m.avgPosition>3&&m.avgPosition<=30).slice(0,10).map(m=>({action:'UPDATE',target:m.metricKey,
   reason:`${window.periodLabel}: 노출 ${m.impressions}, 클릭 ${m.clicks}, 평균 ${m.avgPosition.toFixed(1)}위. 이미 노출되는 기존 URL의 답변·근거·문의 동선을 먼저 검토합니다. 자동 발행하지 않습니다.`}));
}
export async function runGrowthAgent(siteId:string):Promise<GrowthAction[]> {
 const metrics=await db.searchMetrics.bySite(siteId);const suggestions=measuredRecommendations(metrics);
 const [last]=await listEvidence<GscReport>(siteId,'gsc',1);
 const cutoff=Date.now()-7*86400000;
 if(last&&Date.parse(last.createdAt)>cutoff&&Date.parse(last.payload.current.period.endDate)>cutoff){
  for(const r of last.payload.queryPages.filter(r=>r.impressions>=100&&r.position>=4&&r.position<=20).sort((a,b)=>b.impressions-a.impressions).slice(0,10)){
   suggestions.push({action:'UPDATE',target:r.keys[1],reason:`실측 검색어 「${r.keys[0]}」 → 이 URL: 노출 ${r.impressions}, 클릭 ${r.clicks}, 평균 ${r.position.toFixed(1)}위. 첫 답변·사례·근거를 보강하고 변경 전후를 비교하세요. API 상위 행 기반이며 검색량 추정이 아닙니다.`});
  }
 }
 if(!suggestions.length)suggestions.push({action:'REQUEST_MORE_DATA',target:'measurement',reason:'확대할 근거가 부족합니다. 검색어와 방문·문의 데이터를 확인하고 현재 페이지를 개선하세요.'});
 await db.growthActions.clearProposed(siteId);const saved:GrowthAction[]=[];const seen=new Set<string>();
 for(const s of suggestions){const key=s.action+':'+s.target;if(seen.has(key))continue;seen.add(key);const row:GrowthAction={...s,id:newId('ga'),siteId,status:'proposed',createdAt:nowIso()};await db.growthActions.put(row);saved.push(row);}return saved;
}
export type {GrowthActionType};
