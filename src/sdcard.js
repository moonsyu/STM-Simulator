// In-memory SD card: sparse 512-byte sectors, a FAT32 volume (8.3 names, FatFs FF_USE_LFN=0 style)
// and a compact project encoding: 'SD1:<sizeMB>:<base64 of [u32 sector][zero-RLE 512 B]...>'.
// UI helpers: formatImage, listFiles, readFile, writeFile, deleteFile operate on the encoded string.
export const SD_SIZES=[64,128,256],SD_DEFAULT_MB=64,SD_IMAGE_LIMIT=4*1024*1024;
const B64=typeof btoa==='function'?{enc:s=>btoa(s),dec:s=>atob(s)}:{enc:s=>Buffer.from(s,'binary').toString('base64'),dec:s=>Buffer.from(s,'base64').toString('binary')};
export class SparseDisk{
 constructor(sizeMB=SD_DEFAULT_MB){if(!SD_SIZES.includes(sizeMB))throw new Error(`SD 카드 용량은 ${SD_SIZES.join('/')} MB 중에서 선택하세요.`);this.sizeMB=sizeMB;this.sectors=sizeMB*2048;this.map=new Map();this.version=0;}
 read(n){if(!Number.isInteger(n)||n<0||n>=this.sectors)throw new Error(`SD 블록 주소 범위를 벗어났습니다: ${n}`);const s=this.map.get(n);return s?s.slice():new Uint8Array(512);}
 write(n,data){if(!Number.isInteger(n)||n<0||n>=this.sectors)throw new Error(`SD 블록 주소 범위를 벗어났습니다: ${n}`);const s=Uint8Array.from(data.slice(0,512));if(s.length<512){const t=new Uint8Array(512);t.set(s);return this.write(n,t);}if(s.every(v=>v===0))this.map.delete(n);else this.map.set(n,s);this.version++;}
 encode(){
  const out=[];const u32=v=>out.push(v&255,v>>8&255,v>>16&255,v>>>24);
  for(const n of [...this.map.keys()].sort((a,b)=>a-b)){u32(n);const s=this.map.get(n);for(let i=0;i<512;){if(s[i]){out.push(s[i++]);continue;}let k=0;while(i<512&&!s[i]&&k<255){i++;k++;}out.push(0,k);}}
  let bin='';for(let i=0;i<out.length;i+=8192)bin+=String.fromCharCode(...out.slice(i,i+8192));
  const text=`SD1:${this.sizeMB}:${B64.enc(bin)}`;if(text.length>SD_IMAGE_LIMIT)throw new Error('SD 카드 이미지가 프로젝트 저장 한도(4 MB)를 넘었습니다. 파일을 줄이세요.');return text;
 }
 static decode(text){
  const m=/^SD1:(\d+):([A-Za-z0-9+/=]*)$/.exec(text||'');if(!m)throw new Error('SD 카드 이미지 형식이 올바르지 않습니다.');
  const disk=new SparseDisk(Number(m[1])),bin=B64.dec(m[2]);let i=0;
  while(i<bin.length){const n=(bin.charCodeAt(i)|bin.charCodeAt(i+1)<<8|bin.charCodeAt(i+2)<<16|bin.charCodeAt(i+3)<<24)>>>0;i+=4;const s=new Uint8Array(512);let k=0;while(k<512){const b=bin.charCodeAt(i++);if(b){s[k++]=b;continue;}k+=bin.charCodeAt(i++);}if(k!==512)throw new Error('SD 카드 이미지가 손상되었습니다.');disk.map.set(n,s);}
  return disk;
 }
}
export const validCardImage=v=>v===''||typeof v==='string'&&v.length<=SD_IMAGE_LIMIT&&/^SD1:(64|128|256):[A-Za-z0-9+/=]*$/.test(v);
const le16=(b,o)=>b[o]|b[o+1]<<8,le32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;
const set16=(b,o,v)=>{b[o]=v&255;b[o+1]=v>>8&255;},set32=(b,o,v)=>{b[o]=v&255;b[o+1]=v>>8&255;b[o+2]=v>>16&255;b[o+3]=v>>>24&255;};
export const FR={OK:0,DISK_ERR:1,INT_ERR:2,NOT_READY:3,NO_FILE:4,NO_PATH:5,INVALID_NAME:6,DENIED:7,EXIST:8,INVALID_OBJECT:9,WRITE_PROTECTED:10,INVALID_DRIVE:11,NOT_ENABLED:12,NO_FILESYSTEM:13,MKFS_ABORTED:14,TIMEOUT:15,LOCKED:16,NOT_ENOUGH_CORE:17,TOO_MANY_OPEN_FILES:18,INVALID_PARAMETER:19};
export class FatError extends Error{constructor(code,message){super(message||`FatFs 오류 ${code}`);this.code=code;}}
const fail=(code,msg)=>{throw new FatError(code,msg);};
// 8.3 short names (FF_USE_LFN=0): up to 8+3 characters, uppercase.
export function shortName(name){
 const m=/^([^.]{1,8})(?:\.([^.]{1,3}))?$/.exec(name);if(!m||name==='.'||name==='..')fail(FR.INVALID_NAME,`8.3 형식이 아닌 파일 이름: ${name}`);
 const bad=/[^A-Z0-9!#$%&'()\-@^_`{}~]/;const base=m[1].toUpperCase(),ext=(m[2]||'').toUpperCase();if(bad.test(base)||bad.test(ext))fail(FR.INVALID_NAME,`파일 이름에 사용할 수 없는 문자: ${name}`);
 return base.padEnd(8,' ')+ext.padEnd(3,' ');
}
export const displayName=raw=>{const base=raw.slice(0,8).trimEnd(),ext=raw.slice(8,11).trimEnd();return ext?`${base}.${ext}`:base;};
const splitPath=path=>String(path).replace(/^\d+:/,'').split('/').filter(Boolean);
export function fatTime(ms=0){const d=new Date(Date.UTC(2026,0,1)+Math.floor(ms));return {date:((d.getUTCFullYear()-1980)<<9)|((d.getUTCMonth()+1)<<5)|d.getUTCDate(),time:(d.getUTCHours()<<11)|(d.getUTCMinutes()<<5)|(d.getUTCSeconds()>>1)};}
export function formatDisk(disk,label='STMSIM'){
 disk.map.clear();const total=disk.sectors,reserved=32,spc=1,fatSz=Math.ceil((total-reserved)/129),data=reserved+2*fatSz,clusters=Math.floor((total-data)/spc);
 const bs=new Uint8Array(512);bs.set([0xeb,0x58,0x90]);bs.set([...'MSDOS5.0'].map(c=>c.charCodeAt(0)),3);set16(bs,11,512);bs[13]=spc;set16(bs,14,reserved);bs[16]=2;bs[21]=0xf8;set16(bs,24,63);set16(bs,26,255);set32(bs,32,total);set32(bs,36,fatSz);set32(bs,44,2);set16(bs,48,1);set16(bs,50,6);bs[64]=0x80;bs[66]=0x29;set32(bs,67,0x20261020);
 bs.set([...label.toUpperCase().padEnd(11,' ').slice(0,11)].map(c=>c.charCodeAt(0)),71);bs.set([...'FAT32   '].map(c=>c.charCodeAt(0)),82);bs[510]=0x55;bs[511]=0xaa;
 disk.write(0,bs);disk.write(6,bs);const fsi=new Uint8Array(512);set32(fsi,0,0x41615252);set32(fsi,484,0x61417272);set32(fsi,488,clusters-1);set32(fsi,492,3);fsi[510]=0x55;fsi[511]=0xaa;disk.write(1,fsi);disk.write(7,fsi);
 const fat=new Uint8Array(512);set32(fat,0,0x0ffffff8);set32(fat,4,0x0fffffff);set32(fat,8,0x0fffffff);disk.write(reserved,fat);disk.write(reserved+fatSz,fat);
 const root=new Uint8Array(512);root.set([...label.toUpperCase().padEnd(11,' ').slice(0,11)].map(c=>c.charCodeAt(0)),0);root[11]=0x08;disk.write(data,root);
 return disk;
}
export class Fat32{
 constructor(disk){
  this.disk=disk;const b=disk.read(0);if(b[510]!==0x55||b[511]!==0xaa||le16(b,11)!==512||le32(b,36)===0||String.fromCharCode(...b.slice(82,87))!=='FAT32')fail(FR.NO_FILESYSTEM,'FAT32 파일시스템이 없습니다. f_mkfs로 포맷하세요.');
  this.spc=b[13];this.reserved=le16(b,14);this.fats=b[16];this.fatSz=le32(b,36);this.root=le32(b,44);this.total=le32(b,32);this.data=this.reserved+this.fats*this.fatSz;this.clusters=Math.floor((this.total-this.data)/this.spc);this.clock=()=>0;
  const fsi=disk.read(1);this.freeHint=le32(fsi,488);this.nextHint=le32(fsi,492)||3;
 }
 get clusterBytes(){return this.spc*512;}
 sector(c){return this.data+(c-2)*this.spc;}
 fat(c){const off=c*4,s=this.reserved+Math.floor(off/512),b=this.disk.read(s);return le32(b,off%512)&0x0fffffff;}
 setFat(c,v){const off=c*4;for(let f=0;f<this.fats;f++){const s=this.reserved+f*this.fatSz+Math.floor(off/512),b=this.disk.read(s);set32(b,off%512,(le32(b,off%512)&0xf0000000)|(v&0x0fffffff));this.disk.write(s,b);}}
 chain(c){const out=[];while(c>=2&&c<0x0ffffff8&&out.length<=this.clusters){out.push(c);c=this.fat(c);}return out;}
 freeCount(){let free=0;for(let i=0;i<this.fatSz;i++){const s=this.reserved+i,first=i*128,last=Math.min(first+128,this.clusters+2);if(first>=this.clusters+2)break;if(!this.disk.map.has(s)){free+=last-Math.max(first,2);continue;}const b=this.disk.read(s);for(let c=Math.max(first,2);c<last;c++)if(!(le32(b,(c-first)*4)&0x0fffffff))free++;}return free;}
 alloc(prev=0){
  for(let n=0,c=Math.max(2,this.nextHint);n<this.clusters;n++,c=c+1>=this.clusters+2?2:c+1){if(this.fat(c))continue;this.setFat(c,0x0fffffff);if(prev)this.setFat(prev,c);this.nextHint=c+1;for(let i=0;i<this.spc;i++)this.disk.write(this.sector(c)+i,new Uint8Array(512));this.syncInfo(-1);return c;}
  fail(FR.DENIED,'SD 카드에 남은 공간이 없습니다.');
 }
 freeChain(c){let n=0;for(const x of this.chain(c)){this.setFat(x,0);n++;}if(n)this.syncInfo(n);}
 syncInfo(delta){const fsi=this.disk.read(1);if(le32(fsi,488)!==0xffffffff)set32(fsi,488,le32(fsi,488)+delta);set32(fsi,492,this.nextHint);this.disk.write(1,fsi);}
 // Directory entries of a directory cluster chain: {name, attr, cluster, size, sector, offset}.
 entries(dirCluster,{all=false}={}){
  const out=[];for(const c of this.chain(dirCluster))for(let i=0;i<this.spc;i++){const sector=this.sector(c)+i,b=this.disk.read(sector);for(let o=0;o<512;o+=32){if(b[o]===0)return out;if(b[o]===0xe5&&!all)continue;const attr=b[o+11];if(attr===0x0f||attr&0x08&&!all)continue;out.push({raw:String.fromCharCode(...b.slice(o,o+11)),name:displayName(String.fromCharCode(...b.slice(o,o+11))),attr,cluster:le16(b,o+20)<<16|le16(b,o+26),size:le32(b,o+28),date:le16(b,o+24),time:le16(b,o+22),sector,offset:o,deleted:b[o]===0xe5});}}
  return out;
 }
 resolve(path){
  let cluster=this.root,entry={attr:0x10,cluster:this.root,name:'',root:true};
  for(const part of splitPath(path)){if(!(entry.attr&0x10))fail(FR.NO_PATH,`경로가 없습니다: ${path}`);if(part==='.')continue;const raw=shortName(part);entry=this.entries(cluster).find(e=>e.raw===raw);if(!entry)return null;cluster=entry.cluster||this.root;}
  return entry;
 }
 parent(path){const parts=splitPath(path);if(!parts.length)fail(FR.INVALID_NAME,'파일 이름이 없습니다.');const dir=this.resolve(parts.slice(0,-1).join('/'));if(!dir)fail(FR.NO_PATH,`폴더가 없습니다: ${parts.slice(0,-1).join('/')}`);if(!(dir.attr&0x10))fail(FR.NO_PATH,`폴더가 아닙니다: ${parts.slice(0,-1).join('/')}`);return {dir:dir.cluster||this.root,name:shortName(parts.at(-1)),display:parts.at(-1)};}
 writeEntry(e){const b=this.disk.read(e.sector),o=e.offset;b.set([...e.raw].map(c=>c.charCodeAt(0)),o);b[o+11]=e.attr;set16(b,o+20,e.cluster>>16);set16(b,o+26,e.cluster&0xffff);set32(b,o+28,e.size);const t=fatTime(this.clock());set16(b,o+22,t.time);set16(b,o+24,t.date);set16(b,o+14,t.time);set16(b,o+16,t.date);set16(b,o+18,t.date);this.disk.write(e.sector,b);}
 create(dirCluster,raw,attr,cluster=0){
  let last=0;for(const c of this.chain(dirCluster)){last=c;for(let i=0;i<this.spc;i++){const sector=this.sector(c)+i,b=this.disk.read(sector);for(let o=0;o<512;o+=32)if(b[o]===0||b[o]===0xe5){const e={raw,attr,cluster,size:0,sector,offset:o};this.writeEntry(e);return e;}}}
  const c=this.alloc(last),e={raw,attr,cluster,size:0,sector:this.sector(c),offset:0};this.writeEntry(e);return e;
 }
 remove(e){const b=this.disk.read(e.sector);b[e.offset]=0xe5;this.disk.write(e.sector,b);}
 mkdir(path){const {dir,name}=this.parent(path);if(this.entries(dir).some(e=>e.raw===name))fail(FR.EXIST,`이미 있습니다: ${path}`);const c=this.alloc(),e=this.create(dir,name,0x10,c),b=new Uint8Array(512);
  const dot=(o,n,cl)=>{b.set([...n].map(ch=>ch.charCodeAt(0)),o);b[o+11]=0x10;set16(b,o+20,cl>>16);set16(b,o+26,cl&0xffff);};dot(0,'.          ',c);dot(32,'..         ',dir===this.root?0:dir);this.disk.write(this.sector(c),b);return e;}
 unlink(path){const {dir,name}=this.parent(path),e=this.entries(dir).find(x=>x.raw===name);if(!e)fail(FR.NO_FILE,`파일이 없습니다: ${path}`);if(e.attr&0x01)fail(FR.DENIED,'읽기 전용 파일입니다.');if(e.attr&0x10&&this.entries(e.cluster).some(x=>!x.name.startsWith('.')))fail(FR.DENIED,'비어 있지 않은 폴더입니다.');this.remove(e);if(e.cluster)this.freeChain(e.cluster);}
 rename(from,to){const a=this.parent(from),e=this.entries(a.dir).find(x=>x.raw===a.name);if(!e)fail(FR.NO_FILE,`파일이 없습니다: ${from}`);const b=this.parent(to);if(this.entries(b.dir).some(x=>x.raw===b.name))fail(FR.EXIST,`이미 있습니다: ${to}`);const n=this.create(b.dir,b.name,e.attr,e.cluster);n.size=e.size;this.writeEntry(n);this.remove(e);}
 readAt(f,pos,count){
  const out=new Uint8Array(Math.max(0,Math.min(count,f.size-pos)));if(!out.length)return out;const cs=this.clusterBytes,chain=this.chain(f.cluster);let done=0;
  while(done<out.length){const p=pos+done,c=chain[Math.floor(p/cs)],within=p%cs,sec=this.sector(c)+Math.floor(within/512),o=within%512,b=this.disk.read(sec),n=Math.min(512-o,out.length-done);out.set(b.subarray(o,o+n),done);done+=n;}
  return out;
 }
 writeAt(f,pos,bytes){
  const cs=this.clusterBytes,need=Math.ceil((pos+bytes.length)/cs);if(!f.cluster&&bytes.length){f.cluster=this.alloc();}let chain=f.cluster?this.chain(f.cluster):[];
  while(chain.length<need){chain.push(this.alloc(chain.at(-1)));}
  let done=0;while(done<bytes.length){const p=pos+done,c=chain[Math.floor(p/cs)],within=p%cs,sec=this.sector(c)+Math.floor(within/512),o=within%512,b=this.disk.read(sec),n=Math.min(512-o,bytes.length-done);b.set(bytes.subarray?bytes.subarray(done,done+n):bytes.slice(done,done+n),o);this.disk.write(sec,b);done+=n;}
  f.size=Math.max(f.size,pos+bytes.length);
 }
 truncate(f,size){const cs=this.clusterBytes,keep=Math.ceil(size/cs),chain=this.chain(f.cluster);if(keep===0&&f.cluster){this.freeChain(f.cluster);f.cluster=0;}else if(chain.length>keep){this.freeChain(chain[keep]);this.setFat(chain[keep-1],0x0fffffff);}f.size=Math.min(f.size,size);}
 list(dir=this.root,prefix=''){const out=[];for(const e of this.entries(dir)){if(e.name==='.'||e.name==='..')continue;const path=prefix+'/'+e.name;out.push({path,name:e.name,size:e.size,dir:!!(e.attr&0x10),attr:e.attr,date:e.date,time:e.time});if(e.attr&0x10&&e.cluster)out.push(...this.list(e.cluster,path));}return out;}
}
// Card from a project property ('' = freshly formatted 64 MB FAT32 card).
export function openImage(image,sizeMB=SD_DEFAULT_MB){if(!image)return formatDisk(new SparseDisk(SD_SIZES.includes(sizeMB)?sizeMB:SD_DEFAULT_MB));return SparseDisk.decode(image);}
export function formatImage(sizeMB=SD_DEFAULT_MB,label='STMSIM'){return formatDisk(new SparseDisk(sizeMB),label).encode();}
export function listFiles(image){return new Fat32(openImage(image)).list();}
export function readFile(image,path){const fs=new Fat32(openImage(image)),e=fs.resolve(path);if(!e||e.root||e.attr&0x10)throw new FatError(FR.NO_FILE,`파일이 없습니다: ${path}`);return fs.readAt(e,0,e.size);}
export function writeFile(image,path,bytes){
 const disk=openImage(image),fs=new Fat32(disk),parts=splitPath(path);let dirPath='';
 for(const part of parts.slice(0,-1)){dirPath+='/'+part;if(!fs.resolve(dirPath))fs.mkdir(dirPath);}
 const data=bytes instanceof Uint8Array?bytes:typeof bytes==='string'?new TextEncoder().encode(bytes):Uint8Array.from(bytes);
 let e=fs.resolve(path);if(e&&e.attr&0x10)throw new FatError(FR.DENIED,`폴더입니다: ${path}`);if(!e){const p=fs.parent(path);e=fs.create(p.dir,p.name,0x20,0);}
 if(e.cluster)fs.truncate(e,0);e.size=0;fs.writeAt(e,0,data);fs.writeEntry(e);return disk.encode();
}
export function deleteFile(image,path){const disk=openImage(image),fs=new Fat32(disk);fs.unlink(path);return disk.encode();}
// Shared card object of an SD part in one simulation session (SPI mode, SDIO and FatFs use it).
export function sdCardFor(part){const st=part.catalogState??={};if(!st.sd){st.sd={disk:openImage(part.cardImage||'',part.sizeMB),dirty:false,blocks:null};st.sd.blocks=st.sd.disk.sectors;}return st.sd;}
