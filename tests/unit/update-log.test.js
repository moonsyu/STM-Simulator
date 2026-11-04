import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UPDATE_LOG} from '../../src/update-log-data.js';
import {sortUpdateLog,searchUpdateLog,updateLogPage,compareVersions,UPDATE_LOG_PAGE_SIZE} from '../../src/update-log.js';

const entry=(version,date,items=['기능'])=>({version,date,items});

test('the update log sorts newest first: by date, then by version within a day',()=>{
 const sorted=sortUpdateLog([entry('1.9.2','2026-11-02'),entry('1.10.0','2026-11-02'),entry('1.12.3','2026-11-04'),entry('0.9.0','2026-09-10')]);
 assert.deepEqual(sorted.map(e=>e.version),['1.12.3','1.10.0','1.9.2','0.9.0']);
 assert.ok(compareVersions('1.10.0','1.9.2')>0);assert.equal(compareVersions('1.2','1.2.0'),0);
});

test('search finds a version, a date or words in the items, and keeps only matching items',()=>{
 const log=[entry('1.13.0','2026-11-04',['USER CODE 구간 유지','업데이트 로그 창 추가']),entry('1.12.3','2026-11-04',['실행 대상 메뉴']),entry('1.12.0','2026-11-03',['ESLint 정적 검사'])];
 assert.deepEqual(searchUpdateLog(log,'v1.12').map(e=>e.version),['1.12.3','1.12.0']);
 assert.deepEqual(searchUpdateLog(log,'2026-11-04').map(e=>e.version),['1.13.0','1.12.3']);
 assert.deepEqual(searchUpdateLog(log,'업데이트 로그'),[entry('1.13.0','2026-11-04',['업데이트 로그 창 추가'])]);
 assert.deepEqual(searchUpdateLog(log,'eslint').map(e=>e.version),['1.12.0'],'case-insensitive');
 assert.equal(searchUpdateLog(log,'없는 기능').length,0);assert.equal(searchUpdateLog(log,'  ').length,3);
});

test('pages hold five releases and the page number is clamped',()=>{
 const log=Array.from({length:12},(_,i)=>entry(`1.0.${i}`,'2026-10-01'));
 assert.equal(UPDATE_LOG_PAGE_SIZE,5);
 assert.deepEqual(updateLogPage(log,1).entries.map(e=>e.version),['1.0.0','1.0.1','1.0.2','1.0.3','1.0.4']);
 assert.deepEqual(updateLogPage(log,3),{page:3,pages:3,entries:log.slice(10)});
 assert.equal(updateLogPage(log,9).page,3);assert.equal(updateLogPage(log,0).page,1);assert.deepEqual(updateLogPage([],1),{page:1,pages:1,entries:[]});
});

test('the update log data has every version once, dated, with items, including the current version',()=>{
 const versions=UPDATE_LOG.map(e=>e.version),pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(new Set(versions).size,versions.length);assert.ok(versions.includes(pkg.version),pkg.version);
 for(const e of UPDATE_LOG){assert.match(e.version,/^\d+\.\d+\.\d+$/);assert.match(e.date,/^\d{4}-\d{2}-\d{2}$/,e.version);assert.ok(e.items.length>0&&e.items.every(i=>typeof i==='string'&&i.trim()),e.version);}
 assert.equal(sortUpdateLog(UPDATE_LOG)[0].version,pkg.version,'the current version is the newest');
});
