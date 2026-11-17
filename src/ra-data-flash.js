// RA6E1 data flash contents (feature 39), shared by the emulator's FACI model (src/emu/ra6e1/flash.js), the built-in
// interpreter (fsp-interp.js R_FLASH_HP_*), the project file (project.js `dataFlash`) and the RA Configuration dialog.
// FSP bsp_feature.h (RA6E1): BSP_FEATURE_FLASH_DATA_FLASH_START 0x08000000, BSP_DATA_FLASH_SIZE_BYTES 8192 (R7FA6E10F),
// BSP_FEATURE_FLASH_HP_DF_BLOCK_SIZE 64 (erase unit), BSP_FEATURE_FLASH_HP_DF_WRITE_SIZE 4 (program unit).
//
// A program unit is either blank (erased, nothing written since) or programmed. "Blank" is kept beside the bytes: a
// unit programmed with 0xFFFFFFFF is not blank, and what an erased unit reads as is not defined on the chip — the blank
// check (FACI command 0x71, R_FLASH_HP_BlankCheck) is the only way a program can tell. Here an erased unit reads 0xFF.
export const RA_DF_BASE=0x08000000,RA_DF_SIZE=0x2000,RA_DF_BLOCK=64,RA_DF_UNIT=4;
// How long an operation takes here, in µs. FSP r_flash_hp.c gives only the maximums it waits for (FLASH_HP_MAX_WRITE_DF_US
// 3800 per 4 bytes, FLASH_HP_MAX_ERASE_DF_BLOCK_US 18000 per 64-byte block, FLASH_HP_MAX_BLANK_CHECK_US 84 per 4 bytes,
// at FCLK 4 MHz); the simulated time is a tenth of each (the data sheet's typical times were not at hand).
export const RA_DF_TIME_US=Object.freeze({write:380,erase:1800,blankCheck:8.4});
const hexByte=b=>b.toString(16).padStart(2,'0');

export class RaDataFlash {
 /** `bytes`: the memory the contents live in (the emulator bus's data flash array), or none for an array of its own. */
 constructor(bytes){this.bytes=bytes??new Uint8Array(RA_DF_SIZE);this.blank=new Uint8Array(RA_DF_SIZE/RA_DF_UNIT);this.clear();}
 /** As delivered: every block erased. */
 clear(){this.bytes.fill(0xff,0,RA_DF_SIZE);this.blank.fill(1);this.changed=false;}
 inRange(offset,length=1){return Number.isInteger(offset)&&offset>=0&&length>=1&&offset+length<=RA_DF_SIZE;}
 /** Block erase: the 64-byte block holding `offset` becomes blank. */
 erase(offset){const start=offset-offset%RA_DF_BLOCK;this.bytes.fill(0xff,start,start+RA_DF_BLOCK);this.blank.fill(1,start/RA_DF_UNIT,(start+RA_DF_BLOCK)/RA_DF_UNIT);this.changed=true;}
 /**
  * Programs one 4-byte unit. A blank unit takes the data and the result is true. A unit that was not blank cannot be
  * programmed again without an erase: the result is false (the flash sequencer reports a programming error) and the
  * unit's contents are no longer what either write meant — here the two values ANDed, which is this model's choice.
  */
 program(offset,data){
  const unit=offset/RA_DF_UNIT,ok=this.blank[unit]===1;
  for(let i=0;i<RA_DF_UNIT;i++)this.bytes[offset+i]=ok?data[i]&0xff:this.bytes[offset+i]&data[i];
  this.blank[unit]=0;this.changed=true;return ok;
 }
 /** A byte of a memory image (an ELF's .data_flash section): written as given, its unit programmed. */
 load(offset,byte){this.bytes[offset]=byte&0xff;this.blank[offset>>2]=0;}
 /** Offset of the first programmed unit in [offset, offset + length), or -1 when all of it is blank. */
 firstProgrammed(offset,length){for(let u=offset>>2,last=(offset+length-1)>>2;u<=last;u++)if(!this.blank[u])return Math.max(offset,u*RA_DF_UNIT);return -1;}
 isBlank(offset,length=1){return this.firstProgrammed(offset,length)<0;}
 /** Bytes in programmed units. */
 used(){let n=0;for(const b of this.blank)if(!b)n+=RA_DF_UNIT;return n;}
 /** The programmed units as runs for the project file: [{at: offset, hex: bytes}], in address order; [] when all is blank. */
 encode(){
  const runs=[];let run=null;
  for(let u=0;u<this.blank.length;u++){
   if(this.blank[u]){run=null;continue;}
   if(!run){run={at:u*RA_DF_UNIT,hex:''};runs.push(run);}
   for(let i=0;i<RA_DF_UNIT;i++)run.hex+=hexByte(this.bytes[u*RA_DF_UNIT+i]);
  }
  return runs;
 }
 /** Puts saved runs back. `keep`: units already programmed (an ELF's own data flash contents) stay as they are. */
 apply(runs,{keep=false}={}){
  for(const run of validateDataFlash(runs)??[])for(let i=0;i<run.hex.length/2;i+=RA_DF_UNIT){
   const offset=run.at+i;if(keep&&!this.blank[offset>>2])continue;
   for(let k=0;k<RA_DF_UNIT;k++)this.bytes[offset+k]=parseInt(run.hex.slice((i+k)*2,(i+k)*2+2),16);
   this.blank[offset>>2]=0;
  }
  return this;
 }
}
/** A checked copy of a project's saved data flash contents (undefined stays undefined); throws with the reason. */
export function validateDataFlash(runs){
 if(runs===undefined)return undefined;
 const bad=()=>new Error('저장된 데이터 플래시 내용이 올바르지 않습니다.');
 if(!Array.isArray(runs)||runs.length>RA_DF_SIZE/RA_DF_UNIT)throw bad();
 let end=0;
 return runs.map(run=>{
  if(!run||!Number.isInteger(run.at)||run.at%RA_DF_UNIT||typeof run.hex!=='string'||!run.hex.length||run.hex.length%(RA_DF_UNIT*2)||!/^[0-9a-f]+$/.test(run.hex))throw bad();
  if(run.at<end||run.at+run.hex.length/2>RA_DF_SIZE)throw bad();
  end=run.at+run.hex.length/2;return {at:run.at,hex:run.hex};
 });
}
/** Programmed bytes of saved contents (0 for none). */
export const dataFlashUsed=runs=>(runs||[]).reduce((n,run)=>n+run.hex.length/2,0);
