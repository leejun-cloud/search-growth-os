// CI-only local database seed. No invented visits, search clicks or conversions.
import {db} from '../src/lib/db';import {runOperations} from '../src/lib/growth-operations';import {promises as fs} from 'node:fs';import type {Site} from '../src/lib/types';
async function main(){
 const id='verification-demo';const site:Site={id,name:'드림브릿지 · 실제 URL 검증',domain:'https://db.nolgong.app',platform:'nextjs',primaryLanguage:'ko',targetRegions:[],primaryServices:[],audiences:[],conversionGoals:['문의'],autoPublishAllowed:false,thresholds:{autoDraft:80,reviewQueue:65,enrich:50,quality:{minBodyChars:800,thinBlockChars:500,maxSimilarity:0.6,maxFamilySimilarity:0.45,maxKeywordDensity:0.05}},pilotCriteria:{weeks:8,minIndexRate:70,minQueryCount:50},createdAt:new Date().toISOString()};
 await db.sites.put(site);const report=await runOperations(id,'/services/ai-website');
 await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/live-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({verification:report.verification.status,checks:report.verification.checks,errors:report.errors}));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
