// Reach regrouped controls exactly as a user would, through their real openers.
// This helper deliberately does not force-click or change application DOM state.
async function revealUiControl(page,selector){
 const target=page.locator(selector).first();
 await target.waitFor({state:'attached'});
 for(let attempt=0;attempt<8;attempt++){
  const opener=await target.evaluate(el=>{
   const actions=[];
   for(let p=el;p;p=p.parentElement){
    if(p.tagName==='DETAILS'&&!p.open){
     if(!p.id)throw new Error('Closed details requires a stable ID for its real opener');
     actions.push('#'+CSS.escape(p.id)+' > summary');
    }else if(p.hasAttribute('popover')&&!p.matches(':popover-open')){
     if(!p.id)throw new Error('Closed popover requires a stable ID for its real opener');
     actions.push('[aria-controls="'+CSS.escape(p.id)+'"]');
    }
   }
   return actions.at(-1)||null;
  });
  if(!opener){await target.waitFor({state:'visible'});return target;}
  await page.locator(opener).click();
  // Native details toggle dispatches in a subsequent task, before its popover
  // becomes visible. Give that real transition time before inspecting again.
  await target.waitFor({state:'visible',timeout:500}).catch(()=>{});
 }
 throw new Error('Control remained hidden after opening its UI ancestors: '+selector);
}
async function clickUiControl(page,selector,options){const control=await revealUiControl(page,selector);await control.click(options);}
exports.revealUiControl=revealUiControl;
exports.clickUiControl=clickUiControl;
