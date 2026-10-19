// The current active class remains the application source of truth.
export function setupTabAccessibility(){
  const groups=[
    ['.panel-tabs','data-tab',name=>({code:'code-panel',inspect:'inspect-panel',settings:'ide-settings-panel',docs:'device-docs-panel'})[name],'편집기 보기'],
    ['.monitor-tabs','data-monitor',name=>name==='log'?'log-panel':name+'-panel','실행 모니터'],
    ['#source-tabs','data-source',()=>'source-editor-panel','소스 파일']
  ];
  const output=document.getElementById('console-output');
  const wrapper=document.createElement('section');wrapper.id='log-panel';output.before(wrapper);wrapper.append(output);
  document.querySelector('.editor-wrap').id='source-editor-panel';
  for(const [selector,attribute,panelFor,label] of groups){
    const group=document.querySelector(selector);if(!group)continue;
    group.setAttribute('role','tablist');group.setAttribute('aria-label',label);
    const update=()=>{
      const tabs=[...group.querySelectorAll(`[${attribute}]`)];
      for(const [i,button] of tabs.entries()){
        const active=button.classList.contains('active'),panel=document.getElementById(panelFor(button.getAttribute(attribute)));
        button.id||=(attribute+'-'+i);button.setAttribute('role','tab');button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
        if(panel){button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');if(active)panel.setAttribute('aria-labelledby',button.id);}
      }
      if(attribute==='data-monitor')wrapper.hidden=output.hidden;
    };
    group.addEventListener('keydown',event=>{
      if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=[...group.querySelectorAll(`[${attribute}]:not(:disabled)`)],index=tabs.indexOf(event.target);if(index<0)return;
      event.preventDefault();event.stopPropagation();
      const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
      const name=next.getAttribute(attribute);next.click();update();
      [...group.querySelectorAll(`[${attribute}]`)].find(t=>t.getAttribute(attribute)===name)?.focus();
    });
    new MutationObserver(update).observe(group,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});update();
  }
}
