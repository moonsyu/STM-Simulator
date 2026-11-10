// Fields of a C struct type, for member completion after "." and "->" (hadc1.Init.Resolution, GPIO_InitStruct.Pull,
// huart->Instance). Reads "typedef struct { … } Name;", "typedef struct Tag { … } Name;" and "struct Name { … };" in a
// header or a source file; comments, strings and preprocessor lines are ignored.

const mask=source=>String(source||'').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,s=>s.replace(/[^\n]/g,' ')).replace(/^[ \t]*#[^\n]*(?:\\\n[^\n]*)*/gm,s=>s.replace(/[^\n]/g,' '));
const QUALIFIERS=/\b(?:__IO|__I|__O|__IM|__OM|__IOM|const|volatile|static|register|struct|union|enum)\b/g;
/** The body between the braces that end at `close` (index of "}"), or null. */
function bodyBefore(text,close){let depth=0;for(let i=close;i>=0;i--){if(text[i]==='}')depth++;else if(text[i]==='{'&&--depth===0)return text.slice(i+1,close);}return null;}
function bodyAfter(text,open){let depth=0;for(let i=open;i<text.length;i++){if(text[i]==='{')depth++;else if(text[i]==='}'&&--depth===0)return text.slice(open+1,i);}return null;}

/** [{name, type}] of the struct or union type `typeName` defined in `source`; [] when it is not defined there. */
export function structFields(source,typeName){
 if(!/^[A-Za-z_]\w*$/.test(typeName||''))return [];
 const text=mask(source);let body=null;
 const end=new RegExp(`\\}\\s*${typeName}\\s*;`).exec(text);
 if(end)body=bodyBefore(text,end.index);
 if(body===null){const tag=new RegExp(`\\b(?:struct|union)\\s+${typeName}\\s*\\{`).exec(text);if(tag)body=bodyAfter(text,tag.index+tag[0].length-1);}
 if(body===null)return [];
 // Declarations at the top level of the body; a nested struct or union contributes the names declared after its "}".
 const out=[],seen=new Set();let depth=0,start=0;
 const add=(name,type)=>{if(name&&!seen.has(name)){seen.add(name);out.push({name,type:type.replace(QUALIFIERS,' ').replace(/[*\s]+/g,' ').trim()});}};
 for(let i=0;i<=body.length;i++){
  const ch=body[i];if(ch==='{')depth++;else if(ch==='}')depth--;
  if(i<body.length&&!(ch===';'&&depth===0))continue;
  let decl=body.slice(start,i).trim();start=i+1;if(!decl)continue;
  let type='';
  const close=decl.lastIndexOf('}');
  if(close>=0){type=(/^\s*(?:struct|union)\s+([A-Za-z_]\w*)/.exec(decl)?.[1])||'';decl=decl.slice(close+1);}
  else{
   const pointer=/\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\(/.exec(decl);if(pointer){add(pointer[1],'');continue;}
   const first=/^([\s\S]*?)([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?::\s*\w+\s*)?(?:,|$)/.exec(decl);if(!first)continue;
   type=first[1];decl=decl.slice(first[1].length);
  }
  for(const part of decl.split(',')){const name=/([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?::\s*\w+\s*)?$/.exec(part.trim())?.[1];add(name,type);}
 }
 return out;
}

const NOT_A_TYPE=new Set(['return','else','case','goto','sizeof','typedef','if','while','for','switch','do','new','delete','throw']);
/** The declared type name of the variable or parameter `name` in `source` ("ADC_HandleTypeDef" for hadc1), or ''. */
export function declaredType(source,name){
 if(!/^[A-Za-z_]\w*$/.test(name||''))return '';
 const text=mask(source),pattern=new RegExp(`\\b([A-Za-z_]\\w*)\\s*(?:\\*\\s*)*(?:\\b(?:const|volatile)\\s*)?\\b${name}\\b\\s*(?=[;=,\\[)])`,'g');
 for(const m of text.matchAll(pattern))if(!NOT_A_TYPE.has(m[1])&&m[1]!==name)return m[1];
 return '';
}

/** "hadc1.Init." → ['hadc1','Init'] for the text before the cursor, or null when it does not end in a member access. */
export function accessChain(before){
 const m=/([A-Za-z_]\w*(?:\s*\[[^\]]*\])?(?:\s*(?:\.|->)\s*[A-Za-z_]\w*(?:\s*\[[^\]]*\])?)*)\s*(?:\.|->)\s*$/.exec(before);
 return m?m[1].split(/\s*(?:\.|->)\s*/).map(part=>part.replace(/\s*\[[^\]]*\]$/,'')):null;
}
