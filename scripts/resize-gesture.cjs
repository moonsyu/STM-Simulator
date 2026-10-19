async function handlePoints(page){return page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#resize-layer rect[data-resize-handle]')].map(el=>{const b=el.getBoundingClientRect();return [el.dataset.resizeHandle,{x:b.x+b.width/2,y:b.y+b.height/2}];})));}
async function resizeDevice(page,target,xFactor,yFactor,{handle='se',shift=false,cancel=false}={}){
 await page.selectOption('#resize-target',target);
 await page.waitForSelector('#resize-layer rect[data-resize-handle="'+handle+'"]');
 // Selecting a device fits the canvas and can resize its inspector. Measure
 // pointer coordinates only after those frame/ResizeObserver updates settle.
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  let previous='',stable=0,frames=0;
  const sample=()=>{const current=[...document.querySelectorAll('#resize-layer rect[data-resize-handle]')].map(el=>{const b=el.getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(n=>n.toFixed(3)).join(',');}).join('|');stable=current&&current===previous?stable+1:0;previous=current;if(stable>=3)return resolve();if(++frames>120)return reject(Error('Resize frame did not settle'));requestAnimationFrame(sample);};sample();
 }));
 const p=await handlePoints(page),start=await page.evaluate(handle=>{const el=document.querySelector('#resize-layer rect[data-resize-handle="'+handle+'"]'),b=el.getBoundingClientRect();for(const x of [.5,.2,.8])for(const y of [.5,.2,.8]){const p={x:b.x+b.width*x,y:b.y+b.height*y};if(document.elementFromPoint(p.x,p.y)?.closest('[data-resize-handle]')?.dataset.resizeHandle===handle)return p;}return null;},handle);
 if(!start)throw new Error('Resize handle is fully covered: '+target+' '+handle);
 const dx={x:(p.ne.x-p.nw.x)*(xFactor-1)*(handle.includes('w')?-1:1),y:(p.ne.y-p.nw.y)*(xFactor-1)*(handle.includes('w')?-1:1)};
 const dy={x:(p.sw.x-p.nw.x)*(yFactor-1)*(handle.includes('n')?-1:1),y:(p.sw.y-p.nw.y)*(yFactor-1)*(handle.includes('n')?-1:1)};
 await page.mouse.move(start.x,start.y);if(shift)await page.keyboard.down('Shift');await page.mouse.down();
 await page.mouse.move(start.x+dx.x+dy.x,start.y+dx.y+dy.y,{steps:5});
 if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');
 await page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');
}
module.exports={resizeDevice,handlePoints};
