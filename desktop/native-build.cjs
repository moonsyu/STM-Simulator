const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const {execute}=require('./process-tools.cjs');
const TOOL_KEYS=['armGcc','armGdb','cube','cubeF1','hostGcc','hostGdb','clangd','openocd','buildRoot'];
const F4_MODULES=['hal','hal_rcc','hal_rcc_ex','hal_gpio','hal_cortex','hal_pwr','hal_pwr_ex','hal_flash','hal_flash_ex','hal_dma','hal_dma_ex','hal_can','hal_i2s','hal_i2s_ex','hal_uart','hal_usart','hal_adc','hal_adc_ex','hal_i2c','hal_spi','hal_tim','hal_tim_ex','hal_dcmi','hal_dcmi_ex','hal_sd','ll_sdmmc','hal_iwdg','hal_wwdg','hal_rtc','hal_rtc_ex','hal_crc'];
const F1_MODULES=['hal','hal_rcc','hal_rcc_ex','hal_gpio','hal_gpio_ex','hal_cortex','hal_pwr','hal_flash','hal_flash_ex','hal_dma','hal_can','hal_uart','hal_usart','hal_adc','hal_adc_ex','hal_i2c','hal_spi','hal_tim','hal_tim_ex','hal_iwdg','hal_wwdg','hal_rtc','hal_rtc_ex','hal_crc'];
// The ARM build per MCU family: SDK tool key and layout, CPU flags, startup file and memory sizes.
const SDKS={
  STM32F446RE:{key:'cube',name:'STM32CubeF4',hal:'STM32F4xx_HAL_Driver',device:'STM32F4xx',prefix:'stm32f4xx',cpu:['-mcpu=cortex-m4','-mthumb','-mfpu=fpv4-sp-d16','-mfloat-abi=hard','-DSTM32F446xx'],startup:'startup_stm32f446xx.s',ld:'stm32f446re.ld',flash:'512K',ram:'128K',modules:F4_MODULES},
  STM32F103RB:{key:'cubeF1',name:'STM32CubeF1',hal:'STM32F1xx_HAL_Driver',device:'STM32F1xx',prefix:'stm32f1xx',cpu:['-mcpu=cortex-m3','-mthumb','-mfloat-abi=soft','-DSTM32F103xB'],startup:'startup_stm32f103xb.s',ld:'stm32f103rb.ld',flash:'128K',ram:'20K',modules:F1_MODULES}
};
const sdkFor=project=>SDKS[project.mcu?.family||'STM32F446RE'];
const linker=sdk=>`ENTRY(Reset_Handler)
MEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = ${sdk.flash}
RAM (xrw) : ORIGIN = 0x20000000, LENGTH = ${sdk.ram} }
_estack = ORIGIN(RAM) + LENGTH(RAM);
SECTIONS {
 .isr_vector : { KEEP(*(.isr_vector)) } >FLASH
 .text : { *(.text*) *(.rodata*) KEEP(*(.init)) KEEP(*(.fini)) . = ALIGN(4); } >FLASH
 .ARM.extab : { *(.ARM.extab*) } >FLASH
 .ARM.exidx : { __exidx_start = .; *(.ARM.exidx*) __exidx_end = .; } >FLASH
 .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array*)) PROVIDE_HIDDEN(__preinit_array_end = .); } >FLASH
 .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); } >FLASH
 .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(.fini_array*)) PROVIDE_HIDDEN(__fini_array_end = .); } >FLASH
 _sidata = LOADADDR(.data);
 .data : { . = ALIGN(4); _sdata = .; *(.data*) . = ALIGN(4); _edata = .; } >RAM AT>FLASH
 .bss : { . = ALIGN(4); _sbss = .; __bss_start__ = .; *(.bss*) *(COMMON) . = ALIGN(8); _ebss = .; __bss_end__ = .; end = .; _end = .; } >RAM
 .heap_stack (NOLOAD) : { . = ALIGN(8); . += 0x400; . += 0x1000; . = ALIGN(8); } >RAM
}
`;
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function findExecutable(name,extra=[]){for(const dir of [...extra,...(process.env.PATH||'').split(path.delimiter)]){if(!dir)continue;const p=path.join(dir,name+(process.platform==='win32'?'.exe':''));if(await exists(p))return p;}return '';}
async function detectTools(current={}){
  // A saved tool path that no longer exists (or was mistyped) is detected again instead of being kept.
  const tools={};for(const key of TOOL_KEYS){const value=typeof current[key]==='string'?current[key]:'';tools[key]=value&&(key==='buildRoot'||await exists(value))?value:'';}
  const local=path.join(process.env.LOCALAPPDATA||os.homedir(),'STM-Simulator-Tools');const installs=await fs.readdir(local).catch(()=>[]);const installedArm=installs.filter(n=>n.startsWith('xpack-arm-none-eabi-gcc-')).sort().at(-1),installedClang=installs.filter(n=>n.startsWith('clangd_')).sort().at(-1);const armBins=installedArm?[path.join(local,installedArm,'bin')]:[];const installedOpenOcd=installs.filter(n=>n.startsWith('xpack-openocd-')).sort().at(-1);if(!tools.openocd&&installedOpenOcd)tools.openocd=path.join(local,installedOpenOcd,'bin/openocd.exe');if(!tools.clangd&&installedClang)tools.clangd=path.join(local,installedClang,'bin/clangd.exe');for(const sdk of Object.values(SDKS))if(!tools[sdk.key]&&await exists(path.join(local,sdk.name,'Drivers',sdk.hal,'Inc',sdk.prefix+'_hal.h')))tools[sdk.key]=path.join(local,sdk.name);for(const parent of [path.join(process.env.ProgramFiles||'C:/Program Files','Arm GNU Toolchain arm-none-eabi'),'C:/ST',path.join(os.homedir(),'.local','xPacks','@xpack-dev-tools','arm-none-eabi-gcc')]){
    // Bounded discovery, never crawl the user's drive.
    for(const e of await fs.readdir(parent,{withFileTypes:true}).catch(()=>[]))if(e.isDirectory())armBins.push(path.join(parent,e.name,'bin'));
  }
  // STM32CubeIDE (C:/ST/STM32CubeIDE_x.y.z) bundles GNU Tools for STM32 and OpenOCD in its plugins folder.
  const openocdBins=[];
  for(const e of await fs.readdir('C:/ST',{withFileTypes:true}).catch(()=>[]))if(e.isDirectory()&&/^STM32CubeIDE/i.test(e.name)){
    const plugins=path.join('C:/ST',e.name,'STM32CubeIDE','plugins'),names=(await fs.readdir(plugins).catch(()=>[])).sort().reverse();
    for(const n of names)if(/\.gnu-tools-for-stm32\..*\.win32_/.test(n))armBins.push(path.join(plugins,n,'tools','bin'));else if(/\.externaltools\.openocd\.win32_/.test(n))openocdBins.push(path.join(plugins,n,'tools','bin'));
  }
  if(process.env.ARM_GCC)armBins.unshift(path.dirname(process.env.ARM_GCC));
  const hostBins=['C:/msys64/ucrt64/bin','C:/msys64/mingw64/bin'];
  for(const [key,name,dirs]of [['armGcc','arm-none-eabi-gcc',armBins],['armGdb','arm-none-eabi-gdb',armBins],['hostGcc','gcc',hostBins],['hostGdb','gdb',hostBins],['clangd','clangd',['C:/Program Files/LLVM/bin',...hostBins]],['openocd','openocd',openocdBins]])if(!tools[key])tools[key]=await findExecutable(name,dirs);
  // STM32CubeMX/IDE firmware packages live in ~/STM32Cube/Repository/STM32Cube_FW_F4_Vx (and _F1_).
  for(const [family,sdk]of Object.entries(SDKS))if(!tools[sdk.key]){const parent=path.join(os.homedir(),'STM32Cube/Repository'),series=family.slice(5,7);for(const e of (await fs.readdir(parent).catch(()=>[])).filter(n=>n.startsWith(`STM32Cube_FW_${series}_`)).sort().reverse()){const candidate=path.join(parent,e);if(await exists(path.join(candidate,'Drivers',sdk.hal,'Inc',sdk.prefix+'_hal.h'))){tools[sdk.key]=candidate;break;}}const env=process.env[`STM32CUBE_${series}_ROOT`];if(env)tools[sdk.key]=env;}
  return tools;
}
function validateTools(value){const result={};if(!value||typeof value!=='object')throw new Error('개발 도구 설정을 확인하세요.');for(const key of TOOL_KEYS){const v=value[key]||'';if(typeof v!=='string'||v.length>2048||/[\r\n\0]/.test(v)||v&&!path.isAbsolute(v))throw new Error('도구는 절대 경로로 지정하세요.');result[key]=v;}return result;}
async function probeTools(tools){const result={};for(const key of TOOL_KEYS){if(!tools[key]){result[key]={ok:false,message:'설정되지 않음'};continue;}try{if(key==='buildRoot'){if(/[^\x00-\x7f]/.test(tools.buildRoot))throw new Error('영문 경로를 선택하세요.');result[key]={ok:true,message:tools.buildRoot};}else if(key==='cube'||key==='cubeF1'){const sdk=Object.values(SDKS).find(s=>s.key===key);if(!await exists(path.join(tools[key],'Drivers',sdk.hal,'Inc',sdk.prefix+'_hal.h')))throw new Error(`${sdk.name} Drivers 폴더를 찾을 수 없습니다.`);result[key]={ok:true,message:`${sdk.name} HAL / CMSIS`};}else{const r=await execute(tools[key],['--version'],{timeout:8000});result[key]={ok:r.code===0,message:(r.stdout||r.stderr).split('\n')[0]};}}catch(e){result[key]={ok:false,message:e.message};}}return result;}
function diagnosticsFrom(text){return text.split(/\r?\n/).flatMap(line=>{const m=/^(.+?):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/.exec(line);return m?[{file:path.basename(m[1]),line:Number(m[2]),column:Number(m[3]),severity:m[4]==='warning'?'warning':m[4]==='note'?'info':'error',message:m[5],path:m[1]}]:[];});}
function fingerprint(project,config){return createHash('sha256').update(JSON.stringify({code:project.code,firmware:project.firmware,mcu:project.mcu,config})).digest('hex');}
async function prepareBuild({project,tools,root,target='arm',configuration='Debug'}){
  const sdk=sdkFor(project);if(target==='arm'&&!sdk)throw new Error(`${project.mcu.family} ARM 빌드는 지원하지 않습니다.`);
  for(const key of target==='arm'?['armGcc',sdk.key]:['hostGcc'])if(tools[key]&&/[^\x00-\x7f]/.test(tools[key]))throw new Error('Windows GCC와 SDK는 영문 경로에 설치하세요. 프로젝트 폴더는 한글 경로를 사용할 수 있습니다.');
  if(/[^\x00-\x7f]/.test(root))throw new Error('GCC 빌드 작업 경로에 한글이 있습니다. 개발 도구 설정에서 영문 경로의 빌드 작업 폴더를 선택하세요.');
  if(!['arm','host'].includes(target)||!['Debug','Release'].includes(configuration))throw new Error('빌드 대상을 확인하세요.');
  const gcc=target==='arm'?tools.armGcc:tools.hostGcc;if(!gcc||!await exists(gcc))throw new Error(`${target==='arm'?'ARM':'Windows'} GCC 경로를 개발 도구 설정에서 지정하세요.`);
  if(target==='arm'&&project.firmware?.mode!=='hal')throw new Error('ARM 빌드는 HAL 프로젝트를 사용하세요.');
  const directory=path.join(root,randomUUID());await fs.mkdir(directory,{recursive:true});
  const files=[{name:'main.c',text:project.code},...(project.firmware?.files||[])],sources=[];
  for(const f of files){if(!/^[\w.-]+\.(c|h|cpp|hpp|cc)$/.test(f.name))throw new Error('소스 파일명이 올바르지 않습니다.');await fs.writeFile(path.join(directory,f.name),f.text);if(/\.(c|cpp|cc)$/.test(f.name))sources.push(path.join(directory,f.name));}
  if(files.some(f=>f.name==='__stm_environment.c'))throw new Error('__stm_environment.c는 내부 빌드용 파일명입니다.');
  let flags=['-g3',configuration==='Debug'?'-O0':'-Os','-ffunction-sections','-fdata-sections','-Wall','-Wextra','-Werror=implicit-function-declaration','-I'+directory],linkFlags=[],generated=[];
  if(target==='arm'){
    const cube=tools[sdk.key],hal=path.join(cube||'','Drivers',sdk.hal),device=path.join(cube||'','Drivers/CMSIS/Device/ST',sdk.device),core=path.join(cube||'','Drivers/CMSIS/Include'),p=sdk.prefix;
    if(!cube||!await exists(path.join(hal,'Inc',p+'_hal.h')))throw new Error(`개발 도구 설정에서 ${sdk.name} SDK 루트 폴더를 선택하거나 필요한 도구 설치로 받으세요.`);
    flags.unshift(...sdk.cpu,'-DUSE_HAL_DRIVER');
    flags.push(...[path.join(hal,'Inc'),path.join(device,'Include'),core].map(p=>'-I'+p));
    if(!files.some(f=>f.name===p+'_hal_conf.h'))await fs.copyFile(path.join(hal,'Inc',p+'_hal_conf_template.h'),path.join(directory,p+'_hal_conf.h'));
    if(!files.some(f=>f.name==='main.h'))await fs.writeFile(path.join(directory,'main.h'),`#pragma once\n#include "${p}_hal.h"\nvoid Error_Handler(void);\n`);
    // Pinout labels: CubeMX writes LABEL_Pin / LABEL_GPIO_Port into main.h; -D gives them to every source, also with a user main.h (same text, so no redefinition warning).
    for(const [pin,q]of Object.entries(project.mcu?.pins||{}))if(q.label)flags.push(`-D${q.label}_Pin=GPIO_PIN_${pin.slice(2)}`,`-D${q.label}_GPIO_Port=GPIO${pin[1]}`);
    generated=sdk.modules.map(n=>path.join(hal,'Src',`${p}_${n}.c`));
    if(!files.some(f=>f.name===`system_${p}.c`))generated.push(path.join(device,'Source/Templates',`system_${p}.c`));
    generated.push(path.join(device,'Source/Templates/gcc',sdk.startup));
    const {isSerial,serialHandle}=await import('../src/serial-config.js'),{isTimer}=await import('../src/timer-config.js');
    // Interrupt handlers must be strong: the startup file's Default_Handler aliases are weak too,
    // and a weak-vs-weak tie leaves SysTick unhandled (HAL_Delay would hang). Skip any handler the
    // user's sources already define so imported Cube stm32f4xx_it.c files still link.
    // Comments and `#if 0` blocks are removed first so disabled handlers don't count as definitions.
    // Lines inside `#if 0` (up to its #else/#elif/#endif, nesting followed) do not define anything; `#if 1 … #else` drops the
    // #else part. Other conditions are kept, both branches.
    const liveLines=text=>{const stack=[];return text.split('\n').filter(line=>{
      const d=/^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/.exec(line),live=()=>stack.every(s=>s.live);
      if(!d)return live();
      if(['if','ifdef','ifndef'].includes(d[1])){const c=d[1]==='if'?d[2].trim():'';stack.push({known:c==='0'||c==='1',live:c!=='0',taken:c==='1'});return false;}
      const top=stack.at(-1);if(!top)return false;
      if(d[1]==='endif')stack.pop();else if(top.known)top.live=!top.taken&&!top.live,top.taken=top.taken||top.live;else top.live=true;
      return false;
    }).join('\n');};
    const stripC=text=>liveLines(text.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' '));
    const userText=stripC([project.code,...files.map(f=>f.text||'')].join('\n'));
    const defined=name=>new RegExp(`\\b${name}\\s*\\(\\s*(?:void)?\\s*\\)\\s*\\{`).test(userText);
    const handler=(name,body)=>defined(name)?null:`void ${name}(void) { ${body} }`;
    const env=['#include "main.h"','__attribute__((weak)) void _init(void) {}','__attribute__((weak)) void _fini(void) {}','__attribute__((weak)) int __io_putchar(int ch) { return ch; }',handler('SysTick_Handler','HAL_IncTick();'),'__attribute__((weak)) int _write(int file, char *ptr, int len) { (void)file; for(int i=0;i<len;i++) __io_putchar(ptr[i]); return len; }'];
    env.push('#include <stddef.h>','#include <stdint.h>','#include <errno.h>',`extern char end, _estack;
__attribute__((weak)) void *_sbrk(ptrdiff_t increment) {
  static uintptr_t current;
  const uintptr_t base=(uintptr_t)&end, limit=(uintptr_t)&_estack-0x1000;
  if(!current) current=base;
  if((increment>0 && (uintptr_t)increment>limit-current) || (increment<0 && (uintptr_t)(-(increment+1))+1>current-base)) { errno=ENOMEM; return (void*)-1; }
  void *previous=(void*)current; current+=increment; return previous;
}`);
    // A synchronous USART uses a USART_HandleTypeDef named husartN (as the generated main.c does).
    const peripherals=project.mcu?.peripherals||{},sync=id=>peripherals[id]?.mode==='synchronous',usartHandle=id=>sync(id)?'husart'+id.replace(/\D/g,''):serialHandle(id);
    for(const [id,p]of Object.entries(peripherals))if(p.enabled){if(isSerial(id))env.push(sync(id)?`extern USART_HandleTypeDef ${usartHandle(id)};`:`extern UART_HandleTypeDef ${serialHandle(id)};`);if(isTimer(id))env.push(`extern TIM_HandleTypeDef htim${id.slice(3)};`);}
    // DMA stream interrupts generated by MX_DMA_Init need HAL_DMA_IRQHandler on the linked handle.
    const dmaStreams=new Set();
    for(const [request,d]of Object.entries(project.mcu?.dma||{})){if(!d?.stream||dmaStreams.has(d.stream))continue;dmaStreams.add(d.stream);const h=request==='MEMTOMEM'?'hdma_memtomem':'hdma_'+request.toLowerCase();env.push(`extern DMA_HandleTypeDef ${h};`,handler(`${d.stream}_IRQHandler`,`HAL_DMA_IRQHandler(&${h});`));}
    // Each enabled interrupt calls the HAL handler of its own peripheral; EXTI lines only serve the pins they route.
    const extiPins=(lo,hi)=>Object.entries(project.mcu?.pins||{}).filter(([pin,q])=>q.function==='GPIO_EXTI'&&Number(pin.slice(2))>=lo&&Number(pin.slice(2))<=hi).map(([pin])=>`HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_${pin.slice(2)});`).join('');
    const peripheralHandler=(type,handle,call)=>peripherals[handle.id]?.enabled?{extern:`extern ${type}_HandleTypeDef ${handle.name};`,body:`${call}(&${handle.name});`}:{body:''};
    const irqBody=id=>{
      // A timer/UART interrupt left on for a disabled peripheral has no handle to serve.
      if((isTimer(id)||isSerial(id))&&!peripherals[id]?.enabled)return {body:''};
      if(isTimer(id))return {body:`HAL_TIM_IRQHandler(&htim${id.slice(3)});`};
      if(isSerial(id))return {body:sync(id)?`HAL_USART_IRQHandler(&${usartHandle(id)});`:`HAL_UART_IRQHandler(&${serialHandle(id)});`};
      const exti=/^EXTI(\d+)(?:_(\d+))?$/.exec(id);if(exti){const a=Number(exti[1]),b=exti[2]===undefined?a:Number(exti[2]);return {body:extiPins(Math.min(a,b),Math.max(a,b))};}
      if(id==='I2C1_EV')return peripheralHandler('I2C',{id:'I2C1',name:'hi2c1'},'HAL_I2C_EV_IRQHandler');
      if(id==='I2C1_ER')return peripheralHandler('I2C',{id:'I2C1',name:'hi2c1'},'HAL_I2C_ER_IRQHandler');
      if(id==='SPI1')return peripheralHandler('SPI',{id:'SPI1',name:'hspi1'},'HAL_SPI_IRQHandler');
      if(id==='ADC'||id==='ADC1_2')return peripheralHandler('ADC',{id:'ADC1',name:'hadc1'},'HAL_ADC_IRQHandler');
      if(id==='DCMI')return peripheralHandler('DCMI',{id:'DCMI',name:'hdcmi'},'HAL_DCMI_IRQHandler');
      if(id==='SDIO')return peripheralHandler('SD',{id:'SDIO',name:'hsd'},'HAL_SD_IRQHandler');
      return {body:''};
    };
    for(const [irq,p]of Object.entries(project.mcu?.nvic||{}))if(p.enabled&&!dmaStreams.has(irq.replace('_IRQn',''))){const id=irq.replace('_IRQn',''),{extern,body}=irqBody(id),h=handler(`${id}_IRQHandler`,body);if(h&&extern)env.push(extern);env.push(h);}
    await fs.writeFile(path.join(directory,'__stm_environment.c'),env.filter(Boolean).join('\n'));generated.push(path.join(directory,'__stm_environment.c'));
    await fs.writeFile(path.join(directory,sdk.ld),linker(sdk));
    linkFlags=['-T'+path.join(directory,sdk.ld),'-nostartfiles','--specs=nano.specs','--specs=nosys.specs','-u','_printf_float'];
  }
  const cpp=gcc.replace(/gcc(\.exe)?$/,(_,ext)=>'g++'+(ext||''));
  // ST SDK sources (outside the build folder) are not the user's code: their warnings would only fill the 빌드 panel.
  const units=[...sources,...generated].map((file,index)=>{const isCpp=/\.(cpp|cc)$/.test(file),compiler=isCpp?cpp:gcc,sdk=!path.resolve(file).startsWith(path.resolve(directory));return {directory,file,arguments:[compiler,...flags.filter(f=>(!isCpp||f!=='-Werror=implicit-function-declaration')&&!(sdk&&['-Wall','-Wextra'].includes(f))),isCpp?'-std=c++17':'-std=c11','-c',file,'-o',path.join(directory,`unit-${index}.o`)]};});
  await fs.writeFile(path.join(directory,'compile_commands.json'),JSON.stringify(units,null,2));
  return {directory,units,gcc,linker:sources.some(f=>/\.(cpp|cc)$/.test(f))?cpp:gcc,flags,linkFlags,target,configuration,elf:path.join(directory,target==='arm'?'firmware.elf':'program.exe'),files:files.map(f=>f.name)};
}
async function build(plan,{signal,onOutput=()=>{}}={}){
  let output='';const write=text=>{output=(output+text).slice(-2000000);onOutput(text);};
  async function run(exe,args){write(`> ${path.basename(exe)} ${args.map(a=>/\s/.test(a)?JSON.stringify(a):a).join(' ')}\n`);const r=await execute(exe,args,{cwd:plan.directory,signal,onOutput:write});if(r.code!==0){const error=new Error(`컴파일 또는 링크 실패 (종료 코드 ${r.code})`);error.diagnostics=diagnosticsFrom(output);throw error;}return r;}
  const version=await run(plan.gcc,['--version']);
  for(const unit of plan.units)await run(unit.arguments[0],unit.arguments.slice(1));
  const map=path.join(plan.directory,plan.target==='arm'?'firmware.map':'program.map');
  await run(plan.linker,[...plan.flags.filter(f=>!f.startsWith('-W')),...plan.linkFlags,...plan.units.map(u=>u.arguments.at(-1)),'-Wl,--gc-sections','-Wl,-Map='+map,'-lm','-o',plan.elf]);
  const artifacts=[plan.elf,map,path.join(plan.directory,'compile_commands.json')];
  if(plan.target==='arm'){
    const objcopy=plan.gcc.replace(/gcc(\.exe)?$/,(_,e)=>'objcopy'+(e||'')),size=plan.gcc.replace(/gcc(\.exe)?$/,(_,e)=>'size'+(e||''));
    for(const [format,ext]of [['binary','bin'],['ihex','hex']]){const dest=path.join(plan.directory,'firmware.'+ext);await run(objcopy,['-O',format,plan.elf,dest]);artifacts.push(dest);}
    await run(size,[plan.elf]);
  }
  const manifest=[];for(const file of artifacts){const data=await fs.readFile(file);manifest.push({name:path.basename(file),path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
  const result={...plan,artifacts:manifest,diagnostics:diagnosticsFrom(output),compiler:version.stdout.split('\n')[0]};
  await fs.writeFile(path.join(plan.directory,'build-result.json'),JSON.stringify({configuration:plan.configuration,target:plan.target,compiler:result.compiler,artifacts:manifest},null,2));return result;
}
module.exports={TOOL_KEYS,SDKS,detectTools,validateTools,probeTools,prepareBuild,build,diagnosticsFrom,fingerprint};
