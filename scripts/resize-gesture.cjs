async function handlePoints(page){return page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#resize-layer rect[data-resize-handle]')].map(el=>{const b=el.getBoundingClientRect();return [el.dataset.resizeHandle,{x:b.x+b.width/2,y:b.y+b.height/2}];})));}
async function resizeDevice(page,target,xFactor,yFactor,{handle='se',shift=false,cancel=false}={}){
 await page.selectOption('#resize-target',target);
 await page.waitForSelector('#resize-layer rect[data-resize-handle="'+handle+'"]');
 const p=await handlePoints(page),start=p[handle];
 const dx={x:(p.ne.x-p.nw.x)*(xFactor-1)*(handle.includes('w')?-1:1),y:(p.ne.y-p.nw.y)*(xFactor-1)*(handle.includes('w')?-1:1)};
 const dy={x:(p.sw.x-p.nw.x)*(yFactor-1)*(handle.includes('n')?-1:1),y:(p.sw.y-p.nw.y)*(yFactor-1)*(handle.includes('n')?-1:1)};
 await page.mouse.move(start.x,start.y);if(shift)await page.keyboard.down('Shift');await page.mouse.down();
 await page.mouse.move(start.x+dx.x+dy.x,start.y+dx.y+dy.y,{steps:5});
 if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');
 await page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');
}
module.exports={resizeDevice,handlePoints};
