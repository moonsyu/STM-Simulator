// User-customizable keyboard shortcuts. Defaults follow the user's requested scheme:
// Ctrl+F5 run, F10 start debugging, F11 step over (한 줄 실행), Ctrl+F2 stop.
export const KEYBINDINGS_KEY='stm32lab.keybindings.v1';
export const DEFAULT_KEYBINDINGS={
 'run.run':'Ctrl+F5','run.debug':'F10','run.over':'F11','run.into':'Ctrl+F11','run.out':'Shift+F11','run.pause':'F6','run.stop':'Ctrl+F2','run.build':'Ctrl+Shift+B','edit.format':'Alt+Shift+F',
 'view.palette':'Ctrl+Shift+P','view.quickOpen':'Ctrl+P','view.toggleSidebar':'Ctrl+B','view.togglePanel':'Ctrl+J','view.toggleAux':'Ctrl+Alt+B',
 'view.explorer':'Ctrl+Shift+E','view.parts':'Ctrl+Shift+A','view.examples':'Ctrl+Shift+X','view.board':'Ctrl+Shift+O','view.debug':'Ctrl+Shift+D','view.docs':'Ctrl+Shift+K',
 'view.settings':'Ctrl+,','view.keybindings':'Ctrl+K Ctrl+S','view.problems':'Ctrl+Shift+M','view.output':'Ctrl+Shift+U','view.terminal':'Ctrl+`'
};
const NAMES={' ':'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Escape:'Esc'};
// Canonical "Ctrl+Alt+Shift+Key" text for a keyboard event (null for bare modifier presses).
export function eventKey(event){
 const key=event.key;if(['Control','Shift','Alt','Meta','Process','Dead','Unidentified'].includes(key))return null;
 let name=NAMES[key]||(key.length===1?key.toUpperCase():key);
 if(event.code==='Backquote')name='`';else if(event.code==='Comma')name=',';else if(/^Key[A-Z]$/.test(event.code))name=event.code.slice(3);else if(/^Digit\d$/.test(event.code))name=event.code.slice(5);
 return [(event.ctrlKey||event.metaKey)&&'Ctrl',event.altKey&&'Alt',event.shiftKey&&'Shift',name].filter(Boolean).join('+');
}
export function validBinding(text){return typeof text==='string'&&text.length<=40&&/^((Ctrl\+)?(Alt\+)?(Shift\+)?([^\s+]+|\+)|[^ ]+ [^ ]+)$/.test(text);}
// Keys the app keeps for itself (editor, circuit and the fixed commands); a binding may not take them.
export const FIXED_KEYS={F9:'중단점',F1:'명령 팔레트',F3:'다음 찾기','Ctrl+S':'저장','Ctrl+Z':'되돌리기','Ctrl+Y':'다시 실행','Ctrl+Shift+Z':'다시 실행','Ctrl+F':'찾기','Ctrl+R':'바꾸기','Ctrl+H':'바꾸기','Ctrl+A':'모두 선택','Ctrl+C':'복사','Ctrl+V':'붙여넣기','Ctrl+X':'잘라내기','Ctrl+D':'복제',
 'Shift+F3':'이전 찾기','Ctrl+F3':'선택 찾기',F2:'이름 바꾸기',F12:'정의로 이동','Shift+F12':'참조 찾기','Ctrl+Space':'자동 완성','Ctrl+Shift+Space':'매개변수 힌트','Ctrl+/':'주석 전환',
 'Ctrl+Home':'파일 처음','Ctrl+End':'파일 끝','Ctrl+Left':'단어 이동','Ctrl+Right':'단어 이동','Ctrl+Up':'스크롤','Ctrl+Down':'스크롤','Ctrl+Backspace':'단어 지우기','Ctrl+Delete':'단어 지우기'};
// Why a key cannot be bound ('' when it can): a plain or Shift-only key would swallow typing in every text field.
export function bindingProblem(text){
 const first=String(text||'').split(' ')[0];if(!first)return '';
 if(!/^(Ctrl|Alt)\+/.test(first)&&!/^(Shift\+)?F\d{1,2}$/.test(first))return `${text}: 글자 입력과 겹칩니다. Ctrl·Alt 조합이나 F 키를 쓰세요.`;
 if(FIXED_KEYS[first])return `${first}는 ${FIXED_KEYS[first]}에 쓰는 고정 키입니다.`;
 return '';
}
export function loadKeybindings(storage=globalThis.localStorage){
 const out={...DEFAULT_KEYBINDINGS};
 try{const saved=JSON.parse(storage?.getItem(KEYBINDINGS_KEY)||'{}');for(const [id,key] of Object.entries(saved))if(id in DEFAULT_KEYBINDINGS&&(key===''||validBinding(key)&&!bindingProblem(key)))out[id]=key;}catch{}
 return out;
}
export function saveKeybindings(bindings,storage=globalThis.localStorage){
 const diff={};for(const [id,key] of Object.entries(bindings))if(key!==DEFAULT_KEYBINDINGS[id])diff[id]=key;
 try{storage?.setItem(KEYBINDINGS_KEY,JSON.stringify(diff));}catch{}
}
// Shared current bindings so button titles elsewhere can show the user's keys.
let current=null;
export function setCurrentKeybindings(bindings){current={...bindings};}
export function keyFor(id){return (current||=loadKeybindings())[id]||'';}
export function withKey(label,id){const k=keyFor(id);return k?`${label} (${k})`:label;}
// A key also clashes with a chord it starts (Ctrl+K vs Ctrl+K Ctrl+S): the single key would always win.
export function conflicts(bindings,id,key){return key?Object.entries(bindings).filter(([other,k])=>other!==id&&k&&(k===key||k.startsWith(key+' ')||key.startsWith(k+' '))).map(([other])=>other):[];}
// Matches single keys and two-step chords ("Ctrl+K Ctrl+S").
export function createMatcher(getBindings){
 let pending=null,timer=null;
 return event=>{
  const key=eventKey(event);if(!key)return null;
  const bindings=getBindings();
  if(pending){const chord=pending+' '+key;pending=null;clearTimeout(timer);const hit=Object.entries(bindings).find(([,k])=>k===chord);return hit?{id:hit[0]}:{consumed:true};}
  const exact=Object.entries(bindings).find(([,k])=>k===key);if(exact)return {id:exact[0]};
  if(Object.values(bindings).some(k=>k.startsWith(key+' '))){pending=key;timer=setTimeout(()=>{pending=null;},1500);return {consumed:true};}
  return null;
 };
}
