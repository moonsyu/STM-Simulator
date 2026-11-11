// UART bytes as the text the log and the serial monitor show. printf goes out on USART2 (feature 44) and its text is
// UTF-8 — a Korean message is three bytes a character — so whole UTF-8 characters are decoded; a control byte or a
// byte that is not part of a valid character stays visible as \xNN, as before.
const decoder=new TextDecoder('utf-8');
const length=b=>b>=0xf0&&b<=0xf4?4:b>=0xe0&&b<=0xef?3:b>=0xc2&&b<=0xdf?2:0;
const continues=b=>(b&0xc0)===0x80;
/** One line of UART bytes (no line end) as text. A character whose last bytes have not arrived yet is left out. */
export function uartLineText(bytes){
 let out='';
 for(let i=0;i<bytes.length;){
  const b=bytes[i];
  if(b>=32&&b<=126){out+=String.fromCharCode(b);i++;continue;}
  const n=length(b);
  if(n){
   const rest=bytes.slice(i+1,i+n);
   if(rest.length===n-1&&rest.every(continues)){const text=decoder.decode(Uint8Array.from(bytes.slice(i,i+n)));if(text!=='�'&&!text.includes('�')){out+=text;i+=n;continue;}}
   else if(rest.length<n-1&&rest.every(continues))break;
  }
  out+='\\x'+b.toString(16).padStart(2,'0');i++;
 }
 return out;
}
/** The serial monitor's text: the port keeps its bytes as a string of character codes (line ends included). */
export function uartMonitorText(codes){
 const text=String(codes||'');
 // Plain ASCII (the usual case) is shown as it is.
 if(!/[^\x00-\x7f]/.test(text))return text;
 return text.split('\n').map(line=>{const cr=line.endsWith('\r');const bytes=[...(cr?line.slice(0,-1):line)].map(c=>c.charCodeAt(0)&255);let out='';
  // Keep tabs and other characters the monitor already showed raw; decode what is valid UTF-8.
  for(let i=0;i<bytes.length;){const b=bytes[i],n=length(b),rest=bytes.slice(i+1,i+n);
   if(n&&rest.length===n-1&&rest.every(continues)){const t=decoder.decode(Uint8Array.from(bytes.slice(i,i+n)));if(!t.includes('�')){out+=t;i+=n;continue;}}
   out+=String.fromCharCode(b);i++;}
  return out+(cr?'\r':'');}).join('\n');
}
