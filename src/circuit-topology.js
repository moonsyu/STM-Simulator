import {catalogTies} from './catalog-topology.js';
import {terminalKeys,attachments} from './components.js';
import {PINS,circuitHoles} from './pins.js';
import {UnionFind} from './engine.js';

export function wiringTopology(project){
 const uf=new UnionFind();for(const p of (project.surfaces?.board?.hidden?[]:PINS))if(p.signal!=='NC')uf.join(p.id,'signal:'+(p.signal==='AGND'?'GND':p.signal));for(const h of circuitHoles(project.components,project.surfaces))uf.join(h.id,h.bus);
 for(const p of project.components){for(const key of terminalKeys(p)){const id=`part:${p.id}:${key}`;uf.find(id);if(attachments(p)[key])uf.join(id,attachments(p)[key]);}if(p.type==='button'){uf.join(`part:${p.id}:a`,`part:${p.id}:c`);uf.join(`part:${p.id}:b`,`part:${p.id}:d`);}if(p.type==='sevenseg')uf.join(`part:${p.id}:p3`,`part:${p.id}:p8`);}
 for(const w of project.wires)uf.join(w.from,w.to);for(const [a,b]of project.components.flatMap(catalogTies))uf.join(a,b);return uf;
}
