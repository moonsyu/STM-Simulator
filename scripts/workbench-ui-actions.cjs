// Reach regrouped controls exactly as a user would, through their real openers.
// This helper deliberately does not force-click or change application DOM state.
async function revealUiControl(page,selector){
 const target=page.locator(selector).first();
 await target.waitFor({state:'attached'});
 for(let attempt=0;attempt<8;attempt++){
  if(await target.isVisible())return target;
  const opener=await target.evaluate(el=>{
   const actions=[];
   for(let p=el;p;p=p.parentElement){
    if(p.tagName==='DETAILS'&&!p.open){
     // Docs cards are ordinary native details without IDs. Resolve their
     // observed document position, then click the real direct summary.
     actions.push(p.id?{selector:'#'+CSS.escape(p.id)+' > summary'}:{detailsIndex:[...document.querySelectorAll('details')].indexOf(p)});
    }else if(p.hasAttribute('popover')&&!p.matches(':popover-open')){
     if(!p.id)throw new Error('Closed popover requires a stable ID for its real opener');
     actions.push({selector:'[aria-controls="'+CSS.escape(p.id)+'"]'});
    }
   }
   return actions.at(-1)||null;
  });
  if(!opener){await target.waitFor({state:'visible'});return target;}
  const control=opener.selector?page.locator(opener.selector):page.locator('details').nth(opener.detailsIndex).locator(':scope > summary');
  await control.click();
  // Native details toggle dispatches in a subsequent task, before its popover
  // becomes visible. Give that real transition time before inspecting again.
  await target.waitFor({state:'visible',timeout:500}).catch(()=>{});
 }
 throw new Error('Control remained hidden after opening its UI ancestors: '+selector);
}
async function clickUiControl(page,selector,options){const control=await revealUiControl(page,selector);await control.click(options);}
exports.revealUiControl=revealUiControl;
exports.clickUiControl=clickUiControl;
