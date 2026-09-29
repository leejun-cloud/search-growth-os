import {sql} from './sqldb';import {listEvidence} from './growth-store';
export interface ContentProfile{directAnswer:string;dataAsOf:string;reviewer:string;lastReviewedAt:string;sources:string[]}
export async function contentProfile(siteId:string,pageId:string):Promise<ContentProfile|null>{
 await listEvidence(siteId,'content_profile',1); // Ensures the additive evidence table exists for old installations.
 const result=await sql<{payload:ContentProfile}>('SELECT payload FROM growth_evidence WHERE site_id=$1 AND kind=$2 AND target=$3 ORDER BY created_at DESC LIMIT 1',[siteId,'content_profile',pageId]);
 return result.rows[0]?.payload??null;
}
