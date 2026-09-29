// Export is not publishing. A successful webhook is not proof of a readable public page.
import {promises as fs} from 'node:fs';import path from 'node:path';
import {db} from './db';import {nowIso,newId} from './types';
import {runQualityGate} from './quality';import {verifyPublishedRevision} from './publication-verification';import type {LiveReport} from './live-verification';
import {saveEvidence} from './growth-store';
export interface PublishResult {ok:boolean;adapter:string;location:string;message?:string;stage?:'exported'|'verified'|'blocked'|'unverified'}
const publishDir=(siteId:string)=>path.join(process.cwd(),'data','published',siteId);
export function deliveryState(adapter:string,accepted:boolean,verification?:Pick<LiveReport,'status'>):'exported'|'verified'|'blocked'|'unverified'{
 if(!accepted)return 'blocked';if(adapter==='local-file')return 'exported';return verification?.status==='verified'?'verified':'unverified';
}
async function receipt(siteId:string,pageId:string,result:PublishResult){await saveEvidence({id:newId('delivery'),siteId,kind:'delivery',target:pageId,createdAt:nowIso(),payload:{stage:result.stage??'blocked',message:result.message??'',location:result.location}});return result;}
export async function publishPage(pageId:string):Promise<PublishResult>{
 const original=await db.pages.get(pageId);if(!original)throw new Error('page not found');const site=await db.sites.get(original.siteId);if(!site)throw new Error('site not found');
 const quality=await runQualityGate(pageId);
 if(quality.verdict==='block')return receipt(site.id,pageId,{ok:false,adapter:'-',location:'',stage:'blocked',message:'현재 본문이 품질검사에서 차단됐습니다.'});
 const page=(await db.pages.get(pageId))!;
 const endpoint=process.env.SGO_PUBLISH_ENDPOINT;
 if(!endpoint){
  const dir=publishDir(site.id);await fs.mkdir(dir,{recursive:true});
  const basename=page.id.replace(/[^a-zA-Z0-9_-]/g,'_');const location=path.join(dir,basename+'.json');
  await fs.writeFile(location,JSON.stringify(page,null,2),'utf8');
  await fs.writeFile(path.join(dir,basename+'.md'),`---\ntitle: ${JSON.stringify(page.seoTitle)}\nslug: ${JSON.stringify(page.slug)}\n---\n\n# ${page.h1}\n\n${page.summary}\n\n${page.body}\n`,'utf8');
  return receipt(site.id,pageId,{ok:true,adapter:'local-file',location,stage:'exported',message:'파일 내보내기만 완료했습니다. 대상 사이트 게시가 아니므로 published 상태로 변경하지 않았습니다.'});
 }
 const destination=new URL(endpoint),origin=new URL(site.domain).origin;
 if(destination.origin!==origin||destination.protocol!=='https:'||destination.username||destination.password)return receipt(site.id,pageId,{ok:false,adapter:'nextjs-webhook',location:'',stage:'blocked',message:'발행 엔드포인트는 선택한 사이트와 같은 HTTPS origin이어야 합니다.'});
 if(!process.env.SGO_PUBLISH_SECRET)return receipt(site.id,pageId,{ok:false,adapter:'nextjs-webhook',location:'',stage:'blocked',message:'발행 인증 시크릿이 설정되지 않았습니다.'});
 const location=page.canonicalUrl??`${origin}/${page.slug}`;
 try{
  const response=await fetch(endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SGO_PUBLISH_SECRET}`},body:JSON.stringify(page)});
  if(!response.ok)return receipt(site.id,pageId,{ok:false,adapter:'nextjs-webhook',location,stage:'blocked',message:`게시 요청 실패: HTTP ${response.status}`});
  const verification=await verifyPublishedRevision(site,page);
  await saveEvidence({id:newId('verify'),siteId:site.id,kind:'verification',target:location,createdAt:verification.checkedAt,payload:verification});
  const stage=deliveryState('nextjs-webhook',true,verification);
  if(stage!=='verified')return receipt(site.id,pageId,{ok:false,adapter:'nextjs-webhook',location,stage:'unverified',message:'게시 API는 수락했지만 실제 URL의 새 본문·정본·검색 허용을 확인하지 못했습니다. 게시 완료로 처리하지 않았습니다.'});
  const at=nowIso();await db.pages.put({...page,status:'published',publishedAt:page.publishedAt??at,updatedAt:at});
  let feedMessage='';try{await regenerateFeeds(site.id);}catch{feedMessage=' 로컬 피드 파일 생성 실패: 별도 재시도가 필요합니다.';}
  return receipt(site.id,pageId,{ok:true,adapter:'nextjs-webhook',location,stage:'verified',message:'대상 URL의 본문·제목·정본·검색 허용 확인 완료. 실제 색인·유입 증가와는 별도입니다.'+feedMessage});
 }catch(error){return receipt(site.id,pageId,{ok:false,adapter:'nextjs-webhook',location,stage:'unverified',message:'게시/재확인 실패: '+String(error).slice(0,250)});}
}
export async function regenerateFeeds(siteId:string):Promise<string[]>{
 const site=await db.sites.get(siteId);if(!site)throw new Error('site not found');
 const pages=await db.pages.published(siteId),origin=site.domain.replace(/\/$/,''),dir=publishDir(siteId);await fs.mkdir(dir,{recursive:true});
 const urls=pages.filter(p=>p.indexPolicy==='index').map(p=>({loc:p.canonicalUrl??`${origin}/${p.slug}`,lastmod:p.updatedAt.slice(0,10),title:p.seoTitle,description:p.metaDescription}));
 const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`<url><loc>${escapeXml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}\n</urlset>`;
 const rss=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${escapeXml(site.name)}</title><link>${escapeXml(origin)}</link><description>${escapeXml(site.name)}</description>${urls.map(u=>`<item><title>${escapeXml(u.title)}</title><link>${escapeXml(u.loc)}</link><description>${escapeXml(u.description)}</description></item>`).join('')}</channel></rss>`;
 // These are export files, not a deployment to the target host.
 const files=[['sitemap.xml',sitemap],['rss.xml',rss],['llms.txt',`# ${site.name}\n\n${urls.map(u=>`- [${u.title}](${u.loc})`).join('\n')}`]];
 const written:string[]=[];for(const [name,content] of files){const filename=path.join(dir,name);await fs.writeFile(filename,content,'utf8');written.push(filename);}return written;
}
export function escapeXml(s:string):string{return s.replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c] as string));}
