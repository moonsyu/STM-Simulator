import test from 'node:test';
import assert from 'node:assert/strict';
import {run,advance,pin} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {boardPin} from '../../src/pins.js';
import {validateMcu,generateHal} from '../../src/mcu-config.js';
import {validateProject} from '../../src/project.js';
import {formatImage,listFiles,readFile,writeFile,deleteFile,validCardImage,SparseDisk,Fat32,openImage,FR} from '../../src/sdcard.js';
import {resetCatalogBus,transferCatalogSpi} from '../../src/catalog-buses.js';

const text=b=>new TextDecoder().decode(b);
test('SD image helpers: format, write, list, read, delete and compact encoding with a 4 MB cap',()=>{
 let img=formatImage(64);assert.ok(validCardImage(img)&&img.length<1000);assert.deepEqual(listFiles(img),[]);
 img=writeFile(img,'/LOGS/DAY1.TXT','hello\n');img=writeFile(img,'readme.txt',new Uint8Array(5000).fill(65));
 assert.deepEqual(listFiles(img).map(f=>[f.path,f.size,f.dir]),[['/LOGS',0,true],['/LOGS/DAY1.TXT',6,false],['/README.TXT',5000,false]]);
 assert.equal(text(readFile(img,'/logs/day1.txt')),'hello\n');assert.equal(readFile(img,'README.TXT')[4999],65);
 img=deleteFile(img,'/README.TXT');assert.equal(listFiles(img).length,2);assert.throws(()=>readFile(img,'/NOPE.TXT'),/없습니다/);
 assert.throws(()=>writeFile(img,'/a-very-long-name.txt','x'),/8\.3/);assert.throws(()=>new SparseDisk(10),/64\/128\/256/);
 const fs=new Fat32(openImage(img));assert.equal(fs.clusters,129008);assert.ok(fs.freeCount()>129000);
 assert.ok(!validCardImage('SD1:64:'+'A'.repeat(4*1024*1024)));assert.throws(()=>new Fat32(new SparseDisk(64)),/FAT32/);
});
test('SPI-mode SD card answers CMD17 single block read and CMD24 write with data tokens',()=>{
 const part={id:'sd',catalogVariant:'sd-storage-board',catalogState:{},cardImage:writeFile(formatImage(),'/A.TXT','abc')},s=resetCatalogBus(part),x=v=>transferCatalogSpi(part,s,v);
 const cmd=(c,arg,crc=1)=>{[0x40|c,arg>>>24,(arg>>16)&255,(arg>>8)&255,arg&255,crc].forEach(x);let r=255;for(let i=0;i<8&&r===255;i++)r=x(255);return r;};
 assert.equal(cmd(0,0,0x95),1);cmd(8,0x1aa,0x87);for(let i=0;i<4;i++)x(255);cmd(55,0);assert.equal(cmd(41,0x40000000),0);
 assert.equal(cmd(24,2000),0);x(255);x(0xfe);for(let i=0;i<512;i++)x(i&255);x(0xff);x(0xff);assert.equal(x(255)&0x1f,5);while(x(255)!==255);
 assert.equal(cmd(17,2000),0);let t=255;while(t===255)t=x(255);assert.equal(t,0xfe);const data=Array.from({length:512},()=>x(255));assert.deepEqual(data.slice(0,4),[0,1,2,3]);assert.equal(data[511],255);x(255);x(255);
 assert.equal(cmd(9,0),0);while(x(255)!==0xfe);const csd=Array.from({length:16},()=>x(255));assert.equal(((csd[7]&0x3f)<<16|csd[8]<<8|csd[9])+1,64*2);
 assert.ok(part.catalogState.sd.dirty);
});
test('FatFs logger example writes LOG.TXT through SPI wiring; the card image persists in the project',()=>{
 const p=halExample('sd_logger'),saved=[];const {s,output}=run(p,{storage:(id,image)=>saved.push([id,image])});advance(s,2600,10);
 assert.match(output.join('|'),/SD free: \d+ KB/);assert.ok(output.some(x=>/^LOG\.TXT size=\d+/.test(x)));assert.ok(output.some(x=>/^first line: t=\d+ sample=0/.test(x)));
 const files=s.storage.files('demo');assert.equal(files[0].path,'/LOG.TXT');assert.match(text(s.storage.readFile('demo','/LOG.TXT')),/sample=4\n/);
 assert.ok(saved.length&&saved.at(-1)[0]==='demo');s.storage.applyTo(p);assert.ok(p.components[0].cardImage.startsWith('SD1:64:'));
 const reloaded=validateProject(JSON.parse(JSON.stringify(p)));const again=run(reloaded);assert.match(text(again.s.storage.readFile('demo','/LOG.TXT')),/sample=4/);
});
test('FatFs API: directories, stat, rename, seek/read, FRESULT errors and f_mkfs',()=>{
 const p=halExample('sd_logger');p.code=p.code.replace(/\/\* USER CODE BEGIN 3 \*\/[\s\S]*?\/\* USER CODE END 3 \*\//,`/* USER CODE BEGIN 3 */
    HAL_Delay(100);
    /* USER CODE END 3 */`).replace('  DWORD freeClusters','  FIL f; DIR d; FILINFO info; UINT n = 0; char buf[16] = {0};\n  printf("mkdir=%d again=%d\\n", f_mkdir("DATA"), f_mkdir("DATA"));\n  printf("open missing=%d badname=%d\\n", f_open(&f, "DATA/NONE.TXT", FA_READ), f_open(&f, "DATA/too-long-name.txt", FA_CREATE_ALWAYS | FA_WRITE));\n  f_open(&f, "DATA/A.TXT", FA_CREATE_NEW | FA_WRITE); f_write(&f, "0123456789", 10, &n); f_puts("AB", &f); f_close(&f);\n  printf("written=%u new again=%d\\n", n, f_open(&f, "DATA/A.TXT", FA_CREATE_NEW | FA_WRITE));\n  f_open(&f, "DATA/A.TXT", FA_READ); f_lseek(&f, 8); f_read(&f, buf, 8, &n); printf("read=%u %s eof=%d size=%lu\\n", n, buf, f_eof(&f), f_size(&f)); f_close(&f);\n  printf("rename=%d stat=%d\\n", f_rename("DATA/A.TXT", "DATA/B.TXT"), f_stat("DATA/B.TXT", &info)); printf("info %s %lu dir=%d\\n", info.fname, info.fsize, (info.fattrib & AM_DIR) != 0);\n  f_opendir(&d, "/"); while (f_readdir(&d, &info) == FR_OK && info.fname[0]) printf("entry %s\\n", info.fname); f_closedir(&d);\n  printf("unlink dir=%d file=%d\\n", f_unlink("DATA"), f_unlink("DATA/B.TXT"));\n  printf("mkfs=%d mount=%d\\n", f_mkfs("", FM_FAT32, 0, buf, sizeof(buf)), f_mount(&SDFatFS, SDPath, 1));\n  printf("after mkfs=%d\\n", f_stat("DATA", &info));\n  DWORD freeClusters');
 const {s,output}=run(p);advance(s,400,10);
 assert.deepEqual(output.filter(x=>!x.startsWith('[FatFs]')&&!x.startsWith('SD free')),['mkdir=0 again=8','open missing=4 badname=6','written=10 new again=8','read=4 89AB eof=1 size=12','rename=0 stat=0','info B.TXT 12 dir=0','entry DATA','unlink dir=7 file=0','mkfs=0 mount=0','after mkfs=4']);
 const none=halExample('sd_logger');none.components=[];none.wires=[];const r=run(none);advance(r.s,10);assert.ok(r.output.includes('f_mount failed: 3'));
});
test('SDIO HAL: init, 4-bit bus, card info, block write/read (blocking and DMA) on the same FAT32 card',()=>{
 const p=halExample('sd_logger'),w=to=>p.wires.find(x=>x.to===to);w('part:demo:p6').from=boardPin('PD2');w('part:demo:p7').from=boardPin('PC12');w('part:demo:p5').from=boardPin('PC11');w('part:demo:p2').from=boardPin('PC8');
 p.wires=p.wires.filter(x=>x.to!=='part:demo:p9');p.wires.push({id:'d1',from:boardPin('PC9'),to:'part:demo:p3',color:'#23a68a'},{id:'d2',from:boardPin('PC10'),to:'part:demo:p4',color:'#23a68a'});
 p.mcu.pins={PC8:pin('SDIO_D0'),PC9:pin('SDIO_D1'),PC10:pin('SDIO_D2'),PC11:pin('SDIO_D3'),PC12:pin('SDIO_CK'),PD2:pin('SDIO_CMD')};p.mcu.peripherals={SDIO:{enabled:true}};p.mcu.dma={SDIO_RX:{stream:'DMA2_Stream3',channel:4},SDIO_TX:{stream:'DMA2_Stream6',channel:4}};p.mcu.nvic={SDIO_IRQn:{enabled:true,priority:1}};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {','uint8_t block[512], back[512];\nint main(void) {').replace('  /* USER CODE BEGIN 2 */',`  /* USER CODE BEGIN 2 */
  printf("init=%d wide=%d\\n", HAL_SD_Init(&hsd), HAL_SD_ConfigWideBusOperation(&hsd, SDIO_BUS_WIDE_4B));
  HAL_SD_CardInfoTypeDef info; HAL_SD_GetCardInfo(&hsd, &info); printf("blocks=%lu size=%lu state=%lu\\n", info.BlockNbr, info.BlockSize, HAL_SD_GetCardState(&hsd));
  for (int i = 0; i < 512; i += 64) block[i] = i / 64 + 1;
  printf("write=%d\\n", HAL_SD_WriteBlocks(&hsd, block, 5000, 1, 100));
  printf("read=%d %u %u\\n", HAL_SD_ReadBlocks(&hsd, back, 5000, 1, 100), back[0], back[448]);
  HAL_SD_ReadBlocks_DMA(&hsd, back, 0, 1);
  printf("fatfs=%d\\n", f_mount(&SDFatFS, SDPath, 1));`)+'\nvoid HAL_SD_RxCpltCallback(SD_HandleTypeDef *h){ printf("dma boot sig %02x%02x\\n", back[510], back[511]); }\n';
 const {s,output}=run(p);advance(s,20);assert.deepEqual(output,['init=0 wide=0','blocks=131072 size=512 state=4','write=0','read=0 1 8','dma boot sig 55aa','fatfs=0']);
});
