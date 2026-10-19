export function zoomView(view,mult,anchor=null){
  const unchanged={...view};
  if(!view||![view.x,view.y,view.w,view.h,mult].every(Number.isFinite)||view.w<=0||view.h<=0||mult<=0)return unchanged;
  if(anchor&&(!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)))return unchanged;
  const w=Math.max(100,view.w*mult),h=view.h*(w/view.w);
  const rx=anchor?(anchor.x-view.x)/view.w:.5,ry=anchor?(anchor.y-view.y)/view.h:.5;
  const x=view.x+(view.w-w)*rx,y=view.y+(view.h-h)*ry;
  if(![x,y,w,h].every(Number.isFinite)||h<=0)return unchanged;
  return {...view,x,y,w,h};
}
