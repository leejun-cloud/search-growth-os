import { sql } from './sqldb';
import type { SearchMetric } from './types';
type SqlExecutor = (text:string,params?:unknown[])=>Promise<unknown>;
/** Validate first; replace only this provider/period/dimension. A failed SQL insert rolls back its delete. */
export async function replaceMetricBatch(siteId:string,period:string,source:SearchMetric['source'],dimensions:SearchMetric['dimension'][],rows:SearchMetric[],execute:SqlExecutor=sql){
 if(!dimensions.length||rows.some(row=>row.siteId!==siteId||row.periodLabel!==period||row.source!==source||!dimensions.includes(row.dimension)))throw new Error('Metric batch scope mismatch');
 const payload=rows.map(row=>({id:row.id,site_id:row.siteId,source:row.source,dimension:row.dimension,metric_key:row.metricKey,clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,avg_position:row.avgPosition,period_label:row.periodLabel,imported_at:row.importedAt}));
 await execute(`WITH removed AS (
  DELETE FROM search_metrics WHERE site_id=$1 AND period_label=$2 AND source=$3 AND dimension=ANY($4::text[])
 ) INSERT INTO search_metrics(id,site_id,source,dimension,metric_key,clicks,impressions,ctr,avg_position,period_label,imported_at)
 SELECT id,site_id,source,dimension,metric_key,clicks,impressions,ctr,avg_position,period_label,imported_at
 FROM jsonb_to_recordset($5::jsonb) AS x(id text,site_id text,source text,dimension text,metric_key text,clicks int,impressions int,ctr real,avg_position real,period_label text,imported_at timestamptz)`,[siteId,period,source,dimensions,JSON.stringify(payload)]);
}
export interface EvidenceRecord<T=unknown>{id:string;siteId:string;kind:string;target:string;createdAt:string;payload:T}
async function ensureEvidenceTable(){
 await sql(`CREATE TABLE IF NOT EXISTS growth_evidence(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,kind TEXT NOT NULL,target TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),payload JSONB NOT NULL)`);
 await sql('CREATE INDEX IF NOT EXISTS idx_growth_evidence_site ON growth_evidence(site_id,kind,created_at DESC)');
}
export async function saveEvidence<T>(record:EvidenceRecord<T>){await ensureEvidenceTable();await sql('INSERT INTO growth_evidence(id,site_id,kind,target,created_at,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[record.id,record.siteId,record.kind,record.target,record.createdAt,JSON.stringify(record.payload)]);}
export async function listEvidence<T=unknown>(siteId:string,kind:string,limit=30):Promise<EvidenceRecord<T>[]>{
 await ensureEvidenceTable();const result=await sql<{id:string;site_id:string;kind:string;target:string;created_at:Date|string;payload:T}>('SELECT * FROM growth_evidence WHERE site_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT $3',[siteId,kind,Math.min(100,Math.max(1,limit))]);
 return result.rows.map(row=>({id:row.id,siteId:row.site_id,kind:row.kind,target:row.target,createdAt:new Date(row.created_at).toISOString(),payload:row.payload}));
}
