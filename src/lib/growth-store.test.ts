import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {replaceMetricBatch} from './growth-store';import type {SearchMetric} from './types';
const period='2026-08-29 ~ 2026-09-25 28d';
const metric=(id:string,dimension:'query'|'page',source:'gsc_api'|'gsc_csv'='gsc_csv'):SearchMetric=>({id,siteId:'s',source,dimension,metricKey:id,clicks:1,impressions:100,ctr:0.01,avgPosition:5,periodLabel:period,importedAt:'2026-09-29T01:00:00Z'});
test('database import preserves other dimensions/providers and rolls back failed replacements',async()=>{
 const pg=new PGlite();try{
 await pg.exec('CREATE TABLE search_metrics(id text primary key,site_id text,source text,dimension text,metric_key text,clicks int,impressions int,ctr real,avg_position real,period_label text,imported_at timestamptz)');
 const execute=(text:string,params?:unknown[])=>pg.query(text,params);
 await replaceMetricBatch('s',period,'gsc_csv',['query'],[metric('query-old','query')],execute);
 await replaceMetricBatch('s',period,'gsc_csv',['page'],[metric('page','page')],execute);
 await replaceMetricBatch('s',period,'gsc_api',['query'],[metric('api','query','gsc_api')],execute);
 await replaceMetricBatch('s',period,'gsc_csv',['query'],[metric('query-new','query')],execute);
 assert.deepEqual((await pg.query<{id:string}>('SELECT id FROM search_metrics ORDER BY id')).rows.map(r=>r.id),['api','page','query-new']);
 await assert.rejects(()=>replaceMetricBatch('s',period,'gsc_csv',['query'],[{...metric('broken','query'),importedAt:'invalid timestamp'}],execute));
 assert.equal((await pg.query('SELECT id FROM search_metrics WHERE id=$1',['query-new'])).rows.length,1);
 await assert.rejects(()=>replaceMetricBatch('other',period,'gsc_csv',['query'],[metric('wrong-scope','query')],execute));
 }finally{await pg.close();}
});
