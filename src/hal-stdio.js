// Bounded C printf formatting for the simulator's debug log; no host evaluation.
/** Writes text and its terminating 0 into a char buffer (each cell checked against the array, as C would overrun it). */
export function writeCString(r,buffer,text){for(let i=0;i<text.length;i++)r.set(r.pointerCell(buffer,i),text.charCodeAt(i)&255);r.set(r.pointerCell(buffer,text.length),0);}
const bytesOf=(r,buffer,count)=>Array.from({length:count},(_,i)=>r.get(r.pointerCell(buffer,i)));
const count=(value,name)=>{if(!Number.isInteger(value)||value<0||value>65536)throw new Error(`${name} 길이 범위: 0~65536`);return value;};
const isFloatType=type=>type==='float'||type==='double';
// The bytes one element of a buffer takes (a char / uint8_t cell is 1, uint16_t 2, the rest 4, double 8).
const elementSize=(r,cell)=>cell.dataType==='pointer'?4:r.typeSize(cell.dataType||(typeof r.get(cell)==='number'?'uint8_t':'int'));
// The memory of a numeric buffer as bytes: each element little-endian in its own size (a float as its IEEE 754 bits).
const numberBytes=(value,size,float)=>{const view=new DataView(new ArrayBuffer(8));if(float){if(size===4)view.setFloat32(0,value,true);else view.setFloat64(0,value,true);}else{view.setUint32(0,value>>>0,true);}return Array.from({length:size},(_,i)=>view.getUint8(i));};
function readBytes(r,buffer,n,name){
 const out=[];
 for(let i=0;out.length<n;i++){const cell=r.pointerCell(buffer,i),value=r.get(cell);if(typeof value!=='number')throw new Error(`${name}: 숫자 배열 또는 같은 구조체끼리만 지원합니다.`);out.push(...numberBytes(value,elementSize(r,cell),isFloatType(cell.dataType)));}
 return out.slice(0,n);
}
function writeBytes(r,buffer,bytes,name){
 for(let i=0,at=0;at<bytes.length;i++){
  const cell=r.pointerCell(buffer,i),size=elementSize(r,cell),old=r.get(cell);if(typeof old!=='number')throw new Error(`${name}: 숫자 배열 또는 같은 구조체끼리만 지원합니다.`);
  // A last element only partly covered keeps its other bytes.
  const merged=numberBytes(old,size,isFloatType(cell.dataType));for(let k=0;k<size&&at+k<bytes.length;k++)merged[k]=bytes[at+k];at+=size;
  const view=new DataView(new Uint8Array([...merged,0,0,0,0,0,0,0,0]).buffer);
  r.set(cell,isFloatType(cell.dataType)?(size===4?view.getFloat32(0,true):view.getFloat64(0,true)):view.getUint32(0,true));
 }
}
const CTYPE={isdigit:/[0-9]/,isalpha:/[A-Za-z]/,isalnum:/[A-Za-z0-9]/,isspace:/[ \t\n\r\f\v]/,isupper:/[A-Z]/,islower:/[a-z]/,isxdigit:/[0-9A-Fa-f]/,ispunct:/[!-\/:-@[-`{-~]/,isprint:/[ -~]/,toupper:null,tolower:null};
/** sprintf / snprintf, <string.h>, the text-to-number functions of <stdlib.h> and <ctype.h>; undefined for other names. */
export function stringCall(name,args,r){
 const [a,b,c]=args;
 if(name==='sprintf'){const text=formatPrintf(args.slice(1),r);writeCString(r,a,text);return text.length;}
 // snprintf writes at most size-1 characters and the 0, and returns the length the whole text would have.
 if(name==='snprintf'){const size=count(b,'snprintf'),text=formatPrintf(args.slice(2),r);if(size)writeCString(r,a,text.slice(0,size-1));return text.length;}
 if(name==='strcpy'){writeCString(r,a,r.format([b]));return a;}
 if(name==='strncpy'){const n=count(c,'strncpy'),text=r.format([b]).slice(0,n);for(let i=0;i<n;i++)r.set(r.pointerCell(a,i),i<text.length?text.charCodeAt(i)&255:0);return a;}
 if(name==='strcat'){const head=r.format([a]);writeCString(r,a,head+r.format([b]));return a;}
 // memset / memcpy count bytes, a buffer here is made of elements: n bytes are n / sizeof(element) elements
 // (memset(buf16, 0, sizeof(buf16)), memset(&config, 0, sizeof(config)), memcpy(&copy, &original, sizeof(copy))).
 if(name==='memset'){
  const n=count(c,'memset');if(!n)return a;const first=r.pointerCell(a,0),value=r.get(first);
  if(value?.kind==='struct'){if(b!==0)throw new Error('구조체의 memset은 0으로 채우는 것만 지원합니다.');const size=r.typeSize(value.type);if(n%size)throw new Error('memset 길이가 구조체 크기의 배수가 아닙니다.');for(let i=0;i<n/size;i++){const cell=r.pointerCell(a,i);r.set(cell,r.defaultValue(r.get(cell).type));}return a;}
  const size=elementSize(r,first);if(n%size)throw new Error(`memset 길이 ${n}가 요소 크기 ${size}의 배수가 아닙니다.`);
  let fill=0;for(let i=0;i<size;i++)fill=fill*256+(b&255);
  for(let i=0;i<n/size;i++)r.set(r.pointerCell(a,i),isFloatType(first.dataType)?(b?NaN:0):fill);return a;
 }
 if(name==='memcpy'||name==='memmove'){
  const n=count(c,name);if(!n)return a;const first=r.pointerCell(a,0),from=r.pointerCell(b,0),value=r.get(from);
  if(value?.kind==='struct'||r.get(first)?.kind==='struct'){if(value?.kind!=='struct'||r.get(first)?.kind!=='struct'||r.get(first).type!==value.type)throw new Error(`${name}: 같은 구조체끼리만 복사할 수 있습니다.`);const size=r.typeSize(value.type);if(n%size)throw new Error(`${name} 길이가 구조체 크기의 배수가 아닙니다.`);const copies=Array.from({length:n/size},(_,i)=>r.get(r.pointerCell(b,i)));copies.forEach((v,i)=>r.set(r.pointerCell(a,i),v));return a;}
  const bytes=readBytes(r,b,n,name);writeBytes(r,a,bytes,name);return a;
 }
 // <string.h> searches: a pointer into the text, or NULL.
 if(name==='strchr'||name==='strrchr'){const p=r.pointer(r.literal(a)),text=r.format([a]),at=b===0?text.length:name==='strchr'?text.indexOf(String.fromCharCode(b&255)):text.lastIndexOf(String.fromCharCode(b&255));return at<0?0:{...p,index:p.index+at};}
 if(name==='strstr'){const p=r.pointer(r.literal(a)),at=r.format([a]).indexOf(r.format([b]));return at<0?0:{...p,index:p.index+at};}
 // <stdlib.h> numbers from text; <ctype.h>.
 if(name==='strtol'||name==='strtoul'){const text=r.format([a]),base=c===undefined?10:c;if(base!==0&&(!Number.isInteger(base)||base<2||base>36))throw new Error(`${name}: 진법은 0 또는 2~36입니다.`);const m=/^\s*([+-]?)(0[xX])?/.exec(text),radix=base===0?(m[2]?16:/^\s*[+-]?0\d/.test(text)?8:10):base,start=m[0].length-(m[2]&&radix!==16?2:0);let i=start,v=0;for(;i<text.length;i++){const d=parseInt(text[i],36);if(Number.isNaN(d)||d>=radix)break;v=v*radix+d;}if(m[1]==='-')v=-v;if(b!==0&&b!==undefined){const p=r.pointer(r.literal(a));r.set(r.pointerCell(b,0),{...p,index:p.index+(i===start?0:i)});}return name==='strtol'?Math.max(-2147483648,Math.min(2147483647,v)):Math.min(4294967295,Math.max(0,v))>>>0;}
 if(name==='atof'||name==='strtod'||name==='strtof'){const m=/^\s*[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/.exec(r.format([a]));return m?Number(m[0]):0;}
 if(Object.hasOwn(CTYPE,name)){if(typeof a!=='number')throw new Error(`${name}: 문자 값이 필요합니다.`);const ch=String.fromCharCode(a&255);return name==='toupper'?(/[a-z]/.test(ch)?a-32:a):name==='tolower'?(/[A-Z]/.test(ch)?a+32:a):Number(a>=0&&a<128&&CTYPE[name].test(ch));}
 if(name==='memcmp'){const n=count(c,'memcmp'),x=readBytes(r,a,n,name),y=readBytes(r,b,n,name);for(let i=0;i<n;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
 return undefined;
}
export function formatPrintf(args,r){
  if(!args.length||args.length>33)throw new Error('printf 인수는 형식 문자열과 값 32개까지 지원합니다.');
  const string=value=>{if(typeof value!=='string'&&!['array','pointer'].includes(value?.kind))throw new Error('printf 문자열 또는 유효한 문자 포인터가 필요합니다.');return r.format([value]);};
  const format=string(args[0]);if(format.length>1024)throw new Error('printf 형식 문자열은 1024자 이하로 작성하세요.');
  let index=1,text='';
  for(let i=0;i<format.length;){
    if(format[i]!=='%'){text+=format[i++];continue;}
    if(format[i+1]==='%'){text+='%';i+=2;continue;}
    const match=/^%([-+ 0]*)(\d*)(?:\.(\d+))?(hh|h|ll|l|z)?([diuxXofFeEgGcs])/.exec(format.slice(i));
    if(!match)throw new Error('지원하지 않는 printf 형식입니다. d/u/x/X/o/f/e/g/c/s/%%를 사용하세요.');
    const [,flags,widthText,precisionText,length,kind]=match,width=Number(widthText||0),precision=precisionText===undefined?null:Number(precisionText);
    if(width>80||(precision!==null&&precision>8))throw new Error('printf 폭은 80, 정밀도는 8까지 지원합니다.');
    if(index>=args.length)throw new Error('printf 형식에 필요한 인수가 부족합니다.');
    const value=args[index++];let output;
    if(length&&['s','c'].includes(kind))throw new Error('printf 와이드 문자는 지원하지 않습니다.');
    if(kind==='s'){output=string(value);if(precision!==null)output=output.slice(0,precision);}
    // %f of NaN / ±Infinity prints nan / inf as C does (e.g. a DHT read that failed).
    else if(kind==='f'&&typeof value==='number'&&!Number.isFinite(value))output=Number.isNaN(value)?'nan':value>0?'inf':'-inf';
    else{
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error('printf 숫자 형식에는 유한한 숫자가 필요합니다.');
      const bits=length==='hh'?8:length==='h'?16:32,unsigned=bits===8?value&255:bits===16?value&65535:value>>>0,signed=bits===8?(value<<24)>>24:bits===16?(value<<16)>>16:value|0;
      if(kind==='c')output=String.fromCharCode(value&255);
      else if(kind==='f'||kind==='F')output=value.toFixed(precision??6);
      // %e: d.dddddde±dd; %g: the shorter of %e and %f for the precision, without trailing zeros.
      else if(kind==='e'||kind==='E'){output=value.toExponential(precision??6).replace(/e([+-])(\d)$/,'e$10$2');if(kind==='E')output=output.toUpperCase();}
      else if(kind==='g'||kind==='G'){const p=precision===0?1:precision??6,exp=value===0?0:Math.floor(Math.log10(Math.abs(Number(value.toExponential(p-1)))));output=exp<-4||exp>=p?value.toExponential(p-1).replace(/\.?0+e/,'e').replace(/e([+-])(\d)$/,'e$10$2'):value.toFixed(Math.max(0,p-1-exp)).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');if(kind==='G')output=output.toUpperCase();}
      else{const n=['d','i'].includes(kind)?signed:unsigned;output=n.toString(kind==='o'?8:['x','X'].includes(kind)?16:10);if(kind==='X')output=output.toUpperCase();if(precision!==null)output=output.startsWith('-')?'-'+output.slice(1).padStart(precision,'0'):output.padStart(precision,'0');}
      if(['d','i','f','F','e','E','g','G'].includes(kind)&&!output.startsWith('-')){if(flags.includes('+'))output='+'+output;else if(flags.includes(' '))output=' '+output;}
    }
    if(output.length<width){if(flags.includes('-'))output=output.padEnd(width,' ');else if(flags.includes('0')&&kind!=='s'&&kind!=='c'&&(precision===null||'fFeEgG'.includes(kind))){const sign=/^[+ -]/.test(output)?output[0]:'';output=sign+output.slice(sign.length).padStart(width-sign.length,'0');}else output=output.padStart(width,' ');}
    text+=output;i+=match[0].length;if(text.length>4096)throw new Error('printf 출력은 호출당 4096자 이하입니다.');
  }
  if(text.length>4096)throw new Error('printf 출력은 호출당 4096자 이하입니다.');
  return text;
}
