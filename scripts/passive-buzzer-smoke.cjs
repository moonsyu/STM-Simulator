const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const {chooseHal,openFixture}=require('./smoke-fixture.cjs');

(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results');await fs.mkdir(out,{recursive:true});
  const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'passive-buzzer-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  // The same renderer can be checked without Electron by serving dev:web.
  const web=!!process.env.LAB_WEB_URL,portable=!web&&process.env.LAB_PORTABLE_EXE;
  const renderer=web?'web':portable?'portable':'electron';
  let app,child,page;
  try{
    if(portable){
      delete env.CIRCUIT_LAB_SMOKE;
      child=spawn(portable,['--remote-debugging-port=0'],{cwd:root,env,windowsHide:true,stdio:'ignore'});
      let launchError;child.on('error',error=>launchError=error);
      let port;for(let i=0;i<160;i++){
        if(launchError)throw launchError;
        try{port=(await fs.readFile(path.join(env.CIRCUIT_LAB_TEST_PROFILE,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}
      }
      if(!port)throw new Error('Portable application did not expose its test port.');
      app=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=app.contexts()[0].pages()[0];
    }else{
      app=web?await chromium.launch({channel:process.env.LAB_BROWSER_CHANNEL||'msedge',headless:true}):await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
      page=web?await app.newPage({viewport:{width:1540,height:1020}}):await app.firstWindow();
    }
    const errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.buzzerProbe={oscillators:[],gains:[]};
      for(const [method,key]of [['createOscillator','oscillators'],['createGain','gains']]){
        const original=AudioContext.prototype[method];
        AudioContext.prototype[method]=function(...args){const node=original.apply(this,args);window.buzzerProbe[key].push(node);return node;};
      }
    });
    if(web)await page.goto(process.env.LAB_WEB_URL);else await page.reload();
    await page.waitForSelector('.monaco-editor');
    if(!web&&!portable)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
    for(const query of ['수동 부저','passive buzzer','piezo']){
      await page.fill('#part-search',query);assert.equal(await page.locator('[data-add="passive_buzzer"]:visible').count(),1);
    }
    await page.click('[data-add="passive_buzzer"]');
    const spot=await page.locator('#circuit').evaluate(svg=>{const pt=svg.createSVGPoint();pt.x=540;pt.y=180;const s=pt.matrixTransform(svg.getScreenCTM());return {x:s.x,y:s.y};});
    await page.mouse.click(spot.x,spot.y);
    assert.equal(await page.locator('.buzzer-frequency').count(),1);
    await chooseHal(page,'passive_buzzer');
    const {halExample,applyHalExample}=await import('../src/hal-examples.js');
    const mounted=applyHalExample({name:'Passive buzzer'},'passive_buzzer');
    assert.equal(await page.locator('#connection-count').innerText(),`부품 1개 · 배선 ${mounted.wires.length}개`);
    assert.ok(mounted.wires.every(w=>!w.from.startsWith('part:')&&!w.to.startsWith('part:')));
    assert.equal(await page.locator('#pwm-waveform').isChecked(),true);
    await clickUiControl(page, '#firmware-check');assert.match(await page.locator('#build-status').innerText(),/통과/);
    const select=async()=>page.locator('#part-layer [data-part="demo"] .part-body').click();
    await select();await clickUiControl(page, '#sound');await page.click('#run');
    const pitch=hz=>page.waitForFunction(hz=>window.buzzerProbe.oscillators.some(o=>o.type==='square'&&Math.abs(o.frequency.value-hz)<2)&&window.buzzerProbe.gains.some(g=>g.gain.value>.01),hz);
    await pitch(523);assert.equal(await page.locator('.buzzer-wave').getAttribute('opacity'),'1');assert.match(await page.locator('#part-live').innerText(),/Hz.*듀티/);
    await page.screenshot({path:path.join(out,'passive-buzzer-'+renderer+'-running.png')});
    await pitch(587);assert.match(await page.locator('#console-output').innerText(),/Passive buzzer: rest/);
    const silent=()=>page.waitForFunction(()=>window.buzzerProbe.gains.every(g=>g.gain.value<.0001));
    await clickUiControl(page, '#sound');assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');await silent();
    await clickUiControl(page, '#sound');await page.waitForFunction(()=>window.buzzerProbe.gains.some(g=>g.gain.value>.01));
    await page.click('#run');await silent();assert.equal(await page.locator('.buzzer-frequency').textContent(),'무음');
    await clickUiControl(page, '#step');await silent();assert.equal(await page.locator('#run-status').innerText(),'한 단계 실행');
    await page.click('#run');await silent(); // finish the paused session

    const dc=halExample('passive_buzzer');dc.wires[0].from=(await import('../src/pins.js')).boardPin('3V3');
    await openFixture(page,dc);await select();await page.click('#run');
    await page.waitForFunction(()=>parseFloat(document.getElementById('sim-time').textContent)>.12);
    assert.equal(await page.locator('.buzzer-frequency').textContent(),'무음');assert.equal(await page.locator('.buzzer-wave').getAttribute('opacity'),'0');await silent();
    await page.click('#run');await chooseHal(page,'passive_buzzer');
    await page.waitForFunction(expected=>{
      const saved=JSON.parse(localStorage.getItem('stm32lab.project.v2'));
      return saved?.components[0]?.type==='passive_buzzer'&&saved.wires[0].from===expected.wires[0].from&&saved.code===expected.code;
    },mounted);
    await page.reload();await page.waitForSelector('.buzzer-frequency');await select();
    assert.match(await page.locator('#inspector').innerText(),/수동 피에조 부저/);
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
    const checks=['passive buzzer Korean/English search and placement','HAL melody circuit, pin setup and code check','measured pitch and duty display','real WebAudio 523/587 Hz output and rest logs','mute/unmute and stop/step silence','DC supply produces no sustained sound','passive buzzer persists after reload'];
    await fs.writeFile(path.join(out,'passive-buzzer-'+renderer+'-smoke.json'),JSON.stringify({passed:true,renderer,checks,errors},null,2));
    console.log('Passive buzzer UI/audio smoke passed ('+renderer+').');
  }finally{
    if(portable&&page)await page.evaluate(()=>window.close()).catch(()=>{});
    if(app)await app.close();
    if(child){await new Promise(resolve=>setTimeout(resolve,1500));if(child.exitCode===null)child.kill();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
