const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results'),mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.json':'application/json'};
 const server=http.createServer(async(req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('.monaco-editor');
  const {halExample}=await import('../src/hal-examples.js'),p=halExample('blink');await page.locator('#file-input').setInputFiles({name:'visual.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  for(const theme of ['dark','light']){
   await page.emulateMedia({colorScheme:theme});await page.waitForFunction(theme=>document.documentElement.dataset.ideTheme===theme,theme);await page.screenshot({path:path.join(out,'controls-'+theme+'.png')});
   await page.click('#board-reset');assert.equal(await page.locator('#board-reset-dialog').isVisible(),true);await page.screenshot({path:path.join(out,'board-reset-'+theme+'.png')});await page.keyboard.press('Escape');
   await page.locator('[data-panel="terminal"] .dock-heading').focus();await page.keyboard.press('Shift+F10');await page.screenshot({path:path.join(out,'panel-move-'+theme+'.png')});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1024,height:640});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'controls-compact.png')});console.log('Dark/light/reset/panel move and 1024px visual checks passed');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
