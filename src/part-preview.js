import {PART_DEFS,terminalKeys} from './components.js';
import {initSvg,renderParts,renderBreadboards,boardSvg} from './render.js';

const cache=new Map();
let drawing,definitions;

export function partPreview(type){
  if(cache.has(type))return cache.get(type);
  if(!drawing){
    const host=document.createElement('div');host.setAttribute('aria-hidden','true');
    Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'800px',height:'800px',visibility:'hidden',pointerEvents:'none'});
    const shadow=host.attachShadow({mode:'closed'});drawing=document.createElementNS('http://www.w3.org/2000/svg','svg');drawing.setAttribute('width','800');drawing.setAttribute('height','800');shadow.append(drawing);document.body.append(host);
    // Shadow DOM isolates model selectors and SVG definitions from the live circuit.
    initSvg(drawing);definitions=drawing.querySelector('defs').outerHTML;
  }
  const part={id:'preview',type,name:'',x:0,y:0,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='resistor'?{value:330}:{}),...(type==='led'?{color:'red'}:{})};
  const project={components:[part],wires:[]};
  drawing.innerHTML=definitions+`<g>${type==='board'?boardSvg():type==='breadboard'?renderBreadboards(project,null):renderParts(project,null,null,{})}</g>`;
  const model=drawing.querySelector(':scope > g');model.querySelectorAll('.pin-hit').forEach(node=>node.remove());
  if(type!=='breadboard')model.querySelectorAll(':scope > [data-part] > text').forEach(node=>node.remove());
  const box=model.getBBox(),padding=8,viewBox=[box.x-padding,box.y-padding,Math.max(1,box.width)+padding*2,Math.max(1,box.height)+padding*2].join(' ');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Math.max(1,box.width)+padding*2}" height="${Math.max(1,box.height)+padding*2}">${definitions}${model.outerHTML}</svg>`;
  const preview={src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),viewBox,pins:type==='board'?108:type==='breadboard'?400:terminalKeys(part).length};cache.set(type,preview);return preview;
}
