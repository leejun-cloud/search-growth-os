import type {Site} from './types';import {readPublicHttp} from './public-http';import type {HttpReader} from './public-http';
export async function submitIndexNow(site:Site,url:string,reader:HttpReader=readPublicHttp,fetcher:typeof fetch=fetch){
 const root=new URL(site.domain),target=new URL(url);if(target.origin!==root.origin)throw new Error('다른 사이트 URL은 제출할 수 없습니다.');
 const mapping=JSON.parse(process.env.SGO_INDEXNOW_SITES??'{}') as Record<string,{key:string;keyLocation?:string}>;
 const cfg=mapping[root.hostname];if(!cfg)return {status:'not_configured',detail:'이 사이트의 IndexNow 키 설정이 없습니다. 제출되지 않았습니다.'};
 if(!/^[a-zA-Z0-9-]{8,128}$/.test(cfg.key))throw new Error('IndexNow 키 형식 오류');
 const location=new URL(cfg.keyLocation??`/${cfg.key}.txt`,root);if(location.origin!==root.origin)throw new Error('키 파일은 같은 사이트에 있어야 합니다.');
 const keyFile=await reader(location.href);if(keyFile.status!==200||keyFile.text.trim()!==cfg.key)throw new Error('공개 키 파일 검증 실패: 제출하지 않았습니다.');
 const result=await fetcher('https://api.indexnow.org/indexnow',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({host:root.hostname,key:cfg.key,keyLocation:location.href,urlList:[target.href]})});
 if(result.status!==200&&result.status!==202)throw new Error(`IndexNow 제출 실패: HTTP ${result.status}`);
 return {status:result.status===200?'accepted':'key_validation_pending',detail:`HTTP ${result.status}: 제출 접수이며 색인·노출 성공이 아닙니다.`};
}
