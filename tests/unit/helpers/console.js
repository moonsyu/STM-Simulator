// What a program prints, as the tests read it. Examples opened as a project print through _write on USART2 (the
// ST-LINK virtual COM port, feature 44); code without USART2 prints on the console (SWV ITM). Both go into `out`:
// one entry per printf line, its line end removed, as the console callback always gave them.
const decoder=new TextDecoder();
/** Session options that collect console lines and USART2 output into `out`; `also` receives every UART event. */
export function consoleSink(out,also){
 let pending='';
 return {
  print:v=>out.push(String(v)),
  uart:e=>{
   also?.(e);if(e.direction!=='TX'||e.instance!=='USART2')return;
   // A write is one or more whole lines (stdout is line buffered); text without a line end waits for the rest.
   pending+=decoder.decode(Uint8Array.from(e.bytes));
   const end=pending.lastIndexOf('\n');if(end<0)return;
   const text=pending.slice(0,end);pending=pending.slice(end+1);
   out.push(text.replace(/\r$/,''));
  }};
}
