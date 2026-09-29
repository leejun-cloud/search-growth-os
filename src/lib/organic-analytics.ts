import { googlePost } from './searchconsole';
import type { GscPeriod } from './searchconsole';
import type { Site } from './types';
export interface OrganicReport {
  status: 'not_configured'|'observed'|'limited'|'no_rows'; propertyId:string|null;
  sessions:{current:number|null;previous:number|null}; leadEvent:string|null;
  leadEvents:{current:number|null;previous:number|null}; qualifiedLeads:null; note:string;
}
export async function readOrganicAnalytics(site:Site,token:string,windows:{current:GscPeriod;previous:GscPeriod},fetcher:typeof fetch=fetch):Promise<OrganicReport> {
  const host=new URL(site.domain).hostname;
  const configs=JSON.parse(process.env.SGO_ANALYTICS_SITES??'{}') as Record<string,{propertyId?:string;leadEvent?:string}>;
  const config=configs[host];
  // A per-host mapping prevents accidentally displaying another site's GA4 figures.
  const propertyId=config?.propertyId??null,leadEvent=config?.leadEvent??null;
  const empty:OrganicReport={status:'not_configured',propertyId,sessions:{current:null,previous:null},leadEvent,leadEvents:{current:null,previous:null},qualifiedLeads:null,
    note:'GA4 events are not unique people or CRM-qualified leads. GA4 property timezone can differ from GSC Pacific dates.'};
  if(!propertyId||!/^\d+$/.test(propertyId))return empty;
  const exact=(fieldName:string,value:string)=>({filter:{fieldName,stringFilter:{matchType:'EXACT',value,caseSensitive:true}}});
  const endpoint=`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  let limited=false;
  async function count(period:GscPeriod,metric:string,event?:string) {
    const expressions=[exact('hostName',host),exact('sessionDefaultChannelGroup','Organic Search')];if(event)expressions.push(exact('eventName',event));
    const data=await googlePost(endpoint,{dateRanges:[period],metrics:[{name:metric}],dimensionFilter:{andGroup:{expressions}},keepEmptyRows:true},token,fetcher) as {
      rows?:Array<{metricValues:Array<{value:string}>}>;metadata?:{subjectToThresholding?:boolean;dataLossFromOtherRow?:boolean;samplingMetadatas?:unknown[]}};
    if(data.metadata?.subjectToThresholding||data.metadata?.dataLossFromOtherRow||data.metadata?.samplingMetadatas?.length)limited=true;
    const raw=data.rows?.[0]?.metricValues?.[0]?.value;if(raw===undefined)return null;
    const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error('Invalid GA4 metric');return n;
  }
  const current=await count(windows.current,'sessions'),previous=await count(windows.previous,'sessions');
  const leads=leadEvent?{current:await count(windows.current,'eventCount',leadEvent),previous:await count(windows.previous,'eventCount',leadEvent)}:empty.leadEvents;
  return {...empty,status:limited?'limited':current===null?'no_rows':'observed',sessions:{current,previous},leadEvents:leads};
}
