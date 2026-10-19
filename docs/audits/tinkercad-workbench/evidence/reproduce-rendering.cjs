// Independent headless audit; writes only to work/rendering-evidence-reproduction.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../../..'),out=path.join(root,'work/rendering-evidence-reproduction');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHashes=async files=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await fs.readFile(path.join(root,file)))])));

(async()=>{
 const expected=JSON.parse((await fs.readFile(path.join(__dirname,'rendering-summary.json'),'utf8')).replace(/^\uFEFF/,''));
 for(const item of expected.screenshots)assert.equal(hash(await fs.readFile(path.join(__dirname,item.file))),item.sha256,item.file);
 const before=await sourceHashes(Object.keys(expected.sourceHashes));assert.deepEqual(before,expected.sourceHashes,'Run against the captured renderer revision.');
 await fs.mkdir(out,{recursive:true});
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__render_audit'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><body></body>');return;}
  if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.STM_AUDIT_BROWSER?{executablePath:process.env.STM_AUDIT_BROWSER}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1540,height:1000},deviceScaleFactor:1}),errors=[],consoleErrors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base+'/__render_audit');
  const models=await page.evaluate(async()=>{
   const {PART_LIBRARY}=await import('/src/part-library.js'),{PART_DEFS}=await import('/src/components.js'),{partPreview}=await import('/src/part-preview.js'),{renderParts,renderBreadboards,boardSvg,updateSimulationSvg}=await import('/src/render.js');
   const canonical=node=>node.nodeType===1?[node.localName,node.namespaceURI,[...node.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)),[...node.childNodes].map(canonical)]:[node.nodeType,node.nodeValue];
   return Promise.all(PART_LIBRARY.map(async item=>{
    const preview=partPreview(item.type),part={id:'preview',type:item.type,name:'',x:0,y:0,rotation:0,span:70,...PART_DEFS[item.type]?.defaults,...(item.type==='resistor'?{value:330}:{}),...(item.type==='led'?{color:'red'}:{})},project={components:[part],wires:[]};
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.innerHTML='<g>'+(item.type==='board'?boardSvg():item.type==='breadboard'?renderBreadboards(project,null):renderParts(project,null,null,{}))+'</g>';updateSimulationSvg(svg,project,null,{});
    const model=svg.querySelector(':scope > g');model.querySelectorAll('.pin-hit').forEach(n=>n.remove());if(item.type!=='breadboard')model.querySelectorAll(':scope > [data-part] > text').forEach(n=>n.remove());
    const parsed=new DOMParser().parseFromString(decodeURIComponent(preview.src.slice(preview.src.indexOf(',')+1)),'image/svg+xml'),img=new Image();img.src=preview.src;await img.decode();
    return {type:item.type,name:item.name,...preview,matches:JSON.stringify(canonical(parsed.querySelector('svg > g')))===JSON.stringify(canonical(model))};
   }));
  });
  assert.equal(models.length,114);assert.deepEqual(models.filter(m=>!m.matches).map(m=>m.type),[]);
  const sheets={
   'models-01.png':['board','breadboard','lcd','ultrasonic','resistor','led','button','potentiometer','slide','rgb','uart','servo'],
   'models-09.png':['tft','matrix','motor','stepper','relay','joystick','encoder','l298n','dc_motor','dc_supply','i2c','spi']
  };
  for(const [file,types]of Object.entries(sheets)){
   await page.evaluate(async parts=>{
    document.body.replaceChildren();Object.assign(document.body.style,{margin:0,boxSizing:'border-box',height:'100vh',background:'#f3f4ef',color:'#253c2c',padding:'18px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gridTemplateRows:'repeat(3,1fr)',gap:'12px'});
    for(const p of parts){const card=document.createElement('div');Object.assign(card.style,{background:'#fff',border:'1px solid #c9d1c6',padding:'12px',overflow:'hidden'});const title=document.createElement('div');title.textContent=p.name+' · '+p.pins+' pins';title.style.font='13px sans-serif';const img=new Image();img.src=p.src;img.alt=p.type;Object.assign(img.style,{width:'100%',height:'calc(100% - 26px)',objectFit:'contain',marginTop:'8px'});card.append(title,img);document.body.append(card);await img.decode();}
   },types.map(type=>models.find(m=>m.type===type)));
   await page.screenshot({path:path.join(out,file)});
  }
  await page.goto(base+'/docs/device-model-gallery.html');
  const gallery=await page.evaluate(async()=>{
   const {DEVICE_CATALOG}=await import('/src/device-catalog-data.js'),{CATALOG_DEFS,catalogType}=await import('/src/catalog-defs.js'),{renderParts}=await import('/src/render.js');
   const cards=[...document.querySelectorAll('article')],failures=[];
   for(const [i,v]of DEVICE_CATALOG.entries()){
    const card=cards[i],type=catalogType(v.id),def=CATALOG_DEFS[type];
    if(card.querySelector('h2').textContent!==v.name||JSON.stringify([...card.querySelectorAll('details a')].map(a=>a.href))!==JSON.stringify(v.source.map(s=>s.url)))failures.push(v.id+': metadata');
    if(def){const p={id:'gallery',type,name:'',x:0,y:0,rotation:0,span:70,...def.defaults},host=document.createElementNS('http://www.w3.org/2000/svg','svg');host.innerHTML=renderParts({components:[p],wires:[]},null,null,{});host.querySelectorAll('.pin-hit').forEach(n=>n.remove());host.querySelectorAll(':scope > [data-part] > text').forEach(n=>n.remove());if(!host.querySelector('[data-part]').isEqualNode(card.querySelector('[data-part]')))failures.push(v.id+': model');if(card.querySelectorAll('.part-contact').length!==v.pins.length)failures.push(v.id+': contacts');}
   }
   return {cards:cards.length,rendererModels:document.querySelectorAll('article [data-part]').length,failures};
  });
  assert.equal(gallery.cards,80);assert.equal(gallery.rendererModels,78);assert.deepEqual(gallery.failures,[]);
  assert.ok((await page.locator('script').textContent()).includes('.split(/\\s+/)'));
  const searches=[];
  for(const item of expected.search.cases){await page.locator('#search').fill(item.query);const names=await page.locator('article:not([hidden]) h2').allTextContents();assert.equal(names.length,item.matches,item.query);if(item.names)assert.deepEqual(names,item.names,item.query);searches.push({query:item.query,matches:names.length});}
  await page.locator('#search').fill('ADC 3핀');await page.screenshot({path:path.join(out,'gallery-search-adc.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(await sourceHashes(Object.keys(before)),before);
  const report={passed:true,browserVersion:browser.version(),models:{decoded:models.length,previewMatchesLive:models.filter(m=>m.matches).length},gallery,searches,errors,consoleErrors,sourceHashes:before};
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,models:114,galleryCards:80,galleryRendererMatches:78,searches:searches.length,output:'work/rendering-evidence-reproduction'}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
