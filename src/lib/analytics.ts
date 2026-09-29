// CSV import and conservative pilot assessment. Search visibility is not business success.
import { db } from './db';
import { newId, nowIso } from './types';
import type { SearchMetric, Site } from './types';
import { parseCtr, selectMetricWindow } from './metric-window';
import { replaceMetricBatch } from './growth-store';
export { parseCtr } from './metric-window';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i=0;i<src.length;i++) {
    const c=src[i];
    if (inQuotes) {
      if (c==='"' && src[i+1]==='"') { field+='"';i++; }
      else if(c==='"') inQuotes=false; else field+=c;
    } else if(c==='"') inQuotes=true;
    else if(c===',') { row.push(field);field=''; }
    else if(c==='\n'||c==='\r') {
      if(c==='\r'&&src[i+1]==='\n') i++;
      row.push(field);field='';if(row.some(f=>f!=='')) rows.push(row);row=[];
    } else field+=c;
  }
  if(inQuotes) throw new Error('CSV has an unterminated quoted field');
  if(field!==''||row.length) {row.push(field);if(row.some(f=>f!=='')) rows.push(row);}
  return rows;
}

function number(value: string | undefined): number {
  const n=Number((value??'').replace(/[,\s]/g,''));
  if(!Number.isFinite(n)||n<0) throw new Error('Invalid numeric metric');
  return n;
}
export function csvMetrics(siteId: string, csv: string, periodLabel: string): { rows: SearchMetric[]; dimension: 'query'|'page' } {
  const parsed=parseCsv(csv); if(parsed.length<2) throw new Error('CSV에 데이터가 없습니다.');
  const headers=parsed[0].map(h=>h.trim());
  const find=(pattern: RegExp)=>headers.findIndex(h=>pattern.test(h));
  const dim=find(/^(상위\s*)?(쿼리|검색어|페이지|queries|query|pages|page|top queries|top pages)$/i);
  const clicks=find(/^(클릭(수)?|clicks?)$/i), impressions=find(/^(노출(수)?|impressions?)$/i);
  const ctr=find(/^(ctr|클릭률)$/i), position=find(/^(평균\s*)?(게재\s*순위|position)$/i);
  if(dim<0||impressions<0) throw new Error('쿼리/페이지 및 노출 헤더가 필요합니다.');
  const dimension=/페이지|page/i.test(headers[dim])?'page':'query';
  const rows: SearchMetric[]=[]; const seen=new Set<string>();
  for(const row of parsed.slice(1)) {
    const key=row[dim]?.trim();if(!key)continue;
    if(seen.has(key)) throw new Error('CSV contains duplicate dimension keys'); seen.add(key);
    const imp=number(row[impressions]), clk=clicks<0?0:number(row[clicks]);
    if(!Number.isInteger(imp)||!Number.isInteger(clk)||clk>imp) throw new Error('Invalid clicks/impressions');
    const ratio=ctr>=0?parseCtr(row[ctr]??''):imp?clk/imp:0;
    rows.push({id:newId('met'),siteId,source:'gsc_csv',dimension,metricKey:key,clicks:clk,impressions:imp,
      ctr:ratio,avgPosition:position<0?0:number(row[position]),periodLabel,importedAt:nowIso()});
  }
  return {rows,dimension};
}
export async function importGscCsv(siteId: string, csvText: string, periodLabel: string) {
  if(!await db.sites.get(siteId)) throw new Error('site not found');
  const {rows,dimension}=csvMetrics(siteId,csvText,periodLabel);
  await replaceMetricBatch(siteId,periodLabel,'gsc_csv',[dimension],rows);
  return {imported:rows.length,dimension};
}
export interface PilotVerdict {
  criteria: Site['pilotCriteria']; publishedCount: number; queryCount: number;
  totalImpressions: number; totalClicks: number; passed: boolean|null; note: string;
}
export async function evaluatePilot(siteId: string): Promise<PilotVerdict> {
  const site=await db.sites.get(siteId);if(!site)throw new Error('site not found');
  const pages=await db.pages.published(siteId);
  const window=selectMetricWindow(await db.searchMetrics.bySite(siteId));
  const queries=window.rows.filter(m=>m.dimension==='query');
  const totalImpressions=queries.reduce((n,m)=>n+m.impressions,0),totalClicks=queries.reduce((n,m)=>n+m.clicks,0);
  const note=window.status==='fresh'
    ? `선택 기간 ${window.periodLabel}: 관측 검색어 ${queries.length}개, 클릭 ${totalClicks}회. 검색어 행 합계는 사이트 전체 합계가 아닙니다. 색인율·검색 방문·유효 문의가 검증되지 않아 성공 판정과 자동 확장을 보류합니다.`
    : `성과 판정 보류 (${window.status}). 날짜가 명확한 최신 데이터가 필요합니다. 데이터 없음은 방문 0이나 실패의 증거가 아닙니다.`;
  return {criteria:site.pilotCriteria,publishedCount:pages.length,queryCount:queries.length,totalImpressions,totalClicks,passed:null,note};
}
