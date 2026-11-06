// Bounded C printf formatting for the simulator's debug log; no host evaluation.
/** Writes text and its terminating 0 into a char buffer (each cell checked against the array, as C would overrun it). */
export function writeCString(r,buffer,text){for(let i=0;i<text.length;i++)r.set(r.pointerCell(buffer,i),text.charCodeAt(i)&255);r.set(r.pointerCell(buffer,text.length),0);}
const bytesOf=(r,buffer,count)=>Array.from({length:count},(_,i)=>r.get(r.pointerCell(buffer,i)));
const count=(value,name)=>{if(!Number.isInteger(value)||value<0||value>65536)throw new Error(`${name} 길이 범위: 0~65536`);return value;};
/** sprintf / snprintf and the <string.h> copies on char/byte buffers; undefined for other names. */
export function stringCall(name,args,r){
 const [a,b,c]=args;
 if(name==='sprintf'){const text=formatPrintf(args.slice(1),r);writeCString(r,a,text);return text.length;}
 // snprintf writes at most size-1 characters and the 0, and returns the length the whole text would have.
 if(name==='snprintf'){const size=count(b,'snprintf'),text=formatPrintf(args.slice(2),r);if(size)writeCString(r,a,text.slice(0,size-1));return text.length;}
 if(name==='strcpy'){writeCString(r,a,r.format([b]));return a;}
 if(name==='strncpy'){const n=count(c,'strncpy'),text=r.format([b]).slice(0,n);for(let i=0;i<n;i++)r.set(r.pointerCell(a,i),i<text.length?text.charCodeAt(i)&255:0);return a;}
 if(name==='strcat'){const head=r.format([a]);writeCString(r,a,head+r.format([b]));return a;}
 if(name==='memset'){const n=count(c,'memset');for(let i=0;i<n;i++)r.set(r.pointerCell(a,i),b&255);return a;}
 if(name==='memcpy'||name==='memmove'){const n=count(c,name),bytes=bytesOf(r,b,n);bytes.forEach((v,i)=>r.set(r.pointerCell(a,i),v));return a;}
 if(name==='memcmp'){const n=count(c,'memcmp'),x=bytesOf(r,a,n),y=bytesOf(r,b,n);for(let i=0;i<n;i++)if((x[i]&255)!==(y[i]&255))return (x[i]&255)-(y[i]&255);return 0;}
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
    const match=/^%([-+ 0]*)(\d*)(?:\.(\d+))?(hh|h|l)?([diuxXofcs])/.exec(format.slice(i));
    if(!match)throw new Error('지원하지 않는 printf 형식입니다. d/u/x/X/o/f/c/s/%%를 사용하세요.');
    const [,flags,widthText,precisionText,length,kind]=match,width=Number(widthText||0),precision=precisionText===undefined?null:Number(precisionText);
    if(width>80||(precision!==null&&precision>8))throw new Error('printf 폭은 80, 정밀도는 8까지 지원합니다.');
    if(index>=args.length)throw new Error('printf 형식에 필요한 인수가 부족합니다.');
    const value=args[index++];let output;
    if(length&&['s','c'].includes(kind))throw new Error('printf 와이드 문자는 지원하지 않습니다.');
    if(kind==='s'){output=string(value);if(precision!==null)output=output.slice(0,precision);}
    // newlib-nano without -u _printf_float (CubeIDE's default) consumes the argument and prints nothing for %f.
    else if(kind==='f'&&r.printfFloat===false)output='';
    // %f of NaN / ±Infinity prints nan / inf as C does (e.g. a DHT read that failed).
    else if(kind==='f'&&typeof value==='number'&&!Number.isFinite(value))output=Number.isNaN(value)?'nan':value>0?'inf':'-inf';
    else{
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error('printf 숫자 형식에는 유한한 숫자가 필요합니다.');
      const bits=length==='hh'?8:length==='h'?16:32,unsigned=bits===8?value&255:bits===16?value&65535:value>>>0,signed=bits===8?(value<<24)>>24:bits===16?(value<<16)>>16:value|0;
      if(kind==='c')output=String.fromCharCode(value&255);
      else if(kind==='f')output=value.toFixed(precision??6);
      else{const n=['d','i'].includes(kind)?signed:unsigned;output=n.toString(kind==='o'?8:['x','X'].includes(kind)?16:10);if(kind==='X')output=output.toUpperCase();if(precision!==null)output=output.startsWith('-')?'-'+output.slice(1).padStart(precision,'0'):output.padStart(precision,'0');}
      if(['d','i','f'].includes(kind)&&!output.startsWith('-')){if(flags.includes('+'))output='+'+output;else if(flags.includes(' '))output=' '+output;}
    }
    if(output.length<width){if(flags.includes('-'))output=output.padEnd(width,' ');else if(flags.includes('0')&&kind!=='s'&&kind!=='c'&&(precision===null||kind==='f')){const sign=/^[+ -]/.test(output)?output[0]:'';output=sign+output.slice(sign.length).padStart(width-sign.length,'0');}else output=output.padStart(width,' ');}
    text+=output;i+=match[0].length;if(text.length>4096)throw new Error('printf 출력은 호출당 4096자 이하입니다.');
  }
  if(text.length>4096)throw new Error('printf 출력은 호출당 4096자 이하입니다.');
  return text;
}
