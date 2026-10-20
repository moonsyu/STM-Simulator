import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,applyExample,contrast} from './harness.mjs';

const SELECTORS=['.menubar-item','#sidebar-title','#project-name','#save-state','#source-tabs button','.group-tab #mode-label','.group-tab #canvas-board-name','.monitor-tabs button','.statusbar .status-item','#file-tree button','.project-folder-note','#inspector h2','#inspector p','.workspace-toolbar .tool','#hint','.log-line','.part-card strong','.part-card small','.example-item strong','#run'];
async function measure(win){
 return win.evaluate(selectors=>{
  const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const [r,g,b,a=1]=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return {rgb:[r,g,b],a};};
  const bg=el=>{for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0.5)return c.rgb;}return [255,255,255];};
  const out=[];
  for(const s of selectors)for(const el of [...document.querySelectorAll(s)].slice(0,4)){
   if(!el.getClientRects().length||!el.textContent.trim())continue;const st=getComputedStyle(el);if(st.visibility==='hidden'||Number(st.opacity)<.9||el.closest('[hidden],:disabled'))continue;
   out.push({s,text:el.textContent.trim().slice(0,30),fg:parse(st.color).rgb,bg:bg(el)});
  }
  return out;
 },SELECTORS);
}
for(const theme of ['dark','light'])test(`${theme} theme keeps workbench text readable (WCAG AA)`,{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'LCD 1602');
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  if(await win.evaluate(()=>document.documentElement.dataset.ideTheme)!==theme)await win.click('#appearance-toggle');
  assert.equal(await win.evaluate(()=>document.documentElement.dataset.ideTheme),theme);
  const rows=await measure(win);assert.ok(rows.length>25,'measured '+rows.length);
  const bad=rows.map(r=>({...r,ratio:contrast(r.fg,r.bg)})).filter(r=>r.ratio<4.5);
  assert.deepEqual(bad.map(r=>`${r.s} "${r.text}" ${r.ratio.toFixed(2)}`),[]);
  // The editor colorscheme is independent of the workbench theme.
  const editorBg=await win.evaluate(()=>getComputedStyle(document.querySelector('.monaco-editor .monaco-editor-background')).backgroundColor);
  assert.ok(editorBg);
 }finally{await s.close();}
});

test('System appearance follows the OS and the toggle pins Dark/White',{timeout:60000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('#appearance-system');
  assert.equal(await win.evaluate(()=>document.documentElement.dataset.appearance),'system');
  const first=await win.evaluate(()=>document.documentElement.dataset.ideTheme);
  await win.click('#appearance-toggle');
  assert.notEqual(await win.evaluate(()=>document.documentElement.dataset.ideTheme),first);
  assert.notEqual(await win.evaluate(()=>document.documentElement.dataset.appearance),'system');
 }finally{await s.close();}
});
