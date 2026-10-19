// Round only the drawn corners. Stored bend coordinates and electrical endpoints
// stay unchanged, so routing handles, circuit files and hit paths share one route.
export function roundedWirePath(points,radius=6){
 if(!Array.isArray(points)||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return '';
 const route=points.filter((p,i)=>i===0||p.x!==points[i-1].x||p.y!==points[i-1].y);
 if(!route.length)return '';
 const round=Number.isFinite(radius)?Math.max(0,radius):0;
 let path=`M${route[0].x} ${route[0].y}`;
 for(let i=1;i<route.length-1;i++){
  const previous=route[i-1],corner=route[i],next=route[i+1];
  const ax=corner.x-previous.x,ay=corner.y-previous.y,bx=next.x-corner.x,by=next.y-corner.y;
  const before=Math.hypot(ax,ay),after=Math.hypot(bx,by),trim=Math.min(round,before/2,after/2);
  // Keep straight runs and reversals exact; neither has a useful curved corner.
  const cross=(ax/before)*(by/after)-(ay/before)*(bx/after);
  if(!trim||!Number.isFinite(before)||!Number.isFinite(after)||Math.abs(cross)<1e-10){path+=` L${corner.x} ${corner.y}`;continue;}
  const enter={x:corner.x-ax/before*trim,y:corner.y-ay/before*trim},leave={x:corner.x+bx/after*trim,y:corner.y+by/after*trim};
  path+=` L${enter.x} ${enter.y} Q${corner.x} ${corner.y} ${leave.x} ${leave.y}`;
 }
 if(route.length>1){const end=route.at(-1);path+=` L${end.x} ${end.y}`;}
 return path;
}
