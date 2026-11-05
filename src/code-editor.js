import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import 'monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import {loadPreferences,selectedTheme} from './ide-preferences.js';
import {editorTheme} from './colorscheme.js';
import {cSymbols,pickDefinitions,KIND_RANK} from './c-symbols.js';

globalThis.MonacoEnvironment={getWorker:()=>new Worker(new URL('./editor.worker.js',import.meta.url),{name:'stm-editor'})};
const API={HAL_GPIO_WritePin:'HAL_GPIO_WritePin(GPIOx, GPIO_Pin, PinState)',HAL_GPIO_ReadPin:'HAL_GPIO_ReadPin(GPIOx, GPIO_Pin)',HAL_GPIO_TogglePin:'HAL_GPIO_TogglePin(GPIOx, GPIO_Pin)',HAL_Delay:'HAL_Delay(milliseconds)',HAL_GetTick:'HAL_GetTick()',HAL_UART_Transmit:'HAL_UART_Transmit(&huart, data, size, timeout)',HAL_ADC_GetValue:'HAL_ADC_GetValue(&hadc)',HAL_TIM_PWM_Start:'HAL_TIM_PWM_Start(&htim, channel)',printf:'printf("format", values)',pinMode:'pinMode(pin, OUTPUT)',digitalWrite:'digitalWrite(pin, HIGH)',digitalRead:'digitalRead(pin)',analogRead:'analogRead(pin)',delay:'delay(milliseconds)'};
export function createCodeEditor({textarea,getFile,getFiles,onBreakpoint,onBreakpointsMoved,onPosition,getFamily=()=>'STM32F446RE',getGenerated=()=>[],sdk=globalThis.window?.nativeIde,onExternal}){
  const wrapper=textarea.parentElement,host=document.createElement('div');host.id='monaco-host';wrapper.append(host);wrapper.classList.add('monaco-ready');
  monaco.editor.defineTheme('stm-light',{base:'vs',inherit:true,rules:[{token:'comment',foreground:'567B60'},{token:'keyword',foreground:'8755A1'},{token:'string',foreground:'A34D2F'},{token:'number',foreground:'246D90'}],colors:{'editor.background':'#FCFDFC','editor.foreground':'#263E34','editorLineNumber.foreground':'#718579','editor.lineHighlightBackground':'#EFF5F1','editor.selectionBackground':'#CBE8D9','editorCursor.foreground':'#166E4E','editorGutter.background':'#F5F8F6'}});
  const editor=monaco.editor.create(host,{value:textarea.value,language:'cpp',theme:'stm-light',automaticLayout:true,editContext:false,fontSize:13,lineHeight:21,fontFamily:"Consolas, 'Malgun Gothic', monospace",minimap:{enabled:false},glyphMargin:true,scrollBeyondLastLine:false,tabSize:4,insertSpaces:true,wordWrap:'off',folding:true,bracketPairColorization:{enabled:true},padding:{top:9,bottom:9},fixedOverflowWidgets:true,ariaLabel:'C 소스 코드 편집기',readOnly:textarea.readOnly});
  let preferredTabSize=4;
  function preferences(value){
    preferredTabSize=value.tabSize;
    const theme=selectedTheme(value);host.style.colorScheme=theme.base;
    monaco.editor.defineTheme('stm-custom',editorTheme(theme));
    monaco.editor.setTheme('stm-custom');editor.updateOptions({fontSize:value.fontSize,fontFamily:value.fontFamily,lineHeight:value.lineHeight,tabSize:value.tabSize,wordWrap:value.wordWrap?'on':'off',lineNumbers:value.lineNumbers?'on':'off',minimap:{enabled:value.minimap},bracketPairColorization:{enabled:value.bracketColors},'semanticHighlighting.enabled':true});
    for(const model of monaco.editor.getModels())model.updateOptions({tabSize:value.tabSize,insertSpaces:true});
  }
  preferences(loadPreferences());
  monaco.languages.registerDocumentSemanticTokensProvider('cpp',{
    getLegend:()=>({tokenTypes:['function','type'],tokenModifiers:[]}),
    provideDocumentSemanticTokens(model){
      const lines=model.getLinesContent(),lexed=monaco.editor.tokenize(model.getValue(),'cpp'),data=[];
      let previousLine=0,previousStart=0;
      for(let line=0;line<lines.length;line++){
        const tokens=lexed[line]||[];let tokenIndex=0;
        for(const match of lines[line].matchAll(/\b[A-Za-z_]\w*\b/g)){
          const type=/^(void|bool|char|short|int|long|float|double|signed|unsigned|size_t|wchar_t|char16_t|char32_t|u?int(?:8|16|32|64)_t)$/.test(match[0])||/TypeDef$/.test(match[0]);
          if(!type&&!/^\s*\(/.test(lines[line].slice(match.index+match[0].length)))continue;
          while(tokenIndex+1<tokens.length&&tokens[tokenIndex+1].offset<=match.index)tokenIndex++;
          const token=tokens[tokenIndex];
          if(/comment|string/.test(token?.type||'')||!type&&(/keyword/.test(token?.type||'')||/^(if|for|while|switch|sizeof|return|alignof|decltype|static_assert)$/.test(match[0])))continue;
          const delta=line-previousLine;data.push(delta,delta?match.index:match.index-previousStart,match[0].length,type?1:0,0);previousLine=line;previousStart=match.index;
        }
      }
      return {data:new Uint32Array(data)};
    },releaseDocumentSemanticTokens(){}
  });
  const models=new Map(),states=new Map();let active='',syncing=false,breakpoints=[],current=null,diagnostics=[],languageService=null;const languageMarkers=new Map();
  // SDK files opened by go to definition (CubeIDE's Drivers folder): read-only tabs that are not project files.
  // `external` is the one on screen; the project file stays the textarea's file meanwhile.
  const externals=new Map();let external=null;const history=[],future=[];
  const nativeValue=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value'),nativeSelect=textarea.setSelectionRange.bind(textarea);
  // Undo/redo and other outside changes: setValue resets the selection and scroll, so the cursor is put
  // back at the end of the changed text instead of the top. (Editing the model in place instead would
  // leave Monaco's type handlers, such as format-on-type for `}`, out of step with the text.)
  function replaceChanged(model,value){
    const old=model.getValue();let start=0,end=0;
    while(start<old.length&&start<value.length&&old[start]===value[start])start++;
    while(end<old.length-start&&end<value.length-start&&old[old.length-1-end]===value[value.length-1-end])end++;
    editor.setValue(value);
    const at=model.getPositionAt(value.length-end);editor.setPosition(at);editor.revealPositionInCenterIfOutsideViewport(at);
  }
  function sync(value){
    const name=getFile();syncing=true;
    // An SDK file on screen: the project file's model follows the textarea without taking the editor back.
    if(external){let model=models.get(name);if(!model){model=monaco.editor.createModel(value,name.endsWith('.py')?'python':'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,model);}else if(model.getValue()!==value)model.setValue(value);active=name;nativeValue.set.call(textarea,value);syncing=false;return;}
    if(active!==name){if(active)states.set(active,editor.saveViewState());let model=models.get(name);if(!model){model=monaco.editor.createModel(value,name.endsWith('.py')?'python':'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,model);}active=name;editor.setModel(model);if(model.getValue()!==value)model.setValue(value);editor.restoreViewState(states.get(name));}
    else if(editor.getValue()!==value)replaceChanged(editor.getModel(),value);
    editor.getModel()?.updateOptions({tabSize:preferredTabSize,insertSpaces:true});
    nativeValue.set.call(textarea,value);syncing=false;decorate();
  }
  Object.defineProperty(textarea,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(value){sync(String(value));}});
  textarea.setSelectionRange=(start,end,direction)=>{nativeSelect(start,end,direction);const model=editor.getModel(),a=model.getPositionAt(start),b=model.getPositionAt(end);editor.setSelection(new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column));editor.revealPositionInCenterIfOutsideViewport(a);};
  textarea.focus=()=>editor.focus();
  textarea.addEventListener('input',()=>{if(!syncing)sync(nativeValue.get.call(textarea));});
  editor.onDidChangeModelContent(()=>{if(syncing||external)return;const moved=breakpoints.filter(b=>b.file===active).map((b,i)=>({...b,line:decorations.getRange(i)?.startLineNumber||b.line}));nativeValue.set.call(textarea,editor.getValue());textarea.dispatchEvent(new Event('input',{bubbles:true}));if(moved.some((b,i)=>b.line!==breakpoints.filter(p=>p.file===active)[i]?.line))onBreakpointsMoved?.(active,moved);});
  editor.onDidChangeCursorSelection(e=>{if(external){onPosition?.(editor.getPosition());return;}const m=editor.getModel();nativeSelect(m.getOffsetAt(e.selection.getStartPosition()),m.getOffsetAt(e.selection.getEndPosition()));onPosition?.(editor.getPosition());});
  const readOnly=()=>editor.updateOptions(external?{readOnly:true,readOnlyMessage:{value:`${externals.get(external).sdk} 원본 파일이라 읽기 전용입니다. 프로젝트 파일 탭으로 돌아가 수정하세요.`}}:{readOnly:textarea.readOnly,readOnlyMessage:{value:textarea.dataset.readOnlyMessage||'이 파일은 읽기 전용입니다.'}});
  new MutationObserver(readOnly).observe(textarea,{attributes:true,attributeFilter:['readonly','data-read-only-message']});
  editor.onMouseDown(e=>{if(!external&&e.target.type===monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN&&e.target.position)onBreakpoint(active,e.target.position.lineNumber);});
  editor.addCommand(monaco.KeyCode.F9,()=>{if(!external)onBreakpoint(active,editor.getPosition().lineNumber);});
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyZ,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:false})));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyY,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:true})));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyZ,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:true})));
  // The app has its own find/replace bar; Monaco's find widget would open as a second, older one.
  // In an SDK file (not the textarea's text) Monaco's own find widget searches what is on screen.
  const find=replace=>()=>{if(external){editor.getAction('actions.find')?.run();return;}document.dispatchEvent(new CustomEvent('ide-find',{detail:replace}));};
  for(const key of [monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyF,monaco.KeyCode.F3,monaco.KeyMod.Shift|monaco.KeyCode.F3,monaco.KeyMod.CtrlCmd|monaco.KeyCode.F3])editor.addCommand(key,find(false));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyH,find(true));
  const decorations=editor.createDecorationsCollection();
  function decorate(){
    for(const [name,model] of models)monaco.editor.setModelMarkers(model,'clangd',languageMarkers.get(name)||[]);
    if(external){decorations.set([]);return;}
    const ds=breakpoints.filter(b=>b.file===active).map(b=>({range:new monaco.Range(b.line,1,b.line,1),options:{isWholeLine:false,stickiness:monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,glyphMarginClassName:'debug-breakpoint',glyphMarginHoverMessage:{value:'중단점 — 클릭하여 해제'}}}));
    if(current?.file===active)ds.push({range:new monaco.Range(current.line,1,current.line,1),options:{isWholeLine:true,className:'debug-current-line',glyphMarginClassName:'debug-current-glyph'}});
    decorations.set(ds);for(const [file,model]of models)monaco.editor.setModelMarkers(model,'stm-build',diagnostics.filter(d=>d.file===file).map(d=>({severity:d.severity==='warning'?monaco.MarkerSeverity.Warning:d.severity==='info'?monaco.MarkerSeverity.Info:monaco.MarkerSeverity.Error,message:d.message,startLineNumber:d.line,startColumn:d.column||1,endLineNumber:d.line,endColumn:Math.max(2,model.getLineMaxColumn(Math.min(d.line,model.getLineCount())))})));
  }
  monaco.languages.registerCompletionItemProvider('cpp',{provideCompletionItems(model,position){if(languageService?.enabled())return {suggestions:[]};const word=model.getWordUntilPosition(position),range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn},words=new Set(getFiles().flatMap(f=>f.text.match(/\b[A-Za-z_]\w*\b/g)||[]));return {suggestions:[...Object.keys(API),...words].filter((w,i,a)=>a.indexOf(w)===i).slice(0,1500).map(word=>({label:word,kind:API[word]?monaco.languages.CompletionItemKind.Function:monaco.languages.CompletionItemKind.Text,insertText:word,detail:API[word]||'프로젝트의 식별자',range}))};}});
  monaco.languages.registerHoverProvider('cpp',{provideHover(model,position){if(languageService?.enabled())return null;const w=model.getWordAtPosition(position);return w&&API[w.word]?{contents:[{value:'```c\n'+API[w.word]+';\n```'},{value:'STM Simulator에서 지원하는 API입니다. 상세 범위는 HAL API 문서를 확인하세요.'}]}:null;}});
  // Go to definition (Ctrl+click, F12, Alt+F12 peek) as in CubeIDE: the project's own files first, then the
  // STM32Cube SDK (HAL driver, CMSIS) of the project's MCU, opened as a read-only tab.
  const sdkModel=async file=>{let e=externals.get(file);if(e)return e;const r=await sdk['sdk-file'](getFamily(),file);e={model:monaco.editor.createModel(r.text,file.endsWith('.s')?'plaintext':'cpp',monaco.Uri.from({scheme:'inmemory',authority:'sdk',path:'/'+file})),sdk:r.sdk,file};externals.set(file,e);return e;};
  // The code the ARM build adds (CubeIDE's Core/Src/stm32xxxx_it.c, syscalls.c, sysmem.c): read only, regenerated from the project.
  const GENERATED='STM Simulator 빌드';
  const genModel=file=>{const g=getGenerated().find(x=>x.file===file);if(!g)return null;let e=externals.get(file);if(!e){e={model:monaco.editor.createModel(g.text,'cpp',monaco.Uri.from({scheme:'inmemory',authority:'gen',path:'/'+file})),sdk:GENERATED,file,generated:true};externals.set(file,e);}else if(e.model.getValue()!==g.text)e.model.setValue(g.text);return e;};
  const refreshGenerated=()=>{const now=getGenerated();for(const e of [...externals.values()])if(e.generated){const g=now.find(x=>x.file===e.file);if(g){if(e.model.getValue()!==g.text)e.model.setValue(g.text);}else closeExternal(e.file);}};
  const sdkDefinitions=new Map();let sdkWarned=false;
  const sdkLookup=name=>{if(!sdk?.['sdk-definition'])return Promise.resolve([]);const key=getFamily()+':'+name;if(!sdkDefinitions.has(key))sdkDefinitions.set(key,sdk['sdk-definition'](getFamily(),name).catch(e=>{sdkDefinitions.delete(key);if(!sdkWarned){sdkWarned=true;document.dispatchEvent(new CustomEvent('ide-notice',{detail:e.message}));}return [];}));return sdkDefinitions.get(key);};
  const projectModel=name=>{let m=models.get(name);const file=getFiles().find(f=>f.name===name);if(!file)return null;if(!m){m=monaco.editor.createModel(file.text,'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,m);}else if(!external&&name===active&&m.getValue()!==file.text)m.setValue(file.text);return m;};
  const at=(model,line,column,length)=>({uri:model.uri,range:new monaco.Range(line,column,line,column+length)});
  async function definitions(name){
    const own=getFiles().flatMap(f=>cSymbols(f.text).filter(s=>s.name===name&&s.kind!=='include').map(s=>({...s,file:f.name}))),best=pickDefinitions(own);
    // A project prototype (static void MX_GPIO_Init(void);) loses to a definition anywhere; HAL calls go to the SDK.
    if(best.length&&KIND_RANK[best[0].kind]<KIND_RANK.declaration)return best.map(s=>at(projectModel(s.file),s.line,s.column,name.length));
    // Then the build's added files (SysTick_Handler, _sbrk, _write …), then the SDK.
    for(const g of getGenerated()){const hit=pickDefinitions(cSymbols(g.text).filter(x=>x.name===name&&x.kind!=='include'));if(hit.length&&KIND_RANK[hit[0].kind]<KIND_RANK.declaration){const e=genModel(g.file);return hit.map(x=>at(e.model,x.line,x.column,name.length));}}
    const found=await sdkLookup(name);
    if(found.length){const out=[];for(const d of found){try{out.push(at((await sdkModel(d.file)).model,d.line,d.column,name.length));}catch{}}if(out.length)return out;}
    return best.map(s=>at(projectModel(s.file),s.line,s.column,name.length));
  }
  monaco.languages.registerDefinitionProvider('cpp',{async provideDefinition(model,position){if(languageService?.enabled())return [];const name=model.getWordAtPosition(position)?.word;return name?definitions(name):[];}});
  const here=()=>({file:external??active,sdk:!!external,position:editor.getPosition()});
  const remember=()=>{const h=here();if(h.file){history.push(h);if(history.length>50)history.shift();future.length=0;}};
  function showExternal(file,selection,{record=true}={}){
    const e=externals.get(file);if(!e)return false;if(record&&!(external===file))remember();
    if(external)externals.get(external).view=editor.saveViewState();else if(active)states.set(active,editor.saveViewState());
    external=file;editor.setModel(e.model);if(e.view&&!selection)editor.restoreViewState(e.view);readOnly();decorate();
    if(selection){const line=selection.startLineNumber||selection.lineNumber||1,column=selection.startColumn||selection.column||1;editor.setPosition({lineNumber:line,column});editor.revealLineInCenter(line);}
    editor.focus();onExternal?.();return true;
  }
  // Back to the project file on the textarea (a project tab, the file tree, debugging, or Alt+←).
  function showProject(){
    if(!external)return;externals.get(external).view=editor.saveViewState();external=null;const model=models.get(active)||projectModel(active);
    if(model){if(model.getValue()!==nativeValue.get.call(textarea))model.setValue(nativeValue.get.call(textarea));editor.setModel(model);editor.restoreViewState(states.get(active));}
    readOnly();decorate();onExternal?.();
  }
  function closeExternal(file){const e=externals.get(file);if(!e)return;if(external===file)showProject();e.model.dispose();externals.delete(file);for(const list of [history,future])for(let i=list.length-1;i>=0;i--)if(list[i].sdk&&list[i].file===file)list.splice(i,1);onExternal?.();}
  const go=h=>{if(h.sdk){if(!showExternal(h.file,h.position,{record:false}))return false;}else{showProject();document.dispatchEvent(new CustomEvent('ide-open-source',{detail:{file:h.file,line:h.position?.lineNumber||1,column:h.position?.column||1}}));}return true;};
  // Alt+← / Alt+→: CubeIDE's Back / Forward through the definitions visited.
  const travel=(from,to)=>{while(from.length){const h=from.pop(),now=here();if(go(h)){to.push(now);return;}}};
  editor.addCommand(monaco.KeyMod.Alt|monaco.KeyCode.LeftArrow,()=>travel(history,future));
  editor.addCommand(monaco.KeyMod.Alt|monaco.KeyCode.RightArrow,()=>travel(future,history));
  // Route definition navigation: SDK files open as read-only tabs, project files through the project's file selection.
  monaco.editor.registerEditorOpener({openCodeEditor(_source,resource,selection){
    if(resource.authority==='sdk'||resource.authority==='gen')return showExternal(decodeURIComponent(resource.path.slice(1)),selection);
    const file=decodeURIComponent(resource.path.slice(1));if(!getFiles().some(f=>f.name===file))return false;
    remember();showProject();document.dispatchEvent(new CustomEvent('ide-open-source',{detail:{file,line:selection?.startLineNumber||selection?.lineNumber||1,column:selection?.startColumn||selection?.column||1}}));return true;}});
  const lspRange=r=>new monaco.Range(r.start.line+1,r.start.character+1,r.end.line+1,r.end.character+1);
  const lspPosition=p=>({line:p.lineNumber-1,character:p.column-1});
  const query=async(method,model,position)=>{if(!languageService?.enabled())return null;try{return await languageService.query('textDocument/'+method,decodeURIComponent(model.uri.path.slice(1)),position?lspPosition(position):undefined);}catch{return null;}};
  const markdown=value=>typeof value==='string'?{value}:value?.language?{value:'```'+value.language+'\n'+value.value+'\n```'}:{value:value?.value||''};
  const targetModel=name=>{let model=models.get(name);const file=getFiles().find(f=>f.name===name);if(!file)return null;if(!model){model=monaco.editor.createModel(file.text,'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,model);}return model;};
  monaco.languages.registerCompletionItemProvider('cpp',{triggerCharacters:['.','>',':'],async provideCompletionItems(model,position){const response=await query('completion',model,position),word=model.getWordUntilPosition(position);return {suggestions:(Array.isArray(response)?response:response?.items||[]).map(item=>({label:item.label,kind:({2:monaco.languages.CompletionItemKind.Method,3:monaco.languages.CompletionItemKind.Function,5:monaco.languages.CompletionItemKind.Field,6:monaco.languages.CompletionItemKind.Variable,7:monaco.languages.CompletionItemKind.Class,14:monaco.languages.CompletionItemKind.Keyword,22:monaco.languages.CompletionItemKind.Struct})[item.kind]??monaco.languages.CompletionItemKind.Text,insertText:item.textEdit?.newText||item.insertText||item.label,detail:item.detail,sortText:item.sortText,filterText:item.filterText,documentation:markdown(item.documentation),range:item.textEdit?lspRange(item.textEdit.range||item.textEdit.replace):new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn)}))};}});
  monaco.languages.registerHoverProvider('cpp',{async provideHover(model,position){const result=await query('hover',model,position);if(!result)return null;return {contents:(Array.isArray(result.contents)?result.contents:[result.contents]).map(markdown),range:result.range?lspRange(result.range):undefined};}});
  // clangd answers with file paths: project files map to their tabs, SDK files (…/Drivers/…) to read-only SDK tabs.
  const locations=async items=>{const out=[];for(const item of Array.isArray(items)?items:items?[items]:[]){const uri=item.uri||item.targetUri,name=decodeURIComponent(uri.replaceAll('\\','/').split('/').at(-1)),range=lspRange(item.range||item.targetSelectionRange),model=targetModel(name);
    if(model){out.push({uri:model.uri,range});continue;}
    try{const rel=await sdk?.['sdk-relative']?.(getFamily(),decodeURIComponent(new URL(uri).pathname).replace(/^\/(\w:)/,'$1'));if(rel)out.push({uri:(await sdkModel(rel)).model.uri,range});}catch{}}
    return out;};
  monaco.languages.registerDefinitionProvider('cpp',{async provideDefinition(model,position){return locations(await query('definition',model,position));}});
  monaco.languages.registerReferenceProvider('cpp',{async provideReferences(model,position){return locations(await query('references',model,position));}});
  monaco.languages.registerSignatureHelpProvider('cpp',{signatureHelpTriggerCharacters:['(',','],async provideSignatureHelp(model,position){const result=await query('signatureHelp',model,position);if(!result)return null;return {value:{...result,activeSignature:result.activeSignature||0,activeParameter:result.activeParameter||0,signatures:result.signatures.map(s=>({...s,documentation:markdown(s.documentation),parameters:(s.parameters||[]).map(p=>({...p,documentation:markdown(p.documentation)}))}))},dispose(){}};}});
  monaco.languages.registerDocumentFormattingEditProvider('cpp',{async provideDocumentFormattingEdits(model){return (await query('formatting',model)||[]).map(edit=>({range:lspRange(edit.range),text:edit.newText}));}});
  sync(textarea.value);
  return {editor,sync,preferences,
    externalFile:()=>external?{file:external,sdk:externals.get(external).sdk}:null,externalFiles:()=>[...externals.values()].map(e=>({file:e.file,sdk:e.sdk})),
    showExternal:file=>showExternal(file),openGenerated:file=>!!genModel(file)&&showExternal(file),openSdk:async file=>showExternal((await sdkModel(file)).file),refreshGenerated,showProject,closeExternal,outline:()=>cSymbols(editor.getModel()?.getValue()||''),onContent:fn=>editor.onDidChangeModelContent(fn),onModel:fn=>editor.onDidChangeModel(fn),setLanguageService(service){languageService=service;},clearLanguageDiagnostics(){languageMarkers.clear();decorate();},languageDiagnostics(file,items){languageMarkers.set(file,items.map(d=>({severity:({1:monaco.MarkerSeverity.Error,2:monaco.MarkerSeverity.Warning,3:monaco.MarkerSeverity.Info,4:monaco.MarkerSeverity.Hint})[d.severity]||monaco.MarkerSeverity.Error,message:d.message,startLineNumber:d.range.start.line+1,startColumn:d.range.start.character+1,endLineNumber:d.range.end.line+1,endColumn:d.range.end.character+1})));decorate();},focus:()=>editor.focus(),position:()=>editor.getPosition(),goto(line,column=1){editor.revealLineInCenterIfOutsideViewport(line);editor.setPosition({lineNumber:line,column:Math.max(1,column)});editor.focus();},updateDebug(points,loc){breakpoints=points;current=loc;decorate();},diagnostics(items){diagnostics=items;decorate();},reset(){for(const [file,m]of models)if(file!==active&&!getFiles().some(f=>f.name===file)){m.dispose();models.delete(file);states.delete(file);}},dispose(){editor.dispose();for(const m of models.values())m.dispose();}};
}
