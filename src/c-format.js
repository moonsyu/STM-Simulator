// Built-in C/C++ code formatter used when clangd is unavailable (circuit simulator, emulator, no tools).
// formatC rewrites leading indentation plus a few unambiguous spacing rules (keyword parentheses, braces,
// commas) and never changes the number of lines. formatCode also puts each statement on its own line.
// Neither touches string/char literals, comments, preprocessor lines or operator spacing.

const CONTROL=/^(if|for|while|switch|else\s+if)\b/;

/** Splits one line into code and non-code segments, carrying block-comment state across lines. */
function scan(line,state){
 const parts=[];let i=0,code='';
 const flush=()=>{if(code){parts.push({code:true,text:code});code='';}};
 while(i<line.length){
  if(state.comment){const end=line.indexOf('*/',i);const stop=end<0?line.length:end+2;flush();parts.push({code:false,text:line.slice(i,stop)});i=stop;if(end>=0)state.comment=false;continue;}
  const c=line[i],n=line[i+1];
  if(c==='/'&&n==='/'){flush();parts.push({code:false,text:line.slice(i)});break;}
  if(c==='/'&&n==='*'){state.comment=true;flush();const end=line.indexOf('*/',i+2);const stop=end<0?line.length:end+2;parts.push({code:false,text:line.slice(i,stop)});i=stop;if(end>=0)state.comment=false;continue;}
  if(c==='"'||c==="'"){let j=i+1;while(j<line.length&&line[j]!==c){if(line[j]==='\\')j++;j++;}flush();parts.push({code:false,text:line.slice(i,Math.min(j+1,line.length))});i=j+1;continue;}
  code+=c;i++;
 }
 flush();return parts;
}

/** Normalizes spacing inside a code-only segment. */
function space(text){
 return text
  .replace(/\b(if|for|while|switch|return|sizeof)\s*\(/g,(m,k)=>k==='sizeof'?'sizeof(':`${k} (`)
  .replace(/\)\s*\{/g,') {')
  .replace(/\belse\s*\{/g,'else {')
  .replace(/\}\s*else\b/g,'} else')
  .replace(/\bdo\s*\{/g,'do {')
  .replace(/\}\s*while\b/g,'} while')
  .replace(/,(?=[^\s\n])/g,', ')
  .replace(/\s+,/g,',')
  .replace(/\s+;/g,';');
}

/**
 * Formats C source. `tabSize` spaces per level. With `range` ({start,end}, 1-based inclusive),
 * only those lines are rewritten (indentation is still computed from the whole file).
 * Returns the formatted text; the line count never changes.
 */
export function formatC(source,{tabSize=4,range=null}={}){
 const eol=source.includes('\r\n')?'\r\n':'\n';
 const lines=source.split(/\r?\n/),out=[];
 const unit=' '.repeat(Math.max(1,Math.min(8,tabSize|0||4)));
 const state={comment:false};
 const stack=[];// one entry per open brace: {switch, flat}
 const depth=()=>stack.filter(b=>!b.flat).length;
 let paren=0,hanging=0,continued=false,header='';
 for(let index=0;index<lines.length;index++){
  const raw=lines[index],wasComment=state.comment,inRange=!range||(index+1>=range.start&&index+1<=range.end);
  const trimmed=raw.trim();
  // Preprocessor lines (and their backslash continuations) are kept verbatim.
  if(!wasComment&&(continued||trimmed.startsWith('#'))){continued=/\\\s*$/.test(raw);out.push(inRange?raw.replace(/\s+$/,''):raw);continue;}
  if(!trimmed){out.push(inRange?'':raw);continue;}
  const parts=scan(trimmed,state);
  const codeText=parts.filter(p=>p.code).map(p=>p.text).join(' ');
  const top=stack[stack.length-1];
  let level=depth()+(top?.switch?1:0);
  const startsClose=!wasComment&&/^[}\]]/.test(trimmed);
  if(startsClose&&/^\}/.test(trimmed))level=depth()-(top&&!top.flat?1:0);
  const label=!wasComment&&/^(case\b[^:]*|default)\s*:/.test(trimmed);
  if(label&&top?.switch)level=depth();
  let text;
  if(wasComment)text=/^\*/.test(trimmed)?'star':'keep';
  else if(paren>0)level+=2;// continuation of an open call or condition
  else if(hanging&&!/^\{/.test(trimmed))level+=hanging;
  const indent=unit.repeat(Math.max(0,level));
  if(text==='star')text=indent+' '+trimmed;
  else if(text==='keep')text=raw.replace(/\s+$/,'');
  else text=indent+parts.map(p=>p.code?space(p.text):p.text).join('').replace(/\s+$/,'');
  out.push(inRange?text:raw);
  // Update nesting from code characters only.
  for(const ch of codeText){
   if(ch==='('||ch==='[')paren++;
   else if(ch===')'||ch===']')paren=Math.max(0,paren-1);
   if(ch==='{'){stack.push({switch:/\bswitch\b/.test(header),flat:/\b(extern|namespace)\b/.test(header)&&!/[()=]/.test(header)});header='';}
   else if(ch==='}'){stack.pop();header='';}
   else if(ch===';')header='';
   else header+=ch;
  }
  // Brace-less control statements indent exactly the next statement.
  const body=codeText.trim();
  if(!wasComment&&body&&paren===0){
   const head=body.replace(/^\}\s*/,'');
   const control=(CONTROL.test(head)&&/\)\s*$/.test(head))||/^else$/.test(head)||/^do$/.test(head);
   hanging=control?Math.min(hanging+1,4):0;
  }
 }
 return out.join(eol);
}

