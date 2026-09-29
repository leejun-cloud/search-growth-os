// Read-only public-site fetcher: public IPv4, DNS pinning, no redirects, bounded time/body.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';
export interface HttpDocument { url:string; status:number; text:string; headers:Record<string,string> }
export type HttpReader = (url:string)=>Promise<HttpDocument>;
export function publicIpv4(ip:string):boolean {
  if(isIP(ip)!==4)return false;
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
export function publicUrl(value:string):URL {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw new Error('Only public HTTP(S) URLs on standard ports are allowed');
  if(u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw new Error('Private host is not allowed');
  if(u.hostname.includes(':')||(isIP(u.hostname)&&!publicIpv4(u.hostname)))throw new Error('Private or unsupported IP address');
  u.hash='';return u;
}
export const readPublicHttp:HttpReader=async(value)=>{
  const u=publicUrl(value);
  const addresses=await lookup(u.hostname,{family:4,all:true});
  if(!addresses.length||addresses.some(a=>!publicIpv4(a.address)))throw new Error('DNS must resolve only to public IPv4 addresses');
  const request=u.protocol==='https:'?https.request:http.request;
  return new Promise<HttpDocument>((resolve,reject)=>{
    let size=0;const chunks:Buffer[]=[];
    const req=request({protocol:u.protocol,hostname:addresses[0].address,servername:u.hostname,
      port:u.protocol==='https:'?443:80,path:u.pathname+u.search,method:'GET',
      headers:{Host:u.host,'User-Agent':'SearchGrowthOS-Verify/1.0','Accept-Encoding':'identity','Cache-Control':'no-cache'}},res=>{
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){req.destroy(new Error('Response exceeded 2MB limit'));return;}chunks.push(chunk);});
      res.once('error',reject);
      res.once('end',()=>{clearTimeout(timer);resolve({url:u.href,status:res.statusCode??0,text:Buffer.concat(chunks).toString('utf8'),headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v??'']))});});
    });
    const timer=setTimeout(()=>req.destroy(new Error('Public HTTP verification timed out')),12000);
    req.once('error',e=>{clearTimeout(timer);reject(e);});req.end();
  });
};
