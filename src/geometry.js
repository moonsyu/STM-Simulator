export const BOARD={x:45,y:48,w:440,h:532};
export const BB={x:632,y:68,w:342,h:538,startY:128,step:14};
// Full-size 830-point board in its own local frame: 63 columns, two 5-row blocks, rails top and bottom.
export const FULL_BB={x:0,y:0,w:948,h:304,left:40,step:14,columns:63,rows:{a:78,f:176},rails:{T:[24,38],B:[266,280]}};
export const MIN_SCALE=.001,MAX_SCALE=1000;
export const scaleOf=value=>value?.scale??1;
export const scaleXOf=value=>value?.scaleX??scaleOf(value);
export const scaleYOf=value=>value?.scaleY??scaleOf(value);
export function validScale(value){if(!Number.isFinite(value)||value<MIN_SCALE||value>MAX_SCALE)throw new Error('장치 크기가 너무 작거나 작업 범위를 초과합니다.');return value;}
export function matrixOf(value){const r=(value?.rotation??0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=scaleXOf(value),y=scaleYOf(value),k=Math.tan((value?.skewX??0)*Math.PI/180);return {a:c*x,b:s*x,c:(c*k-s)*y,d:(s*k+c)*y};}
export const vector=(m,p)=>({x:m.a*p.x+m.c*p.y,y:m.b*p.x+m.d*p.y});
export const partVector=(p,x,y)=>vector(matrixOf(p),{x,y});
export function inverse(m){const det=m.a*m.d-m.b*m.c;return {a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det};}
export function multiply(m,n){return {a:m.a*n.a+m.c*n.b,b:m.b*n.a+m.d*n.b,c:m.a*n.c+m.c*n.d,d:m.b*n.c+m.d*n.d};}
export function scaleFields(x,y){validScale(x);validScale(y);return Math.abs(x-y)<1e-10?{scale:x}:{scaleX:x,scaleY:y};}
export function matrixFields(m){const x=Math.hypot(m.a,m.b),y=(m.a*m.d-m.b*m.c)/x;return {...scaleFields(x,y),rotation:(Math.atan2(m.b,m.a)*180/Math.PI+360)%360,skewX:Math.atan((m.a*m.c+m.b*m.d)/(x*y))*180/Math.PI};}
export function assignScale(object,fields){delete object.scale;delete object.scaleX;delete object.scaleY;Object.assign(object,fields);}
export function scaleTransform(value){const x=scaleXOf(value),y=scaleYOf(value);return `scale(${x===y?x:`${x} ${y}`})`;}
export const partTransform=p=>`translate(${p.x} ${p.y}) rotate(${p.rotation}) skewX(${p.skewX??0}) ${scaleTransform(p)}`;
export function surfaceOrigin(name,surfaces){const base=name==='board'?BOARD:BB,s=surfaces?.[name];return {x:s?.x??base.x,y:s?.y??base.y};}
export function surfacePoint(point,name,surfaces){const base=name==='board'?BOARD:BB,origin=surfaceOrigin(name,surfaces),s=surfaces?.[name];return {...point,x:origin.x+(point.x-base.x)*scaleXOf(s),y:origin.y+(point.y-base.y)*scaleYOf(s)};}
export function surfaceTransform(name,surfaces){const base=name==='board'?BOARD:BB,origin=surfaceOrigin(name,surfaces);return `translate(${origin.x} ${origin.y}) ${scaleTransform(surfaces?.[name])} translate(${-base.x} ${-base.y})`;}
