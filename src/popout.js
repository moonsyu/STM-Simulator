// Panels opened in their own window (⧉ in a panel header) stay part of this page: their DOM is moved into a blank
// same-origin window, so every listener, the editor and the simulator keep running here. This module must be the
// first import of app.js: it lets this document's lookups find elements in those windows, and gives them the
// keyboard listeners the app registers on window/document.
const children=new Set();
const proto=Document.prototype,ownGet=proto.getElementById,ownOne=proto.querySelector,ownAll=proto.querySelectorAll;
const activeGet=Object.getOwnPropertyDescriptor(proto,'activeElement').get;
let focused=null;
const inChildren=find=>{for(const w of children){const found=find(w.document);if(found)return found;}return null;};
document.getElementById=function(id){return ownGet.call(this,id)??inChildren(d=>ownGet.call(d,id));};
document.querySelector=function(selector){return ownOne.call(this,selector)??inChildren(d=>ownOne.call(d,selector));};
document.querySelectorAll=function(selector){const list=[...ownAll.call(this,selector)];for(const w of children)list.push(...ownAll.call(w.document,selector));return list;};
// Shortcut handlers ask document.activeElement (e.g. "is the focus in the code editor?").
Object.defineProperty(document,'activeElement',{configurable:true,get(){return focused&&!focused.closed?activeGet.call(focused.document):activeGet.call(document);}});
window.addEventListener('focus',()=>{focused=null;});

// Keyboard and clipboard listeners registered on window/document also listen in every panel window.
const SHARED=new Set(['keydown','keyup','copy','cut','paste']),shared=[];
for(const [target,object] of [['window',window],['document',document]]){
 const add=object.addEventListener.bind(object);
 object.addEventListener=(type,listener,options)=>{add(type,listener,options);if(!SHARED.has(type))return;shared.push({target,type,listener,options});for(const w of children)(target==='window'?w:w.document).addEventListener(type,listener,options);};
}

// Theme, fonts and editor colours live on <html>/<body> attributes and in style sheets: mirror them.
function mirror(w){
 const copy=(from,to)=>{for(const a of [...to.attributes])if(!from.hasAttribute(a.name))to.removeAttribute(a.name);for(const a of from.attributes)to.setAttribute(a.name,a.value);};
 copy(document.documentElement,w.document.documentElement);copy(document.body,w.document.body);w.document.body.classList.add('popout-body');
}
function copyStyles(w){
 const head=w.document.head;
 for(const node of ownAll.call(document,'head link[rel=stylesheet],head style')){const clone=node.tagName==='LINK'?Object.assign(w.document.createElement('link'),{rel:'stylesheet',href:node.href}):w.document.createElement('style');if(node.tagName==='STYLE')clone.textContent=node.textContent;head.append(clone);}
}

/** Opens `node` (a dock unit) in its own window; `onClose` runs once the window closes and gets the node back. */
export function openUnitWindow(id,label,node,onClose){
 const r=node.getBoundingClientRect(),w=window.open('','stm-unit-'+id,`width=${Math.round(Math.max(720,r.width||0))},height=${Math.round(Math.max(520,r.height||0))}`);
 if(!w)return null;
 w.document.open();w.document.write(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${label} · STM Simulator</title></head><body></body></html>`);w.document.close();
 copyStyles(w);mirror(w);
 const observer=new MutationObserver(()=>mirror(w));observer.observe(document.documentElement,{attributes:true});observer.observe(document.body,{attributes:true});
 // Styles added later (editor themes, generated rules) follow too.
 const styles=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.tagName==='STYLE'){const c=w.document.createElement('style');c.textContent=n.textContent;w.document.head.append(c);}});styles.observe(document.head,{childList:true});
 w.document.body.append(node);
 children.add(w);
 for(const {target,type,listener,options} of shared)(target==='window'?w:w.document).addEventListener(type,listener,options);
 w.addEventListener('focus',()=>{focused=w;});
 w.addEventListener('resize',()=>window.dispatchEvent(new Event('resize')));
 let done=false;
 const close=()=>{if(done)return;done=true;observer.disconnect();styles.disconnect();children.delete(w);if(focused===w)focused=null;onClose();};
 w.addEventListener('pagehide',close);w.addEventListener('beforeunload',close);
 requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 return w;
}