const BRANCH_KEYWORD=/^\s*(?:if|for|while|switch|do|else|case|default)\b/;
/** True when `text` (the rest of a line) is one simple statement that ends with `;` before any brace or comment. */
function singleStatement(text){
 if(!text.trim()||BRANCH_KEYWORD.test(text)||/^\s*[{;]/.test(text))return false;
 let depth=0;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'||c==="'"){i++;while(i<text.length&&text[i]!==c){if(text[i]==='\\')i++;i++;}continue;}
  if(c==='/'&&(text[i+1]==='/'||text[i+1]==='*'))return false;
  if(c==='(')depth++;else if(c===')')depth--;
  else if(c==='{'||c==='}')return false;
  else if(c===';'&&depth===0)return true;
 }
 return false;
}

/**
 * Splits compact C into one statement per line: after `;` outside parentheses, after a block `{`, around a
 * block `}` (keeping `} else`, `} while`, `};`) and after `case …:`. Initializer braces (`= {0, 1}`),
 * `for (;;)` headers, strings, comments and preprocessor lines are kept. A brace-less branch that follows a
 * braced `}` on the same line (`} else stmt;`, `} else if (c) stmt;`) gets braces so the whole chain reads
 * the same. Returns, for every source line, the (not yet indented) lines it becomes.
 */
