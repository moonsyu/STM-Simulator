import test from 'node:test';
import assert from 'node:assert/strict';
import {run,advance} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {cameraConfig,renderFrame,sensorBytes,rgb565,decodeImageSync,CAMERA_PATTERNS,validCameraImage} from '../../src/camera.js';
import {validateProject} from '../../src/project.js';

const regs=(entries)=>{const dsp=new Uint8Array(256);for(const [k,v]of entries)dsp[k]=v;return {cameraBanks:[dsp,new Uint8Array(256)]};};
test('camera model: SCCB registers select size/format; patterns and sensor byte order',()=>{
 assert.deepEqual(cameraConfig(regs([])),{width:160,height:120,format:'YUV422',swap:false});
 assert.deepEqual(cameraConfig(regs([[0xda,0x08],[0x5a,80],[0x5b,60]])),{width:320,height:240,format:'RGB565',swap:false});
 assert.equal(cameraConfig(regs([[0xda,0x10]])).format,'JPEG');
 const bars=renderFrame(160,120,'colorbars');assert.deepEqual([...bars.slice(0,4)],[255,255,255,255]);assert.deepEqual([...bars.slice(25*4,25*4+3)],[255,255,0]);
 const b=sensorBytes({width:160,height:120,format:'RGB565'},bars);assert.equal(b.length,38400);assert.deepEqual([b[50],b[51]],[rgb565(255,255,0)>>8,rgb565(255,255,0)&255]);
 const j=sensorBytes({width:160,height:120,format:'JPEG'},bars,7);assert.deepEqual([...j.slice(0,2)],[0xff,0xd8]);assert.deepEqual([...j.slice(-2)],[0xff,0xd9]);
 const g0=renderFrame(32,24,'ball',0),g1=renderFrame(32,24,'ball',5);assert.notDeepEqual(g0,g1);assert.deepEqual(CAMERA_PATTERNS,['colorbars','gradient','ball','image']);
 // 2x1 24-bit BMP (red, blue)
 const bmp=Uint8Array.from([0x42,0x4d,62,0,0,0,0,0,0,0,54,0,0,0,40,0,0,0,2,0,0,0,1,0,0,0,1,0,24,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,0,0,0,0]);
 const url='data:image/bmp;base64,'+Buffer.from(bmp).toString('base64'),img=decodeImageSync(url);assert.deepEqual([img.width,img.height,...img.rgba.slice(0,3),...img.rgba.slice(4,7)],[2,1,255,0,0,0,0,255]);
 assert.ok(validCameraImage(url)&&validCameraImage('')&&!validCameraImage('javascript:alert(1)'));
});
const dcmiOnly=(code)=>{const p=halExample('camera_tft');p.code=p.code.replace(/\/\* USER CODE BEGIN 3 \*\/[\s\S]*?\/\* USER CODE END 3 \*\//,'/* USER CODE BEGIN 3 */\n    HAL_Delay(5);\n    /* USER CODE END 3 */');if(code)p.code=code(p.code);return p;};
test('DCMI snapshot DMA writes the sensor frame (RGB565, big-endian bytes) into a uint32_t buffer line by line',()=>{
 const {s,output}=run(dcmiOnly(c=>c.replace('void HAL_DCMI_FrameEventCallback(DCMI_HandleTypeDef *hdcmi) {','void HAL_DCMI_FrameEventCallback(DCMI_HandleTypeDef *hdcmi) {\n  printf("frame state=%lu\\n", HAL_DCMI_GetState(hdcmi));')));
 const f=s.runtime.vars.frame.cells;let t=s.runtime.time;while(!f[0].value&&t<800)s.tick(t+=1);
 assert.ok(t<800);assert.equal(f[9520].value,0,'the last line is still being received');assert.ok(s.hal.camera.capture,'capture running');advance(s,t+100);assert.equal(f[9520].value,0xffffffff);
 assert.equal(f[0].value,0xffffffff);const yellow=rgb565(255,255,0),w=((yellow&255)<<24|(yellow>>8)<<16|(yellow&255)<<8|(yellow>>8))>>>0;assert.equal(f[(20*2)/4+1].value,w);
 assert.ok(output.includes('frame state=1'));assert.equal(s.hal.camera.lastCaptured.bytes,38400);
 const part=s.result.parts.cam.frame;assert.deepEqual([part.width,part.height,part.format],[160,120,'RGB565']);assert.ok(part.rgba instanceof Uint8ClampedArray);assert.equal(part.rgba.length,160*120*4);
 assert.ok(s.signals!==undefined);
});
test('continuous mode with VSYNC/LINE interrupts, pattern property and a buffer overrun error',()=>{
 const p=dcmiOnly(c=>c.replace('HAL_DCMI_Start_DMA(&hdcmi, DCMI_MODE_SNAPSHOT, (uint32_t)frame, 9600);','__HAL_DCMI_ENABLE_IT(&hdcmi, DCMI_IT_VSYNC | DCMI_IT_LINE);\n  HAL_DCMI_Start_DMA(&hdcmi, DCMI_MODE_CONTINUOUS, (uint32_t)frame, 4800);')
  .replace('uint32_t frame[9600];','uint32_t frame[9600];\nvolatile uint32_t lines = 0, vsyncs = 0, errors = 0;')+'\nvoid HAL_DCMI_LineEventCallback(DCMI_HandleTypeDef *h){lines++;}\nvoid HAL_DCMI_VsyncEventCallback(DCMI_HandleTypeDef *h){vsyncs++;}\nvoid HAL_DCMI_ErrorCallback(DCMI_HandleTypeDef *h){errors++;}\n');
 p.components.find(c=>c.id==='cam').pattern='gradient';
 const {s}=run(validateProject(p));advance(s,700,2);const v=s.runtime.vars;assert.ok(v.frames>=3,'frames '+v.frames);assert.ok(v.vsyncs>=3);assert.ok(v.lines>=3*120);assert.ok(v.errors>=3,'half buffer overruns');
 assert.equal(s.result.parts.cam.frame.pattern,'gradient');
});
test('captured frames are shown on the ST7735 through SPI DMA; user images replace the pattern',()=>{
 const p=halExample('camera_tft'),{s,output}=run(p);advance(s,900,2);assert.ok(output.some(x=>/frame \d+ shown on TFT/.test(x)),output.join('|'));
 const tft=s.result.parts.tft.device;assert.equal(tft.ram[0],0xffff);assert.equal(tft.ram[25*128+0],rgb565(255,255,0));assert.equal(tft.ram[150*128+100],0);
 s.camera.setImage('cam',{width:2,height:2,rgba:new Uint8ClampedArray([0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,255])});p.components.find(c=>c.id==='cam').pattern='image';
 advance(s,1300,2);assert.equal(s.result.parts.tft.device.ram[60*128+60],rgb565(0,255,0));
});
test('without power/XCLK the DCMI waits for a frame and the preview is absent',()=>{
 const p=halExample('camera_tft');p.code=p.code.replace('HAL_RCC_MCOConfig(RCC_MCO1, RCC_MCO1SOURCE_HSI, RCC_MCODIV_1);','');const {s,output}=run(p);advance(s,600,2);
 assert.ok(!output.some(x=>/shown/.test(x)));assert.equal(s.result.parts.cam?.frame,undefined);
});
