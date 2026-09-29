import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { publicUrl,readPublicHttp } from './public-http';
import type { HttpReader,HttpDocument } from './public-http';
export type Lane='SEO'|'AEO'|'GEO'|'NEO';
export interface LiveCheck { code:string;lane:Lane;status:'pass'|'warn'|'fail'|'unknown';detail:string;remedy:string }
export interface LiveReport { url:string;checkedAt:string;status:'verified'|'blocked';checks:LiveCheck[];
  fingerprint:string|null;observed:{title:string;h1:string;answer:string;bodyChars:number};indexStatus:'not_inspected';citationStatus:'not_measured' }
export interface PageExpectation { title?:string;h1?:string;answer?:string }
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
export function inspectDocument(doc:HttpDocument,expected:PageExpectation={}):LiveReport {
 const checks:LiveCheck[]=[];
 const add=(code:string,lane:Lane,ok:boolean,detail:string,remedy:string,warning=false)=>checks.push({code,lane,status:ok?'pass':warning?'warn':'fail',detail,remedy});
 add('http','SEO',doc.status===200,`HTTP ${doc.status}`,'배포 및 서버 오류를 확인하세요. 리디렉션은 실제 정본 URL로 다시 검사하세요.');
 const $=cheerio.load(doc.text),title=norm($('title').first().text()),h1=norm($('h1').first().text());
 const main=$('article').first().length?$('article').first():$('main').first().length?$('main').first():$('body');
 const copy=main.clone();copy.find('script,style,noscript,nav,footer,header').remove();
 const body=norm(copy.text()),answer=norm(copy.find('p').first().text());
 add('content_type','SEO',/text\/html/i.test(doc.headers['content-type']??''),'Content-Type: '+(doc.headers['content-type']??'missing'),'HTML이 아닌 API/오류 응답을 확인하세요.');
 add('ssr_body','SEO',body.length>0,`초기 HTML 본문 ${body.length}자`,'JS 실행 전 본문을 서버에서 제공하세요. 글자 수는 품질 점수가 아닙니다.');
 add('title','SEO',!!title&&(!expected.title||norm(expected.title)===title),title||'제목 없음','페이지별 title 또는 잘못된 배포 버전을 확인하세요.');
 add('h1','SEO',!!h1&&(!expected.h1||norm(expected.h1)===h1),h1||'H1 없음','페이지의 주제와 H1을 확인하세요.');
 const canonicals=$('link[rel="canonical"]').toArray().map(e=>{try{return new URL($(e).attr('href')??'',doc.url).href;}catch{return 'invalid';}});
 add('canonical','SEO',canonicals.length===1&&canonicals[0]===doc.url,canonicals.join(', ')||'canonical 없음','정본 URL 한 개를 정확히 지정하세요.');
 const directives=$('meta[name="robots"],meta[name="googlebot"]').toArray().map(e=>$(e).attr('content')??'').join(',')+','+(doc.headers['x-robots-tag']??'');
 add('index_directive','SEO',!/(?:^|[\s,:])(?:noindex|none)(?:$|[\s,])/i.test(directives),directives||'noindex 없음','검색 대상 페이지의 noindex 설정을 확인하세요. 실제 색인 여부는 별도 검사입니다.');
 add('description','SEO',!!$('meta[name="description"]').attr('content'),'메타 설명 존재 여부','검색자가 이 페이지를 선택할 이유를 설명하세요.',true);
 const validJson=$('script[type="application/ld+json"]').toArray().filter(e=>{try{JSON.parse($(e).text());return true;}catch{return false;}}).length;
 add('structured_data','SEO',validJson>0,`파싱 가능한 JSON-LD ${validJson}개`,'화면의 사실과 일치하는 타입의 구조화 데이터를 사용하세요.',true);
 add('direct_answer','AEO',!!answer&&(!expected.answer||body.includes(norm(expected.answer))),answer.slice(0,220)||'첫 문단 없음','질문에 대한 직답을 본문 첫 문단에 제공하세요. 의미 정확성은 사람이 검토해야 합니다.',!expected.answer);
 const external=copy.find('a[href]').toArray().filter(e=>{try{return new URL($(e).attr('href')??'',doc.url).origin!==new URL(doc.url).origin;}catch{return false;}}).length;
 add('source_links','GEO',external>0,`외부 근거 링크 ${external}개 (내용 일치 여부 미검증)`,'수치와 주장 옆에 실제 원출처와 산출 방법을 연결하세요.',true);
 add('data_date','GEO',$('time[datetime],[data-asof]').length>0,'기준일/시간 표기 확인','실제 자료의 기준일과 검토 시점을 공개하세요. 오늘 날짜를 임의로 넣지 마세요.',true);
 return {url:doc.url,checkedAt:new Date().toISOString(),status:checks.some(c=>c.status==='fail')?'blocked':'verified',checks,
   fingerprint:createHash('sha256').update(JSON.stringify({title,h1,body,canonicals})).digest('hex'),observed:{title,h1,answer:answer.slice(0,500),bodyChars:body.length},indexStatus:'not_inspected',citationStatus:'not_measured'};
}
// Longest matching rule, most specific user-agent, Allow wins equal-length ties.
export function robotsAllows(text:string,url:string,agent:string):boolean {
 const groups:Array<{agents:string[];rules:Array<{allow:boolean;path:string}>}>=[];let group={agents:[] as string[],rules:[] as Array<{allow:boolean;path:string}>};
 for(const raw of text.split(/\r?\n/)) {
  const line=raw.split('#')[0].trim(),colon=line.indexOf(':');if(colon<0)continue;
  const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
  if(key==='user-agent'){if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(value.toLowerCase());}
  else if(['allow','disallow'].includes(key)&&group.agents.length)group.rules.push({allow:key==='allow',path:value});
 }
 groups.push(group);
 const scored=groups.map(g=>({...g,score:Math.max(-1,...g.agents.map(a=>a==='*'?0:a&&agent.toLowerCase().includes(a)?a.length:-1))}));
 const best=Math.max(-1,...scored.map(g=>g.score));if(best<0)return true;
 const u=new URL(url),target=u.pathname+u.search;
 const rules=scored.filter(g=>g.score===best).flatMap(g=>g.rules).filter(r=>{
  if(!r.path.startsWith('/'))return false;const end=r.path.endsWith('$'),raw=end?r.path.slice(0,-1):r.path;
  const pattern=raw.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+pattern+(end?'$':'')).test(target);
 }).sort((a,b)=>Buffer.byteLength(b.path.replace(/[*$]/g,''))-Buffer.byteLength(a.path.replace(/[*$]/g,''))||Number(b.allow)-Number(a.allow));
 return rules[0]?.allow??true;
}
export async function verifyLivePage(siteDomain:string,target:string,expected:PageExpectation={},reader:HttpReader=readPublicHttp):Promise<LiveReport> {
 const base=publicUrl(siteDomain),url=publicUrl(new URL(target,base).href);
 if(url.origin!==base.origin)throw new Error('Verification target must belong to the selected site');
 let report:LiveReport;
 try{report=inspectDocument(await reader(url.href),expected);}catch(error){report={url:url.href,checkedAt:new Date().toISOString(),status:'blocked',checks:[{code:'fetch','lane':'SEO',status:'unknown',detail:String(error).slice(0,300),remedy:'DNS·접근권한·서버 응답을 확인한 뒤 재검사하세요.'}],fingerprint:null,observed:{title:'',h1:'',answer:'',bodyChars:0},indexStatus:'not_inspected',citationStatus:'not_measured'};return report;}
 try{
  const robots=await reader(new URL('/robots.txt',base).href);
  const available=robots.status===404||(robots.status===200&&!/<html|<!doctype html/i.test(robots.text));
  for(const [agent,lane] of [['Googlebot','SEO'],['Yeti','NEO'],['OAI-SearchBot','GEO'],['PerplexityBot','GEO']] as const){
   const allowed=available&&(robots.status===404||robotsAllows(robots.text,url.href,agent));
   report.checks.push({code:'robots_'+agent,lane,status:!available?'unknown':allowed?'pass':'fail',detail:!available?`robots HTTP ${robots.status}`:robots.status===404?'robots.txt 없음: 차단 규칙 없음':`${agent}: ${allowed?'허용':'차단'}`,remedy:'robots 정책만 확인한 결과입니다. CDN/WAF의 실제 봇 허용 여부는 별도 로그로 확인하세요.'});
  }
 }catch(error){report.checks.push({code:'robots_fetch',lane:'SEO',status:'unknown',detail:String(error).slice(0,250),remedy:'robots 응답을 확인하세요.'});}
 try{
  const pending=[new URL('/sitemap.xml',base).href],seen=new Set<string>();let found=false;
  while(pending.length&&seen.size<5&&!found){const next=pending.shift()!;if(seen.has(next))continue;seen.add(next);
   if(new URL(next).origin!==base.origin)throw new Error('Cross-origin sitemap requires manual inspection');
   const doc=await reader(next);if(doc.status!==200)throw new Error(`Sitemap HTTP ${doc.status}`);
   const $=cheerio.load(doc.text,{xmlMode:true});if(!$('urlset,sitemapindex').length)throw new Error('Not a valid sitemap root');
   const locations=$('loc').toArray().map(e=>$(e).text().trim());
   if($('sitemapindex').length)pending.push(...locations);else found=locations.some(loc=>{try{return new URL(loc).href===url.href;}catch{return false;}});
  }
  report.checks.push({code:'sitemap_discovery',lane:'SEO',status:found?'pass':pending.length?'unknown':'warn',detail:found?'정본 URL을 사이트맵에서 확인':pending.length?'검사 한도(5개) 초과: 전체 확인 안 됨':'검사한 사이트맵에 URL 없음',remedy:'사이트맵에 정본 URL을 포함하세요. 사이트맵 포함은 실제 색인을 보장하지 않습니다.'});
 }catch(error){report.checks.push({code:'sitemap_discovery',lane:'SEO',status:'unknown',detail:String(error).slice(0,250),remedy:'사이트맵 응답·정본 URL 포함 여부를 확인하세요.'});}
 report.status=report.checks.some(c=>c.status==='fail'||c.status==='unknown'&&c.code.startsWith('robots'))?'blocked':'verified';return report;
}
