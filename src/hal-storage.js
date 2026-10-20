import {Fat32,FatError,FR,formatDisk,sdCardFor,shortName,displayName,listFiles,readFile,writeFile,deleteFile} from './sdcard.js';
import {readBytes,writeBytes,checkRange} from './hal-memory.js';
import {formatPrintf} from './hal-stdio.js';
// SDIO HAL (HAL_SD_*) and FatFs (f_*) emulation on the SD card part's FAT32 image.
export const STORAGE_CONSTANTS={SDIO:'SDIO',SDIO_CLOCK_EDGE_RISING:0,SDIO_CLOCK_EDGE_FALLING:0x2000,SDIO_CLOCK_BYPASS_DISABLE:0,SDIO_CLOCK_BYPASS_ENABLE:0x400,SDIO_CLOCK_POWER_SAVE_DISABLE:0,SDIO_CLOCK_POWER_SAVE_ENABLE:0x200,
 SDIO_BUS_WIDE_1B:0,SDIO_BUS_WIDE_4B:0x800,SDIO_BUS_WIDE_8B:0x1000,SDIO_HARDWARE_FLOW_CONTROL_DISABLE:0,SDIO_HARDWARE_FLOW_CONTROL_ENABLE:0x4000,SDIO_TRANSFER_CLK_DIV:0,SDIO_INIT_CLK_DIV:0x76,
 HAL_SD_CARD_READY:1,HAL_SD_CARD_IDENTIFICATION:2,HAL_SD_CARD_STANDBY:3,HAL_SD_CARD_TRANSFER:4,HAL_SD_CARD_SENDING:5,HAL_SD_CARD_RECEIVING:6,HAL_SD_CARD_PROGRAMMING:7,HAL_SD_CARD_DISCONNECTED:8,HAL_SD_CARD_ERROR:0xff,
 HAL_SD_STATE_RESET:0,HAL_SD_STATE_READY:1,HAL_SD_STATE_BUSY:3,HAL_SD_STATE_PROGRAMMING:4,HAL_SD_STATE_RECEIVING:5,HAL_SD_STATE_TRANSFER:6,HAL_SD_STATE_ERROR:0xf,HAL_SD_ERROR_NONE:0,HAL_SD_ERROR_TIMEOUT:0x80000000,HAL_SD_ERROR_ADDR_OUT_OF_RANGE:0x200,
 CARD_SDSC:0,CARD_SDHC_SDXC:1,CARD_V2_X:1,BLOCKSIZE:512,MSD_OK:0,MSD_ERROR:1,SD_PRESENT:1,SD_NOT_PRESENT:0,SD_Driver:0,USER_Driver:0,
 ...Object.fromEntries(Object.entries(FR).map(([k,v])=>['FR_'+k,v])),FA_READ:1,FA_WRITE:2,FA_OPEN_EXISTING:0,FA_CREATE_NEW:4,FA_CREATE_ALWAYS:8,FA_OPEN_ALWAYS:0x10,FA_OPEN_APPEND:0x30,
 AM_RDO:1,AM_HID:2,AM_SYS:4,AM_DIR:0x10,AM_ARC:0x20,FM_FAT:1,FM_FAT32:2,FM_EXFAT:4,FM_ANY:7,FM_SFD:8,FS_FAT12:1,FS_FAT16:2,FS_FAT32:3,EOF:-1,_MAX_SS:512,FF_MAX_SS:512,_MIN_SS:512};
