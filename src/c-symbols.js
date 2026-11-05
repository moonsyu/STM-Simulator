// C source symbols for "go to definition" (Ctrl+click, F12) and the Outline view, like CubeIDE's indexer: includes,
// macros, typedef names, enum constants, global variables, function definitions and prototypes, each with its line.
// A text scan (no preprocessor): every #if branch counts, so a name can have several definitions.
export const KIND_RANK={function:0,macro:1,typedef:2,enum:3,variable:4,declaration:5,include:9};
const KEYWORDS=new Set(['if','for','while','switch','return','sizeof','do','else','case','default','goto','break','continue','typedef','struct','union','enum','static','extern','const','volatile','inline','register','auto','signed','unsigned','void','int','char','short','long','float','double']);
// Comments and string/char literals become spaces (offsets and line breaks are kept).
function maskText(source){return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,s=>s.replace(/[^\n]/g,' '));}
// Preprocessor lines (with their \-continuations) also become spaces for the brace scan: macro bodies hold braces.
function maskDirectives(masked){return masked.replace(/^[ \t]*#(?:[^\n]*\\\r?\n)*[^\n]*/gm,s=>s.replace(/[^\n]/g,' '));}
const squash=s=>s.replace(/\s+/g,' ').trim();
export function cSymbols(source){
  const text=String(source||''),masked=maskText(text),code=maskDirectives(masked),out=[];
  const starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);
  const lineOf=offset=>{let lo=0,hi=starts.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=offset)lo=mid;else hi=mid-1;}return lo+1;};
  const add=(name,kind,offset,detail)=>{if(!name||kind!=='include'&&KEYWORDS.has(name))return;const line=lineOf(offset);out.push({name,kind,line,column:offset-starts[line-1]+1,detail:detail?squash(detail):''});};
  // The file name is a string literal (masked), so includes are read from the text where the # is not in a comment.
  for(const m of text.matchAll(/^[ \t]*#[ \t]*include[ \t]*([<"])([^>"\n]+)[>"]/gm))if(masked[m.index+m[0].indexOf('#')]==='#')add(m[2],'include',m.index+m[0].indexOf(m[2]),m[1]+m[2]+(m[1]==='<'?'>':'"'));
  for(const m of masked.matchAll(/^([ \t]*#[ \t]*define[ \t]+)([A-Za-z_]\w*)(\([^)\n]*\))?/gm))add(m[2],'macro',m.index+m[1].length,m[2]+(m[3]||''));
  // Brace scan at file level: function bodies, struct/union/enum bodies (typedef names, enum constants), initializers.
  const blocks=[];let depth=0,stmt=0,skipName=false;
  const prev=i=>{let j=i-1;while(j>=0&&/\s/.test(code[j]))j--;return j;};
  for(let i=0;i<code.length;i++){
    const c=code[i];
    if(c==='{'){
      if(depth>0){blocks.push({type:'inner'});depth++;continue;}
      const head=code.slice(stmt,i);
      if(/\bextern\s*$/.test(head)){blocks.push({type:'extern'});stmt=i+1;continue;}
      let type='init';const j=prev(i);
      if(code[j]===')'){let k=j,p=0;for(;k>=stmt;k--){if(code[k]===')')p++;else if(code[k]==='('&&--p===0)break;}
        const m=/([A-Za-z_]\w*)\s*$/.exec(code.slice(stmt,k));if(m&&!KEYWORDS.has(m[1])&&!/=/.test(code.slice(stmt,k))){type='function';add(m[1],'function',stmt+m.index,code.slice(stmt,j+1));}}
      else if(/\b(struct|union|enum)\b[^;=]*$/.test(head))type=/\benum\b[^;=]*$/.test(head)?'enum':'struct';
      blocks.push({type,typedef:/\btypedef\b/.test(head),start:i});depth++;continue;
    }
    if(c==='}'){
      const b=blocks.pop();if(!b)continue;if(b.type==='extern'){stmt=i+1;continue;}depth--;
      if(depth>0)continue;
      if(b.type==='enum'){const body=code.slice(b.start+1,i);for(const m of body.matchAll(/(^|,)(\s*)([A-Za-z_]\w*)/g)){const at=b.start+1+m.index+m[1].length+m[2].length;add(m[3],'enum',at,code.slice(at,b.start+1+(body.indexOf(',',m.index+1)+1||body.length)).replace(/,\s*$/,''));}}
      if(b.type==='function'){stmt=i+1;continue;}
      if(b.type==='struct'||b.type==='enum'){
        if(b.typedef){const m=/^\s*([A-Za-z_]\w*)/.exec(code.slice(i+1));if(m)add(m[1],'typedef',i+1+m.index+m[0].indexOf(m[1]),'typedef '+(b.type==='enum'?'enum':'struct')+' '+m[1]);skipName=true;}
        stmt=i+1;
      }
      continue;
    }
    if(c===';'&&depth===0){
      const s=code.slice(stmt,i),t=squash(s);
      if(skipName||!t){skipName=false;stmt=i+1;continue;}
      const at=name=>stmt+s.lastIndexOf(name);
      if(/^typedef\b/.test(t)){const m=/\(\s*\*\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)*$/.exec(t),name=m&&(m[1]||m[2]);if(name)add(name,'typedef',at(name),code.slice(stmt,i));}
      else{
        const decl=t.split('=')[0],fn=/([A-Za-z_]\w*)\s*\([^()]*(\([^()]*\)[^()]*)*\)\s*$/.exec(decl);
        if(fn&&t===decl)add(fn[1],'declaration',at(fn[1]),code.slice(stmt,i));
        else{const m=/([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)*$/.exec(decl);if(m&&/[\s*]/.test(decl.trim()))add(m[1],/^extern\b/.test(t)?'declaration':'variable',stmt+s.split('=')[0].lastIndexOf(m[1]),code.slice(stmt,i).split('=')[0]);}
      }
      stmt=i+1;
    }
  }
  return out.sort((a,b)=>a.line-b.line||a.column-b.column);
}
// Outline text as CubeIDE shows it: name(params) : return type, variable : type.
const STORAGE=/\b(static|extern|inline|__weak|__STATIC_INLINE|__STATIC_FORCEINLINE|__INLINE|__NO_RETURN|__IO|const|volatile)\b|__attribute__\s*\(\(.*?\)\)/g;
export function outlineLabel(s){
  if(s.kind==='function'||s.kind==='declaration'){const m=/^(.*?)\b([A-Za-z_]\w*)\s*\((.*)\)\s*(?:__attribute__.*)?;?$/.exec(s.detail);if(m&&m[2]===s.name){const ret=squash(m[1].replace(STORAGE,''));return `${s.name}(${squash(m[3])})${ret?' : '+ret:''}`;}}
  if(s.kind==='variable'){const i=s.detail.lastIndexOf(s.name),type=i>0?squash(s.detail.slice(0,i).replace(STORAGE,'')):'',dims=(/^\s*((\[[^\]]*\]\s*)*)/.exec(s.detail.slice(i+s.name.length))?.[1]||'').replace(/\s+/g,'');return type?`${s.name}${dims} : ${type}`:s.name;}
  if(s.kind==='macro'||s.kind==='include')return s.detail||s.name;
  return s.name;
}
// The best definitions of a name: function bodies first, then macros, typedefs, enum constants, variables, prototypes.
export function pickDefinitions(entries){
  if(!entries?.length)return [];const best=Math.min(...entries.map(e=>KIND_RANK[e.kind]??8));return entries.filter(e=>(KIND_RANK[e.kind]??8)===best);
}
