// CubeIDE's "Use float with printf from newlib-nano (-u _printf_float)" (Project Properties › C/C++ Build › Settings ›
// MCU/MPU Settings). A new CubeIDE project leaves it off, so printf("%.2f") prints nothing for the number there; the
// project keeps the same switch (`build.printfFloat`) for the ARM GCC builds and the interpreter. Projects saved before
// the setting existed (no `build`) keep the float support they always had.

/** Whether printf / sprintf format floating-point numbers in this project. */
export const printfFloatEnabled=project=>project?.build?.printfFloat!==false;

const CALL=/\b(?:printf|sprintf|snprintf|fprintf|vprintf|vsprintf|vsnprintf|f_printf|Serial\.printf)\s*\(/g;
const LITERAL=/"(?:[^"\\\n]|\\.)*"/g;
const FLOAT=/%[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[lL]?[fFeEgGaA]/;
/** Whether the C sources format a floating-point number with the printf family (a %f / %e / %g in a format string). */
export function usesFloatPrintf(sources){
 for(const text of sources){
  const code=String(text||'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  for(const m of code.matchAll(CALL)){
   const call=code.slice(m.index,code.indexOf(';',m.index)>=0?code.indexOf(';',m.index):undefined);
   if((call.match(LITERAL)||[]).some(lit=>FLOAT.test(lit.replace(/%%/g,''))))return true;
  }
 }
 return false;
}
/** All C sources of a project (main.c and the added files). */
export const projectSources=project=>[project?.code||'',...(project?.firmware?.files||[]).map(f=>f.text||'')];
/** An example project that prints floats turns the switch on, as its CubeIDE project would. */
export function withExamplePrintfFloat(project){
 if(usesFloatPrintf(projectSources(project)))project.build={...(project.build||{}),printfFloat:true};
 return project;
}
export const PRINTF_FLOAT_NOTICE='printf의 %f·%e·%g(실수) 출력이 꺼져 있어 숫자 자리가 빈칸으로 나옵니다. CubeIDE 새 프로젝트의 기본값(Use float with printf from newlib-nano 꺼짐)과 같습니다. 도구 막대의 "printf float"를 켜면 시뮬레이터와 빌드 모두 숫자가 나오고, CubeIDE에서는 Project Properties › C/C++ Build › Settings › MCU/MPU Settings에서 같은 칸을 켭니다.';
