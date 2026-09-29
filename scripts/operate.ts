// One real read-only operation; intended for the existing runtime with its configured DB/credentials.
import {runOperations} from '../src/lib/growth-operations';
const [siteId,target='/']=process.argv.slice(2);
if(!siteId){console.error('Usage: npx tsx scripts/operate.ts <siteId> [path]');process.exit(2);}
runOperations(siteId,target).then(report=>{console.log(JSON.stringify(report,null,2));process.exit(report.verification.status==='verified'&&report.search?0:1);}).catch(error=>{console.error(error);process.exit(1);});
