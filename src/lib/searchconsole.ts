// Read-only Search Console collection. Exact periods, page/query attribution and explicit data limits.
import crypto from 'node:crypto';
import { db } from './db';
import { newId, nowIso } from './types';
import type { SearchMetric, Site } from './types';
import { comparisonWindows } from './metric-window';
import { replaceMetricBatch, saveEvidence } from './growth-store';

export interface GscConfig { clientEmail: string; privateKey: string; siteUrl: string }
export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
export interface GscPeriod { startDate: string; endDate: string }
export interface GscSnapshot { period: GscPeriod; totals: GscRow|null; queries: GscRow[]; pages: GscRow[]; locallyCapped: boolean }
export interface GscReport { measuredAt: string; property: string; site: string; current: GscSnapshot; previous: GscSnapshot;
  queryPages: GscRow[]; lastObservedDate: string|null; coverage: string; aggregation: string }

export function gscConfig(site: Site): GscConfig|null {
  const clientEmail=process.env.SGO_GSC_CLIENT_EMAIL, privateKey=process.env.SGO_GSC_PRIVATE_KEY;
  if(!clientEmail||!privateKey)return null;
  let configured=process.env.SGO_GSC_SITE;
  if(process.env.SGO_GSC_SITES) {
    const map=JSON.parse(process.env.SGO_GSC_SITES) as Record<string,string>;
    configured=map[new URL(site.domain).hostname]??configured;
  }
  const siteUrl=configured||new URL('/',site.domain).href;
  assertProperty(site.domain,siteUrl);
  return {clientEmail,privateKey:privateKey.replace(/\\n/g,'\n'),siteUrl};
}
export function assertProperty(domain: string,property: string) {
  const url=new URL(domain);
  if(property.startsWith('sc-domain:')) {
    const host=property.slice(10).toLowerCase();
    if(!host||(url.hostname!==host&&!url.hostname.endsWith('.'+host)))throw new Error('GSC property does not match site');
  } else {
    const p=new URL(property);
    if(p.origin!==url.origin||p.pathname!=='/'||p.search||p.hash)throw new Error('Use the site root URL-prefix property or matching domain property');
  }
}
export async function getGoogleReadToken(cfg:GscConfig,fetcher:typeof fetch=fetch,includeAnalytics=false):Promise<string> {
  const now=Math.floor(Date.now()/1000),enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned=`${enc({alg:'RS256',typ:'JWT'})}.${enc({iss:cfg.clientEmail,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600,
    scope:'https://www.googleapis.com/auth/webmasters.readonly'+(includeAnalytics?' https://www.googleapis.com/auth/analytics.readonly':'')})}`;
  const assertion=unsigned+'.'+crypto.createSign('RSA-SHA256').update(unsigned).sign(cfg.privateKey,'base64url');
  const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!r.ok)throw new Error(`Google authentication failed (HTTP ${r.status})`);
  const data=await r.json() as {access_token?:string};if(!data.access_token)throw new Error('Google access token missing');return data.access_token;
}
export async function googlePost(url:string,body:object,token:string,fetcher:typeof fetch=fetch) {
  const response=await fetcher(url,{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Google read request failed (HTTP ${response.status})`);
  return response.json();
}
export function validateGscRows(value:unknown,dimensionCount:number):GscRow[] {
  if(value===undefined)return [];
  if(!Array.isArray(value))throw new Error('Invalid GSC rows');
  return value.map((row: GscRow)=>{
    if(!row||!['clicks','impressions','position'].every(key=>Number.isFinite(row[key as keyof GscRow])&&Number(row[key as keyof GscRow])>=0))throw new Error('Invalid GSC metric');
    const keys=row.keys??[];
    if(!Array.isArray(keys)||keys.length!==dimensionCount||keys.some(k=>typeof k!=='string'))throw new Error('Invalid GSC dimension keys');
    return {...row,keys,ctr:row.impressions?row.clicks/row.impressions:0};
  });
}
export async function readGscReport(site:Site,cfg:GscConfig,token:string,days=28,fetcher:typeof fetch=fetch,now=new Date()):Promise<GscReport> {
  assertProperty(site.domain,cfg.siteUrl);
  const windows=comparisonWindows(now,days),root=new URL('/',site.domain).href;
  const prefix=root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const endpoint=`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(cfg.siteUrl)}/searchAnalytics/query`;
  async function rows(period:GscPeriod,dimensions:string[]) {
    const all:GscRow[]=[];let capped=false;
    const pageSize=25000;
    for(let startRow=0;startRow<50000;startRow+=pageSize) {
      const data=await googlePost(endpoint,{...period,dimensions,type:'web',dataState:'final',aggregationType:'auto',rowLimit:pageSize,startRow,
        dimensionFilterGroups:[{groupType:'and',filters:[{dimension:'page',operator:'includingRegex',expression:'^'+prefix}]}]},token,fetcher) as {rows?:unknown};
      const page=validateGscRows(data.rows,dimensions.length);all.push(...page);
      if(page.length<pageSize)break;if(startRow===25000)capped=true;
    }
    return {rows:all,capped};
  }
  async function snapshot(period:GscPeriod):Promise<GscSnapshot> {
    const total=await rows(period,[]),queries=await rows(period,['query']),pages=await rows(period,['page']);
    return {period,totals:total.rows[0]??null,queries:queries.rows,pages:pages.rows,locallyCapped:queries.capped||pages.capped};
  }
  const current=await snapshot(windows.current),previous=await snapshot(windows.previous);
  const pairs=await rows(windows.current,['query','page']),dates=await rows(windows.current,['date']);
  const lastObservedDate=dates.rows.map(row=>row.keys[0]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1)??null;
  return {measuredAt:now.toISOString(),property:cfg.siteUrl,site:root,current,previous,queryPages:pairs.rows,lastObservedDate,
    coverage:current.locallyCapped||previous.locallyCapped||pairs.capped?'LOCAL_CAP_REACHED':'API_TOP_ROWS_ONLY',
    aggregation:'Exact site URL-prefix filter; query rows are not site totals. Missing rows are not proof of zero traffic or no index.'};
}
export async function persistGscReport(siteId:string,report:GscReport) {
  for(const snapshot of [report.current,report.previous]) {
    const periodLabel=`${snapshot.period.startDate} ~ ${snapshot.period.endDate} ${Math.round((Date.parse(snapshot.period.endDate)-Date.parse(snapshot.period.startDate))/86400000)+1}d`;
    const metrics:SearchMetric[]=[];
    for(const [dimension,rows] of [['query',snapshot.queries],['page',snapshot.pages]] as const) {
      for(const row of rows)metrics.push({id:newId('met'),siteId,source:'gsc_api',dimension,metricKey:row.keys[0],clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,avgPosition:row.position,periodLabel,importedAt:report.measuredAt});
    }
    await replaceMetricBatch(siteId,periodLabel,'gsc_api',['query','page'],metrics);
  }
  await saveEvidence({id:newId('gsc'),siteId,kind:'gsc',target:report.site,createdAt:report.measuredAt,payload:report});
}
export async function importGscApi(siteId:string,days=28):Promise<{imported:number;periodLabel:string}> {
  const site=await db.sites.get(siteId);if(!site)throw new Error('site not found');
  const cfg=gscConfig(site);if(!cfg)throw new Error('GSC credentials are not configured; no data was imported');
  const report=await readGscReport(site,cfg,await getGoogleReadToken(cfg),days);
  await persistGscReport(siteId,report);
  return {imported:report.current.pages.length+report.current.queries.length,periodLabel:`${report.current.period.startDate} ~ ${report.current.period.endDate} ${days}d`};
}