const int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return v;};
export class HalStorage{
 constructor(hal){this.hal=hal;this.files=new WeakMap();this.dirs=new WeakMap();this.mounted=null;this.sd=null;this.api=this.publicApi();}
 parts(){return this.hal.buses.project.components.filter(p=>p.catalogVariant==='sd-storage-board');}
 // Card reachable over SDIO (CLK PC12, CMD PD2, D0 PC8) or over the SPI1 pins.
 wiring(p){
  const b=this.hal.buses,pins=this.hal.config.pins,fn=f=>Object.keys(pins).find(k=>pins[k].function===f),same=(n,pin)=>pin&&b.same(b.terminal(p,n),b.pin(pin));
  if(!b.powered(p))return null;if(same(4,fn('SDIO_CK'))&&same(5,fn('SDIO_CMD'))&&same(6,fn('SDIO_D0')))return 'sdio';if(same(4,fn('SPI1_SCK'))&&same(5,fn('SPI1_MOSI'))&&same(6,fn('SPI1_MISO')))return 'spi';return null;
 }
 card(mode){return this.parts().find(p=>{const w=this.wiring(p);return w&&(!mode||w===mode);});}
 publicApi(){
  const self=this;return {
   cards:()=>self.parts().map(p=>({partId:p.id,name:p.name,sizeMB:sdCardFor(p).disk.sizeMB,dirty:sdCardFor(p).dirty,wiring:self.wiring(p)})),
   image:partId=>{const p=self.part(partId),c=sdCardFor(p);const text=c.disk.encode();c.dirty=false;return text;},
   files:partId=>listFiles(self.api.image(partId)),readFile:(partId,path)=>readFile(self.api.image(partId),path),
   writeFile:(partId,path,bytes)=>{const p=self.part(partId),next=writeFile(self.api.image(partId),path,bytes);self.replace(p,next);return next;},
   deleteFile:(partId,path)=>{const p=self.part(partId),next=deleteFile(self.api.image(partId),path);self.replace(p,next);return next;},
   flush:()=>self.flush(true),
   // Copy every card image into a project's matching SD parts (cardImage property).
   applyTo:project=>{for(const p of self.parts()){const target=project.components.find(q=>q.id===p.id);if(target)target.cardImage=self.api.image(p.id);}return project;}
  };
 }
 part(id){const p=this.parts().find(q=>q.id===id);if(!p)throw new Error(`SD 카드 부품이 없습니다: ${id}`);return p;}
 replace(p,text){const st=p.catalogState??={};delete st.sd;p.cardImage=text;sdCardFor(p);if(this.mounted?.part===p)this.mounted=null;}
 flush(force=false){for(const p of this.parts()){const c=p.catalogState?.sd;if(!c?.dirty)continue;if(!force&&this.hal.runtime&&this.hal.runtime.microTime-(c.flushedAt??-1e9)<200000)continue;c.flushedAt=this.hal.runtime?.microTime??0;let text;try{text=c.disk.encode();}catch(e){this.hal.runtime?.warn('[SD] '+e.message);continue;}c.dirty=false;p.cardImage=text;this.hal.session?.onStorage?.(p.id,text);}}
 update(){this.flush();}
 sectorUs(mode){if(mode==='spi')return 512*8e6/this.hal.buses.spi.clock+200;return 512/(this.sd?.wide?4:1)*8/24+100;}
 // ---- SDIO HAL ----
 handle(ptr,r){const h=r.get(r.pointerCell(ptr));if(h?.type!=='SD_HandleTypeDef')throw new Error('SD_HandleTypeDef 포인터가 필요합니다.');return h;}
 info(h,c){const s=h.fields.SdCard.value.fields,v={CardType:1,CardVersion:1,Class:0x5b5,RelCardAdd:0x1234,BlockNbr:c.disk.sectors,BlockSize:512,LogBlockNbr:c.disk.sectors,LogBlockSize:512};for(const [k,x]of Object.entries(v))s[k].value=x;return v;}
 sdio(h,r){if(!this.sd||this.sd.handle!==h)throw new Error('SDIO: HAL_SD_Init이 필요합니다.');const p=this.card('sdio');if(!p)return null;return {p,c:sdCardFor(p)};}
 *blocks(name,args,r){
  const [ptr,buf,addr,count,timeout]=args,h=this.handle(ptr,r),x=this.sdio(h,r),write=name.includes('Write');int(count,1,256,'SD 블록 수');checkRange(r,buf,count*512,'SD 버퍼');
  if(!x){h.fields.ErrorCode.value=0x80000000;return 1;}if(addr<0||addr+count>x.c.disk.sectors){h.fields.ErrorCode.value=0x200;return 1;}
  const us=count*this.sectorUs('sdio');if(timeout!==0xffffffff&&us/1000>timeout){yield timeout;h.fields.ErrorCode.value=0x80000000;return 3;}
  h.fields.State.value=3;yield us/1000;this.transfer(r,x.c,buf,addr,count,write);h.fields.State.value=1;return 0;
 }
 transfer(r,c,buf,addr,count,write){for(let i=0;i<count;i++){if(write)c.disk.write(addr+i,Uint8Array.from(readBytes(r,buf,i*512,512)));else writeBytes(r,buf,i*512,[...c.disk.read(addr+i)]);}if(write)c.dirty=true;this.hal.buses.report(r,'SDIO',`${write?'WRITE':'READ'} block ${addr} × ${count}`);}
 // ---- FatFs ----
 fsFor(r){
  const m=this.mounted;if(!m)throw new FatError(FR.NOT_ENABLED,'f_mount로 볼륨을 먼저 마운트하세요.');
  if(!m.fs){const p=this.card();if(!p)throw new FatError(FR.NOT_READY,'SD 카드가 연결되지 않았거나 전원이 없습니다.');const c=sdCardFor(p);m.part=p;m.card=c;m.mode=this.wiring(p);m.fs=new Fat32(c.disk);m.fs.clock=()=>r.microTime/1000;this.fillFatfs(r,m);}
  if(!this.card()||m.part&&!this.wiring(m.part))throw new FatError(FR.NOT_READY,'SD 카드 연결이 끊어졌습니다.');return m.fs;
 }
 fillFatfs(r,m){const st=m.cell?r.get(m.cell):null;if(st?.kind!=='struct')return;const set=(k,v)=>{if(st.fields[k])st.fields[k].value=v;};set('fs_type',3);set('n_fats',m.fs.fats);set('csize',m.fs.spc);set('n_fatent',m.fs.clusters+2);set('fsize',m.fs.fatSz);set('fatbase',m.fs.reserved);set('database',m.fs.data);set('dirbase',m.fs.root);set('free_clst',m.fs.freeCount());set('id',(m.id=(m.id||0)+1));}
 file(r,ptr){const f=r.get(r.pointerCell(ptr));if(f?.type!=='FIL')throw new Error('FIL 포인터가 필요합니다.');return {f,s:this.files.get(f)};}
 syncFil(f,s){const set=(k,v)=>{if(f.fields[k])f.fields[k].value=v;};set('fptr',s?.pos??0);set('fsize',s?.entry.size??0);set('flag',s?.mode??0);set('obj_id',s?1:0);set('sclust',s?.entry.cluster??0);}
 str(r,v){return typeof v==='string'?v:r.format([v]);}
 cost(sectors){const m=this.mounted;return Math.max(.001,sectors*this.sectorUs(m?.mode||'sdio')/1000);}
 setOut(r,ptr,value){if(ptr&&ptr!==0)r.set(r.pointerCell(ptr),value);}
 dirty(){if(this.mounted?.card){this.mounted.card.dirty=true;}}
 *fatfs(name,args,r){
  try{return yield* this.fatfsOp(name,args,r);}
  catch(e){if(e instanceof FatError){r.api.print?.(`[FatFs] ${name}: ${e.message}`);return e.code;}throw e;}
 }
 *fatfsOp(name,args,r){
  const [a,b,c,d,e]=args;
  if(name==='f_mount'){
   if(a===0||a===null){this.flush(true);this.mounted=null;return FR.OK;}const cell=r.pointerCell(a);if(r.get(cell)?.type!=='FATFS')throw new Error('f_mount: FATFS 포인터가 필요합니다.');
   this.mounted={cell,fs:null};if(c===1){this.fsFor(r);yield this.cost(2);}return FR.OK;
  }
  if(name==='f_mkfs'){
   const p=this.card();if(!p)throw new FatError(FR.NOT_READY,'SD 카드가 연결되지 않았습니다.');const card=sdCardFor(p);formatDisk(card.disk);card.dirty=true;if(this.mounted){this.mounted.fs=null;}yield this.cost(64);this.flush(true);return FR.OK;
  }
  const fs=this.fsFor(r);
  if(name==='f_open'){
   const {f}=this.file(r,a),path=this.str(r,b),mode=c|0;let entry=fs.resolve(path);if(entry?.root||entry&&entry.attr&0x10)throw new FatError(FR.NO_FILE,`폴더는 열 수 없습니다: ${path}`);
   if(entry&&mode&4)throw new FatError(FR.EXIST,`이미 있습니다: ${path}`);
   if(!entry){if(!(mode&(4|8|0x10)))throw new FatError(FR.NO_FILE,`파일이 없습니다: ${path}`);const pdir=fs.parent(path);entry=fs.create(pdir.dir,pdir.name,0x20,0);this.dirty();}
   else if(mode&8&&mode&2){fs.truncate(entry,0);fs.writeEntry(entry);this.dirty();}
   if(entry.attr&1&&mode&2)throw new FatError(FR.DENIED,'읽기 전용 파일입니다.');
   const s={entry,mode,pos:(mode&0x30)===0x30?entry.size:0,path};this.files.set(f,s);this.syncFil(f,s);yield this.cost(2);return FR.OK;
  }
  if(name==='f_opendir'){const d0=r.get(r.pointerCell(a));if(d0?.type!=='DIR')throw new Error('DIR 포인터가 필요합니다.');const entry=fs.resolve(this.str(r,b));if(!entry||!(entry.attr&0x10))throw new FatError(FR.NO_PATH,'폴더가 없습니다.');this.dirs.set(d0,{list:fs.entries(entry.cluster||fs.root).filter(x=>x.name!=='.'&&x.name!=='..'),index:0});d0.fields.obj_id.value=1;yield this.cost(1);return FR.OK;}
  if(name==='f_readdir'){const d0=r.get(r.pointerCell(a)),s=this.dirs.get(d0);if(!s)throw new FatError(FR.INVALID_OBJECT,'f_opendir가 필요합니다.');if(b===0){s.index=0;return FR.OK;}const x=s.list[s.index++];this.fillInfo(r,b,x);return FR.OK;}
  if(name==='f_closedir'){const d0=r.get(r.pointerCell(a));this.dirs.delete(d0);d0.fields.obj_id.value=0;return FR.OK;}
  if(name==='f_stat'){const x=fs.resolve(this.str(r,a));if(!x||x.root)throw new FatError(FR.NO_FILE,'파일이 없습니다.');if(b)this.fillInfo(r,b,x);return FR.OK;}
  if(name==='f_unlink'){fs.unlink(this.str(r,a));this.dirty();yield this.cost(3);this.flush(true);return FR.OK;}
  if(name==='f_rename'){fs.rename(this.str(r,a),this.str(r,b));this.dirty();yield this.cost(3);this.flush(true);return FR.OK;}
  if(name==='f_mkdir'){fs.mkdir(this.str(r,a));this.dirty();yield this.cost(3);this.flush(true);return FR.OK;}
  if(name==='f_getfree'){const free=fs.freeCount();this.setOut(r,b,free);if(c){r.set(r.pointerCell(c),{kind:'pointer',cell:this.mounted.cell});}this.fillFatfs(r,this.mounted);yield this.cost(Math.ceil(fs.fatSz/16));return FR.OK;}
  // file handle operations
  const {f,s}=this.file(r,a);if(!s)throw new FatError(FR.INVALID_OBJECT,'열리지 않은 파일입니다.');
  if(name==='f_close'||name==='f_sync'){if(s.mode&2){fs.writeEntry(s.entry);this.dirty();}if(name==='f_close'){this.files.delete(f);this.syncFil(f,null);}else this.syncFil(f,s);yield this.cost(2);this.flush(true);return FR.OK;}
  if(name==='f_lseek'){int(b,0,0xffffffff,'f_lseek 위치');if(b>s.entry.size&&s.mode&2){fs.writeAt(s.entry,s.entry.size,new Uint8Array(b-s.entry.size));this.dirty();}s.pos=Math.min(b,s.entry.size);this.syncFil(f,s);return FR.OK;}
  if(name==='f_truncate'){if(!(s.mode&2))throw new FatError(FR.DENIED,'쓰기 모드로 열지 않았습니다.');fs.truncate(s.entry,s.pos);fs.writeEntry(s.entry);this.dirty();this.syncFil(f,s);return FR.OK;}
  if(name==='f_read'){if(!(s.mode&1))throw new FatError(FR.DENIED,'읽기 모드로 열지 않았습니다.');int(c,0,131072,'f_read 길이');if(c)checkRange(r,b,c,'f_read 버퍼');const data=fs.readAt(s.entry,s.pos,c);if(data.length)writeBytes(r,b,0,[...data]);s.pos+=data.length;this.setOut(r,d,data.length);this.syncFil(f,s);yield this.cost(Math.ceil(data.length/512)+1);return FR.OK;}
  if(name==='f_write'){if(!(s.mode&2))throw new FatError(FR.DENIED,'쓰기 모드로 열지 않았습니다.');int(c,0,131072,'f_write 길이');const data=Uint8Array.from(c?readBytes(r,b,0,c):[]);return yield* this.put(r,fs,f,s,data,d);}
  throw new Error(`지원하지 않는 FatFs 함수: ${name}`);
 }
 *put(r,fs,f,s,data,outPtr){if(!(s.mode&2))throw new FatError(FR.DENIED,'쓰기 모드로 열지 않았습니다.');fs.writeAt(s.entry,s.pos,data);s.pos+=data.length;this.dirty();this.setOut(r,outPtr,data.length);this.syncFil(f,s);yield this.cost(Math.ceil(data.length/512)+1);return FR.OK;}
 fillInfo(r,ptr,x){
  const info=r.get(r.pointerCell(ptr));if(info?.type!=='FILINFO')throw new Error('FILINFO 포인터가 필요합니다.');const set=(k,v)=>info.fields[k].value=v,name=x?x.name:'';
  set('fsize',x?.size??0);set('fdate',x?.date??0);set('ftime',x?.time??0);set('fattrib',x?.attr??0);const cells=info.fields.fname.value.cells;for(let i=0;i<cells.length;i++)cells[i].value=i<name.length?name.charCodeAt(i):0;
 }
 // f_puts/f_printf/f_putc/f_gets: the FIL pointer is the last (or first for f_printf) argument.
 *text(name,args,r){
  try{
   const fs=this.fsFor(r);
   if(name==='f_gets'){const [buf,len,fp]=args,{f,s}=this.file(r,fp);if(!s)throw new FatError(FR.INVALID_OBJECT,'열리지 않은 파일입니다.');int(len,1,4096,'f_gets 길이');checkRange(r,buf,len,'f_gets 버퍼');const out=[];while(out.length<len-1&&s.pos<s.entry.size){const ch=fs.readAt(s.entry,s.pos,1)[0];s.pos++;out.push(ch);if(ch===10)break;}this.syncFil(f,s);if(!out.length)return 0;writeBytes(r,buf,0,[...out,0]);yield this.cost(1);return buf;}
   const fp=name==='f_printf'?args[0]:args.at(-1),{f,s}=this.file(r,fp);if(!s)throw new FatError(FR.INVALID_OBJECT,'열리지 않은 파일입니다.');
   const text=name==='f_putc'?String.fromCharCode(args[0]&255):name==='f_puts'?this.str(r,args[0]):formatPrintf(args.slice(1),r),data=new TextEncoder().encode(text);
   const res=yield* this.put(r,fs,f,s,data,0);return res===FR.OK?data.length:-1;
  }catch(e){if(e instanceof FatError){r.api.print?.(`[FatFs] ${name}: ${e.message}`);return name==='f_gets'?0:-1;}throw e;}
 }
 invoke(name,args,r){
  if(/^HAL_SD_(Read|Write)Blocks$/.test(name))return this.blocks(name,args,r);
  if(name==='HAL_SD_IRQHandler'){this.handle(args[0],r);return this.hal.drain(r,'SDIO_IRQn');}
  if(['f_puts','f_printf','f_putc','f_gets'].includes(name))return this.text(name,args,r);
  if(/^f_(mount|open|close|read|write|lseek|sync|truncate|unlink|rename|mkdir|opendir|readdir|closedir|stat|getfree|mkfs)$/.test(name))return this.fatfs(name,args,r);
  return null;
 }
 declareGlobals(r){
  const declared=new Set(r.program.globals.flatMap(s=>(s.declarations||[]).map(d=>d.name))),add=(name,make,type)=>{if(declared.has(name)||r.program.functions[name])return;const cell=r.declareCell(name,make());cell.dataType=type;};
  add('SDPath',()=>{const a=r.array([48,58,47,0]);a.cells.forEach(c=>c.dataType='char');return a;},'char');add('USERPath',()=>{const a=r.array([48,58,47,0]);a.cells.forEach(c=>c.dataType='char');return a;},'char');
  for(const [n,t]of [['SDFatFS','FATFS'],['SDFile','FIL'],['USERFatFS','FATFS'],['USERFile','FIL']])add(n,()=>r.defaultValue(t,r.globals),t);
  for(const n of ['retSD','retUSER'])add(n,()=>0,'uint8_t');
 }
 call(name,args,r){
  const hal=this.hal,[a,b,c,d]=args;
  if(name==='f_size'||name==='f_tell'||name==='f_eof'||name==='f_error'){const {s}=this.file(r,a);if(!s)return 0;return name==='f_size'?s.entry.size:name==='f_tell'?s.pos:name==='f_eof'?Number(s.pos>=s.entry.size):0;}
  if(name==='MX_FATFS_Init'){if(r.program.functions[name])return undefined;return 0;}
  if(name==='FATFS_LinkDriver'||name==='FATFS_UnLinkDriver'){if(b&&b!==0){const p=r.pointer(b);if(p.array){'0:/\0'.split('').forEach((ch,i)=>r.set(r.pointerCell(p,i),ch.charCodeAt(0)));}}return 0;}
  if(name==='BSP_SD_IsDetected')return this.card()?1:0;
  if(name==='get_fattime'){const t=new Date(Date.UTC(2026,0,1)+Math.floor(r.microTime/1000));return (((t.getUTCFullYear()-1980)<<25)|((t.getUTCMonth()+1)<<21)|(t.getUTCDate()<<16)|(t.getUTCHours()<<11)|(t.getUTCMinutes()<<5)|(t.getUTCSeconds()>>1))>>>0;}
  if(!name.startsWith('HAL_SD_')&&name!=='__HAL_RCC_SDIO_CLK_ENABLE')return undefined;if(name==='__HAL_RCC_SDIO_CLK_ENABLE')return 0;
  const h=this.handle(a,r);
  if(name==='HAL_SD_Init'){
   if(hal.field(h,'Instance')!=='SDIO'||!hal.config.peripherals.SDIO?.enabled)throw new Error('SDIO: Pinout & Configuration에서 SDIO를 활성화하세요.');
   hal.callback(r,'HAL_SD_MspInit',[a]);this.sd={handle:h,wide:false};const p=this.card('sdio');if(!p){h.fields.ErrorCode.value=0x80000000;h.fields.State.value=0;r.warn('[SD] SDIO에 연결된 SD 카드가 없습니다(CLK=PC12, CMD=PD2, D0=PC8, 전원 확인).');return 1;}
   this.info(h,sdCardFor(p));h.fields.State.value=1;h.fields.ErrorCode.value=0;return 0;
  }
  if(name==='HAL_SD_DeInit'){this.sd=null;h.fields.State.value=0;return 0;}
  if(name==='HAL_SD_ConfigWideBusOperation'){const x=this.sdio(h,r);if(!x)return 1;if(b===0x800){const pins=hal.config.pins,ok=['SDIO_D1','SDIO_D2','SDIO_D3'].every(f=>Object.values(pins).some(p=>p.function===f));if(!ok){h.fields.ErrorCode.value=0x10000000;return 1;}this.sd.wide=true;}else if(b===0)this.sd.wide=false;else return 1;return 0;}
  if(name==='HAL_SD_GetCardInfo'){const x=this.sdio(h,r);if(!x)return 1;const v=this.info(h,x.c),info=r.get(r.pointerCell(b));for(const [k,val]of Object.entries(v))if(info.fields[k])info.fields[k].value=val;return 0;}
  if(name==='HAL_SD_GetCardState'){const x=this.sdio(h,r);if(!x)return 0xff;return this.busy?.handle===h?(this.busy.write?7:5):4;}
  if(name==='HAL_SD_GetState')return h.fields.State.value;if(name==='HAL_SD_GetError')return h.fields.ErrorCode.value;
  if(name==='HAL_SD_Erase'){const x=this.sdio(h,r);if(!x)return 1;for(let n=b;n<=c;n++)x.c.disk.write(n,new Uint8Array(512));x.c.dirty=true;return 0;}
  if(name==='HAL_SD_Abort'){if(this.busy){this.busy.cancel=true;this.busy=null;}h.fields.State.value=1;return 0;}
  const m=/^HAL_SD_(Read|Write)Blocks_(IT|DMA)$/.exec(name);if(!m)throw new Error(`지원하지 않는 HAL API: ${name}`);
  const x=this.sdio(h,r),write=m[1]==='Write',[,buf,addr,count]=args;int(count,1,256,'SD 블록 수');checkRange(r,buf,count*512,'SD 버퍼');if(this.busy)return 2;if(!x)return 1;if(addr+count>x.c.disk.sectors){h.fields.ErrorCode.value=0x200;return 1;}
  const cb=write?'HAL_SD_TxCpltCallback':'HAL_SD_RxCpltCallback',job={handle:h,write};this.busy=job;h.fields.State.value=3;const us=count*this.sectorUs('sdio'),self=this;
  let irq='SDIO_IRQn';if(m[2]==='DMA'){const link=hal.dma.check(hal.dma.linked(r,h,write?'hdmatx':'hdmarx','SDIO'),write?'SDIO_TX':'SDIO_RX',write?0x40:0);irq=link.st.irq;}hal.noticeIrq.add(irq);
  r.event((r.microTime+us)/1000,()=>{if(job.cancel)return;self.transfer(r,x.c,buf,addr,count,write);self.busy=null;h.fields.State.value=1;hal.queue(irq,function*(){yield* hal.userCall(r,cb,[a]);},'SDIO:'+cb);});return 0;
 }
}