export function splitStatements(source){
 const groups=[],state={comment:false},braces=[];// 'init' | 'block' | 'added'
 let paren=0,continued=false;
 for(const raw of source.split(/\r?\n/)){
  if(!state.comment&&(continued||raw.trim().startsWith('#'))){continued=/\\\s*$/.test(raw);groups.push([raw]);continue;}
  if(!raw.trim()){groups.push(['']);continue;}
  const pieces=[],parts=scan(raw,state);
  let line='',statement='',pending=false,chain=null,header=false;
  const flush=()=>{if(line.trim())pieces.push(line.replace(/\s+$/,''));line='';};
  const rest=(pi,i)=>parts[pi].text.slice(i+1)+parts.slice(pi+1).map(p=>p.text).join('');
  const addBrace=()=>{line+=' {';braces.push('added');statement='';pending=true;chain=null;};
  for(let pi=0;pi<parts.length;pi++){
   const part=parts[pi];
   // A comment after a statement stays on its line; anything else starts the next line.
   if(!part.code){if(pending){pending=false;if(/^\/[/*]/.test(part.text))line+=' ';else flush();}line+=part.text;statement+=part.text;continue;}
   const t=part.text;
   for(let i=0;i<t.length;i++){
    const ch=t[i],top=braces[braces.length-1],init=top==='init';
    if(pending){if(/\s/.test(ch))continue;pending=false;flush();}
    if(ch==='{'){
     const kind=init||/(?:[=,(\[]|\breturn)\s*$/.test(line)?'init':'block';braces.push(kind);line+=ch;chain=null;
     if(kind==='block'){statement='';pending=true;}else statement+=ch;
     continue;
    }
    if(ch==='}'&&braces.length&&top!=='added'){
     braces.pop();
     if(init){line+=ch;statement+=ch;continue;}
     flush();line='}';statement='';
     const after=rest(pi,i);
     if(/^\s*else\b/.test(after))chain='else';
     // `} T;` / `} g, h;` of a typedef or variable declaration keeps its name on the brace line.
     else if(!/^\s*(?:while\b|[;,)]|[A-Za-z_]\w*\s*(?:[;,]|$))/.test(after))pending=true;
     continue;
    }
    if(ch==='(')paren++;else if(ch===')')paren=Math.max(0,paren-1);
    line+=ch;statement+=ch;
    if(chain==='else'&&/\belse$/.test(line)&&!/\w/.test(t[i+1]||'')){
     const after=rest(pi,i);
     if(/^\s*if\b/.test(after)){chain='if';header=false;}else if(singleStatement(after))addBrace();else chain=null;
     continue;
    }
    if(chain==='if'){if(ch==='(')header=true;else if(ch===')'&&header&&paren===0){chain=null;if(singleStatement(rest(pi,i)))addBrace();}continue;}
    if(init||paren)continue;
    if(ch===';'){
     statement='';
     if(top==='added'){braces.pop();flush();line='}';if(/^\s*else\b/.test(rest(pi,i)))chain='else';else pending=true;}
     else pending=true;
    }
    // `case N: {` keeps its block brace on the label line.
    else if(ch===':'&&t[i+1]!==':'&&/^\s*(?:case\b|default\b)/.test(statement)){statement='';if(!/^\s*\{/.test(rest(pi,i)))pending=true;}
   }
  }
  flush();groups.push(pieces);
 }
 return groups;
}

/**
 * Full formatting (편집 → 코드 정렬, `}` block, save): splitStatements then formatC indentation. Returns the
 * text and, for every source line, the formatted lines it became, so the editor can apply the change line
 * by line and keep breakpoints on their statements. With `range`, only those source lines change.
 */
export function formatCode(source,{tabSize=4,range=null}={}){
 const eol=source.includes('\r\n')?'\r\n':'\n',original=source.split(/\r?\n/),groups=splitStatements(source);
 const formatted=formatC(groups.flat().join('\n'),{tabSize}).split('\n');let k=0;
 const lines=groups.map((g,index)=>{const out=formatted.slice(k,k+=g.length);return !range||(index+1>=range.start&&index+1<=range.end)?out:[original[index]];});
 return {text:lines.flat().join(eol),lines};
}
/** formatCode for code the app generates (examples, new projects, Pinout): 4-space indentation. */
export const expandC=(source,{tabSize=4}={})=>formatCode(source,{tabSize}).text;

/** Line range (1-based) of the block whose `}` sits on `line` (the last `}` before `column`, if given), or null. */
export function blockRange(source,line,column=Infinity){
 const lines=source.split(/\r?\n/),state={comment:false},opens=[];let found=null;
 for(let i=0;i<lines.length&&i<line;i++){
  const text=i+1===line?lines[i].slice(0,Math.max(0,column-1)):lines[i];
  if(text.trim().startsWith('#')&&!state.comment)continue;
  for(const p of scan(text,state))if(p.code)for(const ch of p.text){
   if(ch==='{')opens.push(i+1);
   else if(ch==='}'){const start=opens.pop();if(i+1===line)found=start===undefined?null:{start,end:line};}
  }
 }
 return found;
}
