// Bend points belong to an unfinished wire; no electrical connection exists until its second endpoint.
export class WireDraft {
 constructor(){this.reset();}
 reset(start=null){this.start=start;this.points=[];}
 sync(start){if(this.start!==start)this.reset(start);}
 add(start,point){this.sync(start);if(!start)return false;if(this.points.length>=32)throw new Error('배선 꺾임점은 32개까지 추가할 수 있습니다.');if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('배선 좌표를 확인하세요.');const p={x:point.x,y:point.y},last=this.points.at(-1);if(!last||Math.hypot(last.x-p.x,last.y-p.y)>1)this.points.push(p);return true;}
 back(){return this.points.pop();}
 path(start,a,b){this.sync(start);return [a,...this.points,b].map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');}
 finish(start){this.sync(start);const points=this.points.map(p=>({...p}));this.reset();return points.length?{points}:{};}
}
