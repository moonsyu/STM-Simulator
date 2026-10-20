// Byte-addressed view of interpreter arrays (little-endian, element size from the declared type),
// used by DMA/DCMI/SD so a uint32_t frame buffer can be filled byte by byte like real SRAM.
const normalize=(r,ptr)=>{if(ptr?.kind==='array')return {kind:'pointer',array:ptr,index:0};if(ptr?.kind!=='pointer')throw new Error('DMA/버퍼 주소에는 배열 또는 포인터가 필요합니다.');return ptr;};
export function elementSize(r,ptr){if(typeof ptr==='string')return 1;const p=normalize(r,ptr),cell=p.array?p.array.cells[0]:p.cell,t=cell?.dataType;return !t||t==='pointer'?4:r.typeSize(t);}
export function byteLength(r,ptr){if(typeof ptr==='string')return ptr.length+1;const p=normalize(r,ptr);return p.array?(p.array.cells.length-p.index)*elementSize(r,p):elementSize(r,p);}
const cellAt=(r,p,index)=>r.pointerCell(p,index);
export function readBytes(r,ptr,offset,count){
 if(typeof ptr==='string')return Array.from({length:count},(_,i)=>ptr.charCodeAt(offset+i)||0);
 const p=normalize(r,ptr),size=elementSize(r,p),out=new Array(count);
 for(let i=0;i<count;i++){const a=offset+i,v=r.get(cellAt(r,p,Math.floor(a/size)));out[i]=(Math.trunc(v)>>>((a%size)*8))&255;}
 return out;
}
export function writeBytes(r,ptr,offset,bytes){
 const p=normalize(r,ptr),size=elementSize(r,p);let i=0;
 while(i<bytes.length){
  const a=offset+i,index=Math.floor(a/size),lane=a%size,cell=cellAt(r,p,index);
  if(lane===0&&i+size<=bytes.length){let v=0;for(let k=size-1;k>=0;k--)v=v*256+bytes[i+k];r.set(cell,v);i+=size;continue;}
  const old=Math.trunc(r.get(cell))>>>0,shift=lane*8,v=((old&~(255<<shift))|((bytes[i]&255)<<shift))>>>0;r.set(cell,size===4?v:v&((1<<(size*8))-1));i++;
 }
}
// Element access with a DMA data width (1/2/4 bytes); fast path when it matches the array type.
export function readElement(r,ptr,index,width){
 if(typeof ptr!=='string'){const p=normalize(r,ptr);if(elementSize(r,p)===width)return Math.trunc(r.get(cellAt(r,p,index)))>>>0;}
 return readBytes(r,ptr,index*width,width).reduceRight((v,b)=>v*256+b,0);
}
export function writeElement(r,ptr,index,width,value){
 const p=normalize(r,ptr);if(elementSize(r,p)===width){r.set(cellAt(r,p,index),value);return;}
 writeBytes(r,p,index*width,Array.from({length:width},(_,k)=>(value>>>(k*8))&255));
}
export function checkRange(r,ptr,bytes,label){if(byteLength(r,ptr)<bytes)throw new Error(`${label}: 버퍼가 전송 길이(${bytes}바이트)보다 작습니다.`);}
