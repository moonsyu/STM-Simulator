// Public standalone and ZIP executables, isolated profiles, real renderer and close/reopen.
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{launch,terminate}=require('../desktop/process-tools.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve(__dirname,'..'),version=require('../package.json').version,out=path.join(root,'work/test-results'),cache=path.join(root,'work/release-audit',version);
 const profile=await fs.mkdtemp(path.join(out,'public-runtime-')),results=[];
 for(const [kind,exe]of [['standalone',path.join(cache,'STM-Simulator.exe')],['zip',path.join(cache,'zip-portable/STM-Simulator.exe')]]){
  let browser,child,page;
  const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(profile,kind)};delete env.ELECTRON_RUN_AS_NODE;delete env.PORTABLE_EXECUTABLE_FILE;delete env.PORTABLE_EXECUTABLE_DIR;
  async function open(){
   const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
   child=launch(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,cwd:cache});
   let ready=false;for(let i=0;i<300;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok){ready=true;break;}}catch{}await wait(200);}assert.ok(ready,'Portable startup: '+kind);
   browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];await page.waitForSelector('.monaco-editor');
  }
  try{
   await open();const state=await page.evaluate(()=>window.appUpdates.state());assert.equal(state.currentVersion,version);assert.notEqual(state.phase,'unsupported');await page.evaluate(()=>window.appUpdates.configure(false));
   const semantics=await page.evaluate(async()=>{
    const {compileHal}=await import(new URL('src/hal-source.js',location.href)),{Runtime}=await import(new URL('src/runtime.js',location.href));
    const cases=[['padding','struct R{float v;uint16_t raw;};','result=sizeof(struct R);',8],['sizeof','', 'int i=1;result=sizeof(i++)*100+i;',401],['float-pointer','','float a[1]={5};float *p=a;result=p[0]/2;',2.5],['comparison','','result=(1.0<2.0)/2;',0],['unsigned','','uint32_t x=0xffffffffU;result=x+1U;',0],['enum','enum E{A=1<<3,B};','result=B;',9],['octal','','result=010;',8]];
    return cases.map(([name,global,body,expected])=>{const r=new Runtime(compileHal(global+'double result;int main(void){'+body+'return 0;}'));r.tick(0);return {name,expected,actual:r.vars.result};});
   });assert.ok(semantics.every(row=>row.expected===row.actual));
   const marker='int main(void){return 239;} // latest close '+kind;
   await page.evaluate(code=>{const el=document.getElementById('code');el.value=code;el.dispatchEvent(new Event('input',{bubbles:true}));window.close();},marker).catch(error=>{if(!/closed/i.test(error.message))throw error;});
   for(let i=0;i<150&&child.exitCode===null;i++)await wait(100);assert.notEqual(child.exitCode,null,'Normal close must exit');await browser.close().catch(()=>{});browser=null;
   await open();assert.equal(await page.locator('#code').inputValue(),marker);
   results.push({kind,version,updaterSupported:true,semantics,closeRestoredLatest:true,passed:true});
   await page.evaluate(()=>window.close()).catch(()=>{});
  }finally{if(browser)await browser.close().catch(()=>{});if(child)await terminate(child);}
 }
 await fs.writeFile(path.join(out,'release-runtime-'+version+'.json'),JSON.stringify({passed:true,results},null,2));
 if(path.dirname(profile)!==out||!path.basename(profile).startsWith('public-runtime-'))throw Error('Unsafe cleanup');await fs.rm(profile,{recursive:true,force:true});console.log(JSON.stringify({passed:true,version,executables:results.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
