// Bounded C printf formatting for the simulator's debug log; no host evaluation.
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
