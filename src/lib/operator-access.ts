// Single-operator gate for the new evidence workspace. This is not multi-tenant authentication.
import {cookies,headers} from 'next/headers';import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
const cookieName='sgo_operator';
const same=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export async function hasOperatorAccess():Promise<boolean>{
 if(process.env.NODE_ENV!=='production'&&!process.env.SGO_OPERATOR_TOKEN)return true;
 const key=process.env.SGO_OPERATOR_TOKEN;if(!key)return false;
 const token=(await cookies()).get(cookieName)?.value??'',parts=token.split('.');
 if(parts.length!==2||!/^\d+$/.test(parts[0])||Number(parts[0])<Date.now())return false;
 return same(parts[1],createHmac('sha256',key).update(parts[0]).digest('hex'));
}
export async function requireOperator(){if(!await hasOperatorAccess())throw new Error('운영자 인증이 필요합니다.');}
export async function unlockOperator(password:string){
 const key=process.env.SGO_OPERATOR_TOKEN;if(!key||!same(password,key))throw new Error('운영자 인증에 실패했습니다.');
 const expires=String(Date.now()+8*3600000),signature=createHmac('sha256',key).update(expires).digest('hex');
 const secure=(await headers()).get('x-forwarded-proto')==='https';
 (await cookies()).set(cookieName,expires+'.'+signature,{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:8*3600});
}
