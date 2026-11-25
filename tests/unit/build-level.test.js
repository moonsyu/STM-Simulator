// Feature 54: 편집 → 설정 → 빌드 수준 — CubeIDE's Optimization level for the Debug and the Release build of a project.
// Both start at None (-O0); a project stores only another level (ide.native.optimization). The levels and their
// checking are in Rust (rust/stm-core/src/build_level.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {BUILD_LEVELS,BUILD_CONFIGURATIONS,DEFAULT_BUILD_LEVEL,buildLevelSettings,buildLevelFlag,withBuildLevel} from '../../src/build-level.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';

const {optimizationFlag}=createRequire(import.meta.url)('../../desktop/native-build.cjs');
const native=(optimization,configuration='Release')=>({target:'simulator',configuration,...(optimization===undefined?{}:{optimization})});
const withNative=(p,n)=>({...p,ide:{breakpoints:[],watches:[],native:n}});

test('the levels are CubeIDE\'s Optimization level list; the default is None (-O0) for Debug and Release',()=>{
 assert.deepEqual(BUILD_LEVELS.map(l=>[l.flag,l.label]),[['-O0','None (-O0)'],['-Og','Optimize for Debug (-Og)'],['-O1','Optimize (-O1)'],['-O2','Optimize more (-O2)'],['-O3','Optimize most (-O3)'],['-Os','Optimize for size (-Os)'],['-Ofast','Optimize for speed (-Ofast)']]);
 assert.deepEqual(BUILD_CONFIGURATIONS,['Debug','Release']);assert.equal(DEFAULT_BUILD_LEVEL,'-O0');
 for(const p of [blankProject(),projectForBoard('nucleo-f103rb'),projectForBoard('fpb-ra6e1')])for(const c of BUILD_CONFIGURATIONS){
  assert.equal(buildLevelFlag(p,c),'-O0');assert.equal(optimizationFlag(p,c),'-O0');
 }
 // A project saved before this version (Release was -Os then) has no stored level: -O0 now.
 const old=validateProject(withNative(blankProject(),native()));
 assert.deepEqual(old.ide.native,{target:'simulator',configuration:'Release'});assert.equal(optimizationFlag(old,'Release'),'-O0');
});

test('a project keeps the level of each configuration; -O0 is not stored',()=>{
 const p=validateProject(withNative(blankProject(),native({Debug:'-Og',Release:'-Os'})));
 assert.deepEqual(p.ide.native,{target:'simulator',configuration:'Release',optimization:{Debug:'-Og',Release:'-Os'}});
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p,'round-trips');
 assert.equal(buildLevelFlag(p,'Debug'),'-Og');assert.equal(buildLevelFlag(p,'Release'),'-Os');
 const one=validateProject(withNative(blankProject(),native({Debug:'-O0',Release:'-O2'})));
 assert.deepEqual(one.ide.native.optimization,{Release:'-O2'});assert.equal(buildLevelFlag(one,'Debug'),'-O0');
 const none=validateProject(withNative(blankProject(),native({Debug:'-O0',Release:'-O0'})));
 assert.equal('optimization' in none.ide.native,false);
 // The same for an FPB-RA6E1 project.
 const ra=validateProject(withNative(projectForBoard('fpb-ra6e1'),native({Release:'-O3'})));
 assert.equal(optimizationFlag(ra,'Release'),'-O3');assert.equal(optimizationFlag(ra,'Debug'),'-O0');
});

test('choosing a level in the settings: stored with the run target, taken out again by None',()=>{
 let n=withBuildLevel({target:'arm',configuration:'Debug'},'Release','-Os');
 assert.deepEqual(n,{target:'arm',configuration:'Debug',optimization:{Release:'-Os'}});
 n=withBuildLevel(n,'Debug','-Og');assert.deepEqual(n.optimization,{Debug:'-Og',Release:'-Os'});
 n=withBuildLevel(n,'Release','-O0');assert.deepEqual(n.optimization,{Debug:'-Og'});
 n=withBuildLevel(n,'Debug','-O0');assert.deepEqual(n,{target:'arm',configuration:'Debug'});
 assert.throws(()=>withBuildLevel(n,'Debug','-O9'),/빌드 수준 설정을 확인하세요/);
});

test('only a level of the list is accepted, and only such a flag reaches the compiler',()=>{
 for(const bad of [{Release:'-O9'},{Release:'-O2 -DX'},{Release:2},{Other:'-O2'},'-O2',['-O2']]){
  assert.throws(()=>buildLevelSettings(bad),/빌드 수준 설정을 확인하세요/,JSON.stringify(bad));
  assert.throws(()=>validateProject(withNative(blankProject(),native(bad))),/빌드 수준 설정을 확인하세요/,JSON.stringify(bad));
 }
 assert.deepEqual(buildLevelSettings(null),{});assert.deepEqual(buildLevelSettings(undefined),{});
 // The build (main process) reads the project it is given: it takes exactly the levels Rust accepts.
 for(const {flag}of BUILD_LEVELS)for(const c of BUILD_CONFIGURATIONS){
  const p=withNative(blankProject(),native({[c]:flag}));
  assert.equal(optimizationFlag(p,c),flag);assert.equal(buildLevelFlag(p,c),flag);
 }
 for(const bad of ['-O9','-O2 -DX','O2','-o2','',null,2,['-O2']]){
  const p=withNative(blankProject(),native({Release:bad}));
  assert.equal(optimizationFlag(p,'Release'),'-O0',String(bad));assert.equal(buildLevelFlag(p,'Release'),'-O0',String(bad));
 }
 assert.equal(optimizationFlag(undefined,'Release'),'-O0');assert.equal(optimizationFlag({},'Release'),'-O0');
});
