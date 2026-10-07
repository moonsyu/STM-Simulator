// Verifies the real ARM GDB remote protocol on QEMU's STM32F405 Cortex-M4.
// This does not claim to emulate an F446RE or the application's circuit peripherals.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {GdbSession}=require('../desktop/gdb-mi.cjs'),{execute,launch,terminate}=require('../desktop/process-tools.cjs'),{toolSettings,waitUntil}=require('./native-ide-check.cjs');
(async()=>{
 const tools=await toolSettings(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'stm-arm-gdb-')),out=path.resolve(__dirname,'../work/test-results'),gdb=new GdbSession();let state={},log='',qemu;
 const code='volatile int counter;\nint helper(int value) {\n  int doubled=value*2;\n  return doubled;\n}\nint main(void) {\n  counter=helper(3);\n  counter++;\n  while(1) { counter++; __asm volatile("nop"); }\n}\nvoid Reset_Handler(void) { counter=0; main(); }\n__attribute__((section(".isr_vector"),used)) const unsigned vectors[]={0x20020000,(unsigned)Reset_Handler};\n';
 await fs.writeFile(path.join(directory,'main.c'),code);await fs.writeFile(path.join(directory,'memory.ld'),'ENTRY(Reset_Handler)\nMEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 512K\nRAM (rw) : ORIGIN = 0x20000000, LENGTH = 128K }\nSECTIONS { .isr_vector : { KEEP(*(.isr_vector)) } > FLASH\n.text : { *(.text*) *(.rodata*) } > FLASH\n.data : { *(.data*) } > RAM AT > FLASH\n.bss : { *(.bss*) *(COMMON) } > RAM }');
 const elf=path.join(directory,'firmware.elf'),result=await execute(tools.armGcc,['-mcpu=cortex-m4','-mthumb','-g3','-O0','-nostdlib','-Tmemory.ld','main.c','-o',elf],{cwd:directory});assert.equal(result.code,0,result.stderr);
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
 gdb.on('state',e=>{state=e;});gdb.on('output',text=>log+=text);
 try{
  qemu=launch(process.env.QEMU_ARM||path.resolve(__dirname,'../work/tools/qemu/qemu-system-arm.exe'),['-M','netduinoplus2','-display','none','-serial','null','-monitor','none','-kernel',elf,'-S','-gdb',`tcp:127.0.0.1:${port}`],{cwd:directory});qemu.stderr.on('data',chunk=>log+=chunk.toString());qemu.on('error',e=>log+=e.message);
  await waitUntil(()=>new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.on('connect',()=>{socket.destroy();resolve(true);});socket.on('error',()=>resolve(false));}), 'QEMU GDB listener');
  await gdb.start({gdb:tools.armGdb,elf,cwd:directory,target:'arm',endpoint:`127.0.0.1:${port}`,entry:true});await waitUntil(()=>state.state==='paused'&&state.frame?.func==='main','ARM main');
  await gdb.action('into');await waitUntil(()=>state.state==='paused'&&state.frame?.func==='helper','ARM step into');assert.equal(await gdb.evaluate('value'),'3');
  await gdb.action('over');await waitUntil(()=>state.state==='paused'&&Number(state.frame?.line)===4,'ARM step over');assert.equal(await gdb.evaluate('doubled'),'6');
  await gdb.action('out');await waitUntil(()=>state.state==='paused'&&state.frame?.func==='main','ARM step out');
  await gdb.setBreakpoints([{file:'main.c',line:9}]);await gdb.action('continue');await waitUntil(()=>state.state==='paused'&&state.reason==='breakpoint-hit','ARM breakpoint');assert.equal(await gdb.evaluate('counter'),'7');
  const inspection=await gdb.inspect();assert.ok(inspection.registers.some(r=>r.name==='pc'));assert.equal(inspection.globals.find(g=>g.name==='counter').value,'7');const memory=await gdb.memory('0x20000000',4);assert.equal(memory[0].contents,'07000000');
  await gdb.setBreakpoints([]);await gdb.action('continue');await waitUntil(()=>state.state==='running','ARM running');await gdb.action('pause');await waitUntil(()=>state.state==='paused','ARM interrupt');
  await fs.writeFile(path.join(out,'arm-gdb-check.json'),JSON.stringify({passed:true,hardwareRun:false,target:'QEMU netduinoplus2 STM32F405 Cortex-M4',checks:['real ARM ELF','GDB TCP remote connection','source breakpoint','step into/over/out','local and global variables','ARM PC/registers','SRAM bytes','continue and interrupt']},null,2));console.log('Real ARM GDB + Cortex-M4 remote debug passed');
 }finally{await gdb.stop();await terminate(qemu);await fs.writeFile(path.join(out,'arm-gdb-check.log'),log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
