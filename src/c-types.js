// Scalar conversions for the supported Cortex-M4 C subset (32-bit int/long/pointer).
export const isFloat=type=>type==='float'||type==='double';
export const isUnsigned=type=>['uint32_t','unsigned','size_t'].includes(type);
export const promote=type=>isFloat(type)?type:isUnsigned(type)?'uint32_t':'int';
export function commonType(a,b){a=promote(a);b=promote(b);return a==='double'||b==='double'?'double':a==='float'||b==='float'?'float':isUnsigned(a)||isUnsigned(b)?'uint32_t':'int';}
export function convert(type,value){
 if(typeof value!=='number'||!type)return value;
 if(isFloat(type))return type==='float'?Math.fround(value):value;
 if(type==='bool')return Number(!!value);
 const v=Math.trunc(value);
 if(['uint8_t','byte'].includes(type))return v&255;
 if(['char','int8_t'].includes(type))return (v<<24)>>24;
 if(type==='uint16_t')return v&65535;
 if(['short','int16_t'].includes(type))return (v<<16)>>16;
 return isUnsigned(type)?v>>>0:v|0;
}
export function arithmetic(op,a,b,ta='int',tb='int'){
 const shift=op==='<<'||op==='>>',type=shift?promote(ta):commonType(ta,tb);
 a=convert(type,a);b=convert(shift?promote(tb):type,b);
 if((op==='/'||op==='%')&&b===0)throw Error('0으로 나눌 수 없습니다.');
 const operations={'+':()=>a+b,'-':()=>a-b,'*':()=>isFloat(type)?a*b:Math.imul(a,b),'/':()=>isFloat(type)?a/b:Math.trunc(a/b),'%':()=>a%b,'<<':()=>a<<b,'>>':()=>isUnsigned(type)?a>>>b:a>>b,'&':()=>a&b,'|':()=>a|b,'^':()=>a^b,'==':()=>Number(a===b),'!=':()=>Number(a!==b),'<':()=>Number(a<b),'>':()=>Number(a>b),'<=':()=>Number(a<=b),'>=':()=>Number(a>=b)};
 const value=operations[op]?.();if(value===undefined||!Number.isFinite(value))throw Error('숫자 연산 결과가 유효하지 않습니다.');
 return ['==','!=','<','>','<=','>='].includes(op)?value:convert(type,value);
}
export function numberLiteral(raw){
 const hex=/^0x/i.test(raw),binary=/^0b/i.test(raw),floating=!hex&&!binary&&/[.eEfF]/.test(raw);
 if(floating){const type=/f$/i.test(raw)?'float':'double',value=Number(raw.replace(/[fFlL]$/,''));if(!Number.isFinite(value))throw Error('숫자 형식이 잘못되었습니다.');return {value,numericType:type};}
 const digits=raw.replace(/[uUlL]+$/,''),octal=!hex&&!binary&&/^0\d/.test(digits);
 if(octal&&/[89]/.test(digits))throw Error('8진수에는 0~7만 사용할 수 있습니다.');
 const value=octal?parseInt(digits,8):Number(digits);
 if(!Number.isSafeInteger(value)||value>0xffffffff)throw Error('이 정수 상수는 지원하는 32비트 범위를 넘었습니다.');
 return {value,numericType:/u/i.test(raw)||value>0x7fffffff?'uint32_t':'int'};
}
