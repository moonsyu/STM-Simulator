import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../../src/part-library.js';
import {deviceDocs} from '../../src/device-docs-data.js';
import paths from './paths.cjs';
const {out}=paths,rows=[];
for(const {type}of PART_LIBRARY){
 const core=JSON.parse(await fs.readFile(new URL('core-'+type+'.json',out))),cards=JSON.parse(await fs.readFile(new URL('cards-'+type+'.json',out)));
 assert.ok(!core.fatal&&!cards.fatal,type+': worker failed');
 assert.deepEqual(cards.cards.map(c=>c.api).sort(),deviceDocs(type).functions.map(c=>c.name).sort(),type+': missing or duplicate cards');
 assert.ok(core.assessment.passed,type+': device behavior');
 assert.ok(core.idempotent,type+': repeated apply');
 assert.ok(Object.values(core.structure).every(Boolean),type+': inline code/user source');
 assert.ok(core.topology.connected&&core.topology.isolated,type+': wiring');
 assert.ok(core.removedWireChecks.every(c=>!c.error&&c.connected&&c.isolated),type+': removed-wire repair');
 assert.ok(!core.repair.error&&core.repair.assessment.passed&&core.repair.unrelatedWirePreserved&&core.repair.topology.connected&&core.repair.topology.isolated,type+': damaged-wiring behavior');
 assert.ok(cards.cards.length>0&&cards.cards.every(c=>c.status==='api-exercised'&&Object.values(c.structure).every(Boolean)&&c.topology.connected&&c.topology.isolated),type+': HAL card application/execution');
 rows.push({type,passed:true,deviceChecks:core.assessment.checks.length,removedWires:core.removedWireChecks.length,cards:cards.cards.length,apis:cards.cards.map(c=>c.api)});
}
const report={version:paths.version,verifiedAt:new Date().toISOString(),passed:true,devices:rows.length,cards:rows.reduce((n,r)=>n+r.cards,0),removedWires:rows.reduce((n,r)=>n+r.removedWires,0),damagedCircuits:rows.length,rows};
await fs.writeFile(new URL('verified-summary.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));
