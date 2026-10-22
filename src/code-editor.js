import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import 'monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import {loadPreferences,selectedTheme} from './ide-preferences.js';
import {editorTheme} from './colorscheme.js';

globalThis.MonacoEnvironment={getWorker:()=>new Worker(new URL('./editor.worker.js',import.meta.url),{name:'stm-editor'})};
const API={HAL_GPIO_WritePin:'HAL_GPIO_WritePin(GPIOx, GPIO_Pin, PinState)',HAL_GPIO_ReadPin:'HAL_GPIO_ReadPin(GPIOx, GPIO_Pin)',HAL_GPIO_TogglePin:'HAL_GPIO_TogglePin(GPIOx, GPIO_Pin)',HAL_Delay:'HAL_Delay(milliseconds)',HAL_GetTick:'HAL_GetTick()',HAL_UART_Transmit:'HAL_UART_Transmit(&huart, data, size, timeout)',HAL_ADC_GetValue:'HAL_ADC_GetValue(&hadc)',HAL_TIM_PWM_Start:'HAL_TIM_PWM_Start(&htim, channel)',printf:'printf("format", values)',pinMode:'pinMode(pin, OUTPUT)',digitalWrite:'digitalWrite(pin, HIGH)',digitalRead:'digitalRead(pin)',analogRead:'analogRead(pin)',delay:'delay(milliseconds)'};
export function createCodeEditor({textarea,getFile,getFiles,onBreakpoint,onBreakpointsMoved,onPosition}){
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
  const nativeValue=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value'),nativeSelect=textarea.setSelectionRange.bind(textarea);
  // Undo/redo and other outside changes replace only the differing middle of the text, so the cursor
  // lands at the change instead of jumping to the top (setValue resets the selection and scroll).
  function replaceChanged(model,value){
    const old=model.getValue();let start=0,end=0;
    while(start<old.length&&start<value.length&&old[start]===value[start])start++;
    while(end<old.length-start&&end<value.length-start&&old[old.length-1-end]===value[value.length-1-end])end++;
    const from=model.getPositionAt(start),to=model.getPositionAt(old.length-end),text=value.slice(start,value.length-end);
    model.pushEditOperations([],[{range:new monaco.Range(from.lineNumber,from.column,to.lineNumber,to.column),text}],()=>null);
    const at=model.getPositionAt(start+text.length);editor.setPosition(at);editor.revealPositionInCenterIfOutsideViewport(at);
  }
  function sync(value){
    const name=getFile();syncing=true;
    if(active!==name){if(active)states.set(active,editor.saveViewState());let model=models.get(name);if(!model){model=monaco.editor.createModel(value,'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,model);}active=name;editor.setModel(model);if(model.getValue()!==value)model.setValue(value);editor.restoreViewState(states.get(name));}
    else if(editor.getValue()!==value)replaceChanged(editor.getModel(),value);
    editor.getModel()?.updateOptions({tabSize:preferredTabSize,insertSpaces:true});
    nativeValue.set.call(textarea,value);syncing=false;decorate();
  }
  Object.defineProperty(textarea,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(value){sync(String(value));}});
  textarea.setSelectionRange=(start,end,direction)=>{nativeSelect(start,end,direction);const model=editor.getModel(),a=model.getPositionAt(start),b=model.getPositionAt(end);editor.setSelection(new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column));editor.revealPositionInCenterIfOutsideViewport(a);};
  textarea.focus=()=>editor.focus();
  textarea.addEventListener('input',()=>{if(!syncing)sync(nativeValue.get.call(textarea));});
  editor.onDidChangeModelContent(()=>{if(syncing)return;const moved=breakpoints.filter(b=>b.file===active).map((b,i)=>({...b,line:decorations.getRange(i)?.startLineNumber||b.line}));nativeValue.set.call(textarea,editor.getValue());textarea.dispatchEvent(new Event('input',{bubbles:true}));if(moved.some((b,i)=>b.line!==breakpoints.filter(p=>p.file===active)[i]?.line))onBreakpointsMoved?.(active,moved);});
  editor.onDidChangeCursorSelection(e=>{const m=editor.getModel();nativeSelect(m.getOffsetAt(e.selection.getStartPosition()),m.getOffsetAt(e.selection.getEndPosition()));onPosition?.(editor.getPosition());});
  new MutationObserver(()=>editor.updateOptions({readOnly:textarea.readOnly})).observe(textarea,{attributes:true,attributeFilter:['readonly']});
  editor.onMouseDown(e=>{if(e.target.type===monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN&&e.target.position)onBreakpoint(active,e.target.position.lineNumber);});
  editor.addCommand(monaco.KeyCode.F9,()=>onBreakpoint(active,editor.getPosition().lineNumber));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyZ,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:false})));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyY,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:true})));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyZ,()=>document.dispatchEvent(new CustomEvent('ide-undo',{detail:true})));
  // The app has its own find/replace bar; Monaco's find widget would open as a second, older one.
  const find=replace=>()=>document.dispatchEvent(new CustomEvent('ide-find',{detail:replace}));
  for(const key of [monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyF,monaco.KeyCode.F3,monaco.KeyMod.Shift|monaco.KeyCode.F3,monaco.KeyMod.CtrlCmd|monaco.KeyCode.F3])editor.addCommand(key,find(false));
  editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyH,find(true));
  const decorations=editor.createDecorationsCollection();
  function decorate(){
    for(const [name,model] of models)monaco.editor.setModelMarkers(model,'clangd',languageMarkers.get(name)||[]);
    const ds=breakpoints.filter(b=>b.file===active).map(b=>({range:new monaco.Range(b.line,1,b.line,1),options:{isWholeLine:false,stickiness:monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,glyphMarginClassName:'debug-breakpoint',glyphMarginHoverMessage:{value:'중단점 — 클릭하여 해제'}}}));
    if(current?.file===active)ds.push({range:new monaco.Range(current.line,1,current.line,1),options:{isWholeLine:true,className:'debug-current-line',glyphMarginClassName:'debug-current-glyph'}});
    decorations.set(ds);for(const [file,model]of models)monaco.editor.setModelMarkers(model,'stm-build',diagnostics.filter(d=>d.file===file).map(d=>({severity:d.severity==='warning'?monaco.MarkerSeverity.Warning:d.severity==='info'?monaco.MarkerSeverity.Info:monaco.MarkerSeverity.Error,message:d.message,startLineNumber:d.line,startColumn:d.column||1,endLineNumber:d.line,endColumn:Math.max(2,model.getLineMaxColumn(Math.min(d.line,model.getLineCount())))})));
  }
  monaco.languages.registerCompletionItemProvider('cpp',{provideCompletionItems(model,position){if(languageService?.enabled())return {suggestions:[]};const word=model.getWordUntilPosition(position),range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn},words=new Set(getFiles().flatMap(f=>f.text.match(/\b[A-Za-z_]\w*\b/g)||[]));return {suggestions:[...Object.keys(API),...words].filter((w,i,a)=>a.indexOf(w)===i).slice(0,1500).map(word=>({label:word,kind:API[word]?monaco.languages.CompletionItemKind.Function:monaco.languages.CompletionItemKind.Text,insertText:word,detail:API[word]||'프로젝트의 식별자',range}))};}});
  monaco.languages.registerHoverProvider('cpp',{provideHover(model,position){if(languageService?.enabled())return null;const w=model.getWordAtPosition(position);return w&&API[w.word]?{contents:[{value:'```c\n'+API[w.word]+';\n```'},{value:'STM Simulator에서 지원하는 API입니다. 상세 범위는 HAL API 문서를 확인하세요.'}]}:null;}});
  monaco.languages.registerDefinitionProvider('cpp',{provideDefinition(model,position){if(languageService?.enabled())return [];const name=model.getWordAtPosition(position)?.word;if(!name)return [];const matches=[];for(const file of getFiles()){const regex=new RegExp('\\b'+name+'\\s*\\([^;{}]*\\)\\s*\\{','g'),m=regex.exec(file.text);if(m){let target=models.get(file.name);if(!target){target=monaco.editor.createModel(file.text,'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(file.name)));models.set(file.name,target);}else if(target.getValue()!==file.text)target.setValue(file.text);const p=target.getPositionAt(m.index);matches.push({uri:target.uri,range:new monaco.Range(p.lineNumber,p.column,p.lineNumber,p.column+name.length)});}}return matches;}});
  // Route definition navigation back through the project's file selection.
  monaco.editor.registerEditorOpener({openCodeEditor(_source,resource,selection){const file=decodeURIComponent(resource.path.slice(1));if(!getFiles().some(f=>f.name===file))return false;document.dispatchEvent(new CustomEvent('ide-open-source',{detail:{file,line:selection?.startLineNumber||selection?.lineNumber||1}}));return true;}});
  const lspRange=r=>new monaco.Range(r.start.line+1,r.start.character+1,r.end.line+1,r.end.character+1);
  const lspPosition=p=>({line:p.lineNumber-1,character:p.column-1});
  const query=async(method,model,position)=>{if(!languageService?.enabled())return null;try{return await languageService.query('textDocument/'+method,decodeURIComponent(model.uri.path.slice(1)),position?lspPosition(position):undefined);}catch{return null;}};
  const markdown=value=>typeof value==='string'?{value}:value?.language?{value:'```'+value.language+'\n'+value.value+'\n```'}:{value:value?.value||''};
  const targetModel=name=>{let model=models.get(name);const file=getFiles().find(f=>f.name===name);if(!file)return null;if(!model){model=monaco.editor.createModel(file.text,'cpp',monaco.Uri.parse('inmemory://stm/'+encodeURIComponent(name)));models.set(name,model);}return model;};
  monaco.languages.registerCompletionItemProvider('cpp',{triggerCharacters:['.','>',':'],async provideCompletionItems(model,position){const response=await query('completion',model,position),word=model.getWordUntilPosition(position);return {suggestions:(Array.isArray(response)?response:response?.items||[]).map(item=>({label:item.label,kind:({2:monaco.languages.CompletionItemKind.Method,3:monaco.languages.CompletionItemKind.Function,5:monaco.languages.CompletionItemKind.Field,6:monaco.languages.CompletionItemKind.Variable,7:monaco.languages.CompletionItemKind.Class,14:monaco.languages.CompletionItemKind.Keyword,22:monaco.languages.CompletionItemKind.Struct})[item.kind]??monaco.languages.CompletionItemKind.Text,insertText:item.textEdit?.newText||item.insertText||item.label,detail:item.detail,sortText:item.sortText,filterText:item.filterText,documentation:markdown(item.documentation),range:item.textEdit?lspRange(item.textEdit.range||item.textEdit.replace):new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn)}))};}});
  monaco.languages.registerHoverProvider('cpp',{async provideHover(model,position){const result=await query('hover',model,position);if(!result)return null;return {contents:(Array.isArray(result.contents)?result.contents:[result.contents]).map(markdown),range:result.range?lspRange(result.range):undefined};}});
  const locations=items=>(Array.isArray(items)?items:items?[items]:[]).flatMap(item=>{const uri=item.uri||item.targetUri,name=decodeURIComponent(uri.replaceAll('\\','/').split('/').at(-1)),model=targetModel(name);return model?[{uri:model.uri,range:lspRange(item.range||item.targetSelectionRange)}]:[];});
  monaco.languages.registerDefinitionProvider('cpp',{async provideDefinition(model,position){return locations(await query('definition',model,position));}});
  monaco.languages.registerReferenceProvider('cpp',{async provideReferences(model,position){return locations(await query('references',model,position));}});
  monaco.languages.registerSignatureHelpProvider('cpp',{signatureHelpTriggerCharacters:['(',','],async provideSignatureHelp(model,position){const result=await query('signatureHelp',model,position);if(!result)return null;return {value:{...result,activeSignature:result.activeSignature||0,activeParameter:result.activeParameter||0,signatures:result.signatures.map(s=>({...s,documentation:markdown(s.documentation),parameters:(s.parameters||[]).map(p=>({...p,documentation:markdown(p.documentation)}))}))},dispose(){}};}});
  monaco.languages.registerDocumentFormattingEditProvider('cpp',{async provideDocumentFormattingEdits(model){return (await query('formatting',model)||[]).map(edit=>({range:lspRange(edit.range),text:edit.newText}));}});
  sync(textarea.value);
  return {editor,sync,preferences,setLanguageService(service){languageService=service;},clearLanguageDiagnostics(){languageMarkers.clear();decorate();},languageDiagnostics(file,items){languageMarkers.set(file,items.map(d=>({severity:({1:monaco.MarkerSeverity.Error,2:monaco.MarkerSeverity.Warning,3:monaco.MarkerSeverity.Info,4:monaco.MarkerSeverity.Hint})[d.severity]||monaco.MarkerSeverity.Error,message:d.message,startLineNumber:d.range.start.line+1,startColumn:d.range.start.character+1,endLineNumber:d.range.end.line+1,endColumn:d.range.end.character+1})));decorate();},focus:()=>editor.focus(),position:()=>editor.getPosition(),goto(line,column=1){editor.revealLineInCenterIfOutsideViewport(line);editor.setPosition({lineNumber:line,column:Math.max(1,column)});editor.focus();},updateDebug(points,loc){breakpoints=points;current=loc;decorate();},diagnostics(items){diagnostics=items;decorate();},reset(){for(const [file,m]of models)if(file!==active&&!getFiles().some(f=>f.name===file)){m.dispose();models.delete(file);states.delete(file);}},dispose(){editor.dispose();for(const m of models.values())m.dispose();}};
}
