// Data-only import: never evaluate JavaScript, Vimscript, paths or commands from a theme.
const hex=value=>typeof value==='string'&&/^#?[\da-f]{6}([\da-f]{2})?$/i.test(value)?'#'+value.replace(/^#/,'').toLowerCase():null;
const style=value=>String(value||'').toLowerCase().split(/[ ,]+/).filter(v=>['bold','italic','underline','strikethrough'].includes(v)).join(' ');
const GROUPS={keyword:'Statement',type:'Type',string:'String',number:'Constant',comment:'Comment',identifier:'Identifier',function:'Function','keyword.directive':'PreProc',delimiter:'Delimiter','delimiter.parenthesis':'Delimiter','string.escape':'Special','operator':'Operator'};
const UI={background:'editor.background',foreground:'editor.foreground',panel:'editorWidget.background',chrome:'sideBar.background',border:'editorWidget.border',muted:'editorLineNumber.foreground',accent:'editorCursor.foreground',selection:'editor.selectionBackground',line:'editor.lineHighlightBackground',search:'editor.findMatchBackground',debug:'editor.stackFrameHighlightBackground',error:'editorError.foreground',warning:'editorWarning.foreground'};
const FALLBACK={background:'#151515',foreground:'#e8e8d3',panel:'#1f1f1f',chrome:'#262626',border:'#403c41',muted:'#a0a8b0',accent:'#fad07a',selection:'#404040',line:'#1c1c1c',search:'#302028',keyword:'#8197bf',type:'#ffb964',string:'#99ad6a',number:'#cf6a4c',comment:'#888888',identifier:'#c6b6ee',function:'#fad07a',debug:'#43512d',error:'#e07070',warning:'#fad07a',net:'#e8b843'};
export function validateEditorTheme(data){
 if(!data||!['vs','vs-dark','hc-black','hc-light'].includes(data.base)||typeof data.inherit!=='boolean'||!Array.isArray(data.rules)||data.rules.length>2000||!data.colors||typeof data.colors!=='object'||Array.isArray(data.colors)||Object.keys(data.colors).length>500)throw new Error('Monaco 테마의 base / inherit / rules / colors 형식을 확인하세요.');
 const rules=data.rules.map(r=>{if(!r||typeof r.token!=='string'||r.token.length>160||!/^[-\w.*]*$/.test(r.token))throw new Error('지원하지 않는 구문 토큰입니다.');const out={token:r.token};for(const key of ['foreground','background'])if(r[key]!==undefined){const c=hex(r[key]);if(!c||c.length!==7)throw new Error('구문 색상은 RRGGBB 형식이어야 합니다.');out[key]=c.slice(1);}if(r.fontStyle!==undefined){if(typeof r.fontStyle!=='string'||r.fontStyle.length>80)throw new Error('글자 스타일을 확인하세요.');out.fontStyle=style(r.fontStyle);}return out;});
 const colors={};for(const [key,value]of Object.entries(data.colors)){if(!/^[\w.-]{1,120}$/.test(key)||!hex(value))throw new Error('편집기 색상 이름/값을 확인하세요.');colors[key]=hex(value);}return {base:data.base,inherit:data.inherit,rules,colors};
}
function fromEditor(editor,name){
 const light=['vs','hc-light'].includes(editor.base),colors={...FALLBACK,...(light?{background:'#ffffff',foreground:'#263e34',panel:'#f5f8f6',chrome:'#eaf0eb',border:'#cbd8ce',muted:'#586d60',accent:'#166e4e',selection:'#cbe8d9',line:'#eff5f1',search:'#f6dda1',keyword:'#8755a1',type:'#a34d2f',string:'#826523',number:'#246d90',comment:'#567b60',identifier:'#385c76',function:'#6f4e89'}:{})};for(const [key,id]of Object.entries(UI))if(editor.colors[id])colors[key]=editor.colors[id].slice(0,7);
 for(const key of ['keyword','type','string','number','comment','identifier','function']){const rule=editor.rules.findLast(r=>r.token===key);if(rule?.foreground)colors[key]='#'+rule.foreground;}
 return {id:'theme_import',name:name.slice(0,50)||'Colorscheme',base:['vs','hc-light'].includes(editor.base)?'light':'dark',colors,editor,originalColors:{...colors}};
}
export function vimColorscheme(text,{jellybeans=false}={}){
 const groups={},links={},vars={};let name='Vim colorscheme',base='vs-dark';
 if(jellybeans){
  // Pinned upstream GUI/default branch only; user overrides and terminal branches are not executed.
  for(const m of text.matchAll(/^let (s:\w+) = "([\da-f]{6})"/gim))vars[m[1]]=m[2];
  for(const m of text.matchAll(/^\s*let (s:matchParenGui\w+) = "([\da-f]{6})"/gim))vars[m[1]]=m[2];
  for(const m of text.replace(/\r?\n\\\s*/g,'').matchAll(/^call s:X\("([\w]+)",([^,]+),([^,]+),"([^"]*)"/gm)){
   const value=s=>hex(s.trim().replace(/^"|"$/g,''))||hex(vars[s.trim()]);groups[m[1]]={foreground:value(m[2]),background:value(m[3]),fontStyle:style(m[4])};
  }
  name='Jellybeans';
 }else{
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();if(!line||line.startsWith('"'))continue;
   let m;if((m=line.match(/^let\s+(?:g:)?colors_name\s*=\s*["']([^"']+)["']\s*$/))){name=m[1];continue;}
   if((m=line.match(/^set\s+(?:background|bg)=(dark|light)\s*$/))){base=m[1]==='light'?'vs':'vs-dark';continue;}
   if(/^(hi(?:ghlight)?!?\s+clear|syntax\s+reset)\s*$/.test(line))continue;
   if((m=line.match(/^hi(?:ghlight)?!?\s+(?:default\s+)?link\s+(\w+)\s+(\w+)\s*$/))){links[m[1]]=m[2];continue;}
   m=line.match(/^hi(?:ghlight)?!?\s+(\w+)\s+(.+)$/);
   if(!m)throw new Error('이 Vim 파일은 동적 스크립트를 사용합니다. 정적 highlight / guifg / guibg 파일 또는 Monaco·VS Code 테마 JSON을 등록하세요.');
   const attrs={};for(const item of m[2].split(/\s+/)){const pair=item.match(/^(guifg|guibg|gui|guisp|ctermfg|ctermbg|cterm|term|font)=([^\s]+)$/);if(!pair)throw new Error('Vim highlight 구문을 해석할 수 없습니다: '+item);attrs[pair[1]]=pair[2];}
   for(const key of ['guifg','guibg'])if(attrs[key]&&!/^(NONE|fg|bg)$/i.test(attrs[key])&&!hex(attrs[key]))throw new Error('Vim GUI 색상은 #RRGGBB 형식으로 지정하세요.');
   groups[m[1]]={foreground:hex(attrs.guifg),background:hex(attrs.guibg),fontStyle:style(attrs.gui)};
  }
 }
 for(const m of text.matchAll(/^hi(?:ghlight)?!?\s+link\s+(\w+)\s+(\w+)\s*$/gm))links[m[1]]=m[2];
 const resolve=(id,seen=new Set())=>{if(seen.has(id))throw new Error('Vim highlight link에 순환 참조가 있습니다.');seen.add(id);return groups[id]||links[id]&&resolve(links[id],seen)||{};};
 if(!groups.Normal?.foreground||!groups.Normal?.background)throw new Error('Normal 그룹의 guifg와 guibg가 필요합니다.');
 const rules=Object.entries(GROUPS).map(([token,group])=>{const g=resolve(group),rule={token};if(g.foreground)rule.foreground=g.foreground.slice(1);if(g.background)rule.background=g.background.slice(1);rule.fontStyle=g.fontStyle||'';return rule;});
 const colors={},map={'editor.background':['Normal','background'],'editor.foreground':['Normal','foreground'],'editor.selectionBackground':['Visual','background'],'editor.lineHighlightBackground':['CursorLine','background'],'editor.findMatchBackground':['Search','background'],'editor.findMatchBorder':['Search','foreground'],'editorCursor.foreground':['Cursor','background'],'editorLineNumber.foreground':['LineNr','foreground'],'editorLineNumber.activeForeground':['CursorLineNr','foreground'],'editorBracketMatch.background':['MatchParen','background'],'editorBracketMatch.border':['MatchParen','foreground'],'editorWidget.background':['Pmenu','background'],'editorWidget.foreground':['Pmenu','foreground'],'editorSuggestWidget.selectedBackground':['PmenuSel','background'],'editorWidget.border':['VertSplit','background'],'editorGutter.background':['Normal','background']};
 for(const [key,[group,attr]]of Object.entries(map)){const value=resolve(group)[attr];if(value)colors[key]=value;}
 const result=fromEditor(validateEditorTheme({base,inherit:true,rules,colors}),name);
 // Vim popup/line-number colors remain in Monaco; workbench body text needs its own contrast.
 result.colors.panel=resolve('FoldColumn').background||FALLBACK.panel;result.colors.muted=resolve('Folded').foreground||FALLBACK.muted;result.originalColors={...result.colors};return result;
}
function jsonComments(text){
 // Strip JSONC comments/trailing commas only outside strings.
 let out='',quoted=false,escaped=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(quoted){out+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;out+=c;}else if(c==='/'&&n==='/'){while(i<text.length&&text[i]!=='\n')i++;out+='\n';}else if(c==='/'&&n==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i++;out+=' ';}else out+=c;}
 let clean='';quoted=false;escaped=false;for(let i=0;i<out.length;i++){const c=out[i];if(quoted){clean+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"'){quoted=true;clean+=c;}else if(c===','&&/^\s*[}\]]/.test(out.slice(i+1))){}else clean+=c;}return clean;
}
export function importColorscheme(text,filename='theme.json'){
 if(typeof text!=='string'||text.length>500000)throw new Error('Colorscheme 파일은 500 KB 이하로 선택하세요.');
 if(/\.vim$/i.test(filename))return vimColorscheme(text);
 let data;try{data=JSON.parse(jsonComments(text.replace(/^\uFEFF/,'')));}catch{throw new Error('Colorscheme JSON 문법을 확인하세요.');}
 if(data?.include)throw new Error('include로 다른 파일을 참조하는 테마입니다. colors와 tokenColors를 하나의 JSON에 합쳐 등록하세요.');
 if(data?.version===1&&data.themes)throw new Error('IDE 설정 파일입니다. 아래의 설정 가져오기를 사용하세요.');
 if(data&&Array.isArray(data.rules))return fromEditor(validateEditorTheme({...data,inherit:data.inherit??true}),data.name||filename.replace(/\.[^.]+$/,''));
 if(!data||!Array.isArray(data.tokenColors)||data.tokenColors.length>2000||!data.colors)throw new Error('Monaco rules/colors 또는 VS Code tokenColors/colors 테마 JSON이 필요합니다.');
 const scopes=[['comment','comment'],['string','string'],['constant.numeric','number'],['constant','number'],['keyword.operator','operator'],['keyword','keyword'],['storage.type','type'],['storage','type'],['entity.name.type','type'],['support.type','type'],['entity.name.function','function'],['support.function','function'],['variable','identifier'],['punctuation','delimiter']];
 const rules=[];for(const entry of data.tokenColors){if(!entry||!entry.settings||typeof entry.settings!=='object')throw new Error('tokenColors 설정을 확인하세요.');const items=entry.scope===undefined?['']:Array.isArray(entry.scope)?entry.scope:typeof entry.scope==='string'?entry.scope.split(','):null;if(!items)throw new Error('TextMate scope 형식을 확인하세요.');for(const item of items){if(typeof item!=='string')throw new Error('TextMate scope는 문자열이어야 합니다.');const scope=item.trim();if(scope.includes(' '))continue;const token=scope===''?'':scopes.find(([prefix])=>scope===prefix||scope.startsWith(prefix+'.'))?.[1];if(token!==undefined)rules.push({token,...entry.settings});}}
 if(!rules.length)throw new Error('현재 C/C++ 편집기에 대응되는 구문 규칙이 없습니다.');
 const result=fromEditor(validateEditorTheme({base:data.type==='light'?'vs':'vs-dark',inherit:true,rules,colors:data.colors}),data.name||filename.replace(/\.[^.]+$/,''));result.importNote='VS Code TextMate의 기본 C/C++ 토큰을 Monaco에 매핑했습니다. 문맥별 scope·semanticTokenColors는 지원하지 않습니다.';return result;
}
export function editorTheme(theme){
 const c=theme.colors,original=theme.originalColors||{},result=theme.editor?structuredClone(theme.editor):{base:theme.base==='dark'?'vs-dark':'vs',inherit:true,rules:[],colors:{}};result.base=theme.base==='dark'?'vs-dark':'vs';
 for(const token of ['keyword','type','string','number','comment','identifier','function'])if(!theme.editor||c[token]!==original[token]){result.rules=result.rules.filter(r=>r.token!==token);result.rules.push({token,foreground:c[token].slice(1),fontStyle:theme.editor?.rules.findLast(r=>r.token===token)?.fontStyle||''});}
 for(const [key,id]of Object.entries(UI))if(!theme.editor||c[key]!==original[key])result.colors[id]=c[key];
 if(!theme.editor){result.rules.push({token:'keyword.directive',foreground:c.type.slice(1)},{token:'delimiter',foreground:c.muted.slice(1)});result.colors['editorGutter.background']=c.background;}
 return result;
}
