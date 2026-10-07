export const PANELS = ['project', 'code', 'simulator', 'terminal'];
export const DEFAULT_LAYOUT = {axis:'x',ratio:.16,a:'project',b:{axis:'y',ratio:.72,a:{axis:'x',ratio:.55,a:'code',b:'simulator'},b:'terminal'}};
export function layoutPanels(node) { return typeof node==='string'?[node]:[...layoutPanels(node.a),...layoutPanels(node.b)]; }
export function validateLayout(value) {
  const seen=new Set();
  function visit(n,depth=0) {
    if(typeof n==='string'){if(!PANELS.includes(n)||seen.has(n))throw new Error('Invalid panel');seen.add(n);return n;}
    if(!n||depth>4||!['x','y'].includes(n.axis)||!Number.isFinite(n.ratio)||n.ratio<.01||n.ratio>.99)throw new Error('Invalid split');
    return {axis:n.axis,ratio:n.ratio,a:visit(n.a,depth+1),b:visit(n.b,depth+1)};
  }
  const tree=visit(value);if(seen.size!==PANELS.length)throw new Error('Missing panel');return tree;
}
export function omitPanel(tree,id) {
  if(typeof tree==='string')return tree===id?null:tree;
  const a=omitPanel(tree.a,id),b=omitPanel(tree.b,id);return !a?b:!b?a:{...tree,a,b};
}
export function movePanel(tree,source,target,edge) {
  if(source===target)return tree;
  if(!PANELS.includes(source)||!PANELS.includes(target)||!['left','right','top','bottom'].includes(edge))throw new Error('Invalid docking target');
  const first=['left','top'].includes(edge),axis=['left','right'].includes(edge)?'x':'y';
  const place=n=>typeof n==='string'?(n===target?{axis,ratio:.5,a:first?source:target,b:first?target:source}:n):{...n,a:place(n.a),b:place(n.b)};
  return validateLayout(place(omitPanel(tree,source)));
}
