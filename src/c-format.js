// Built-in C/C++ code formatter used when clangd is unavailable (circuit simulator, emulator, no tools).
// It is deliberately conservative: it never changes the number of lines, never touches string/char
// literals, comments or preprocessor lines, and only rewrites leading indentation plus a few
// unambiguous spacing rules (keyword parentheses, braces, commas, semicolons in for headers).

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

/**
 * Puts each statement of compact code on its own line — after `;` outside parentheses, after a block `{`,
 * around a block `}` (keeping `} else`, `} while`, `};`) and after `case …:` — then re-indents with formatC.
 * Initializer braces (`= {0, 1}`), `for (;;)` headers, strings, comments and preprocessor lines are kept.
 * Line numbers change, so this is for generated examples, not for code being edited.
 */
export function expandC(source,{tabSize=2}={}){
 const eol=source.includes('\r\n')?'\r\n':'\n',out=[],state={comment:false},braces=[];// true = initializer brace
 let paren=0,continued=false;
 for(const raw of source.split(/\r?\n/)){
  if(!state.comment&&(continued||raw.trim().startsWith('#'))){continued=/\\\s*$/.test(raw);out.push(raw);continue;}
  if(!raw.trim()){out.push('');continue;}
  let line='',statement='',pending=false;
  const flush=()=>{if(line.trim())out.push(line.replace(/\s+$/,''));line='';};
  for(const part of scan(raw,state)){
   // A comment after a statement stays on its line; anything else starts the next line.
   if(!part.code){if(pending){pending=false;if(/^\/[/*]/.test(part.text))line+=' ';else flush();}line+=part.text;statement+=part.text;continue;}
   const t=part.text;
   for(let i=0;i<t.length;i++){
    const ch=t[i],init=braces.length>0&&braces[braces.length-1];
    if(pending){if(/\s/.test(ch))continue;pending=false;flush();}
    if(ch==='{'){
     const inits=init||/(?:[=,(\[]|\breturn)\s*$/.test(line);braces.push(inits);line+=ch;
     if(!inits){statement='';pending=true;}else statement+=ch;
     continue;
    }
    if(ch==='}'&&braces.length){
     braces.pop();
     if(init){line+=ch;statement+=ch;continue;}
     flush();line='}';statement='';
     if(!/^\s*(?:else\b|while\b|[;,)])/.test(t.slice(i+1)))pending=true;
     continue;
    }
    if(ch==='(')paren++;else if(ch===')')paren=Math.max(0,paren-1);
    line+=ch;statement+=ch;
    if(init||paren)continue;
    if(ch===';'){statement='';pending=true;}
    else if(ch===':'&&t[i+1]!==':'&&/^\s*(?:case\b|default\b)/.test(statement)){statement='';pending=true;}
   }
  }
  flush();
 }
 return formatC(out.join(eol),{tabSize});
}

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
