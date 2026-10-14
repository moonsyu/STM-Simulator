export const BOARD={x:45,y:48,w:440,h:532};
export const BB={x:632,y:68,w:342,h:538,startY:128,step:14};
export const MIN_SCALE=.1,MAX_SCALE=4;
export const scaleOf=value=>value?.scale??1;
export function validScale(value){if(!Number.isFinite(value)||value<MIN_SCALE||value>MAX_SCALE)throw new Error('크기는 10~400% 범위로 설정하세요.');return value;}
export function surfacePoint(point,name,surfaces){const origin=name==='board'?BOARD:BB,scale=scaleOf(surfaces?.[name]);return scale===1?point:{...point,x:origin.x+(point.x-origin.x)*scale,y:origin.y+(point.y-origin.y)*scale};}
export function surfaceTransform(name,surfaces){const origin=name==='board'?BOARD:BB;return `translate(${origin.x} ${origin.y}) scale(${scaleOf(surfaces?.[name])}) translate(${-origin.x} ${-origin.y})`;}
