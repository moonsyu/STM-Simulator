// Inspect downloaded release executables using isolated profiles. No installation.
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const {_electron,chromium}=require('playwright');
const {launch,terminate}=require('../../desktop/process-tools.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'work/test-results/project-audit-0238'),cache=path.join(root,'work/release-audit/0.23.8');
async function inspect(page){
 await page.waitForSelector('.monaco-editor');
 const state=await page.evaluate(()=>window.appUpdates.state());
 if(state.phase!=='unsupported')await page.evaluate(()=>window.appUpdates.configure(false));
 const semantics=await page.evaluate(async()=>{
  const {compileHal}=await import(new URL('src/hal-source.js',location.href));
  const {Runtime}=await import(new URL('src/runtime.js',location.href));
  const {HAL_CONSTANTS}=await import(new URL('src/hal.js',location.href));
  const r=new Runtime(compileHal('struct R {float v;uint16_t raw;};double result=0;int main(void){result=sizeof(struct R);return 0;}'),{constants:HAL_CONSTANTS});r.tick(0);return {sizeofStruct:r.vars.result,expected:8};
 });
 return {state,semantics};
}
(async()=>{
 const profile=await fs.mkdtemp(path.join(out,'release-runtime-')),results={};
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(profile,'zip')};delete env.ELECTRON_RUN_AS_NODE;delete env.PORTABLE_EXECUTABLE_FILE;delete env.PORTABLE_EXECUTABLE_DIR;
 try{
  const app=await _electron.launch({executablePath:path.join(cache,'zip-unpacked/STM Simulator.exe'),args:[],cwd:cache,env});
  try{results.zip=await inspect(await app.firstWindow());}finally{await app.close();}
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  env.CIRCUIT_LAB_TEST_PROFILE=path.join(profile,'portable');
  const child=launch(path.join(cache,'STM-Simulator.exe'),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});let browser;
  try{
   let ready=false;for(let i=0;i<250;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
   if(!ready)throw Error('Portable startup timeout');
   browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];results.portable=await inspect(page);await page.evaluate(()=>window.close()).catch(()=>{});
  }finally{if(browser)await browser.close().catch(()=>{});await terminate(child);}
 }finally{
  await fs.writeFile(path.join(out,'release-runtime.json'),JSON.stringify(results,null,2));
  if(path.dirname(profile)!==out||!path.basename(profile).startsWith('release-runtime-'))throw Error('Unsafe profile cleanup');await fs.rm(profile,{recursive:true,force:true});
 }
 console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
