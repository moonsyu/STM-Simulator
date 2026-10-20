import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_KEYBINDINGS,KEYBINDINGS_KEY,eventKey,validBinding,loadKeybindings,saveKeybindings,conflicts,createMatcher} from '../../src/keybindings.js';

const store=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};};
const ev=(key,{ctrl=false,shift=false,alt=false,code}={})=>({key,code:code??(key.length===1?'Key'+key.toUpperCase():key),ctrlKey:ctrl,shiftKey:shift,altKey:alt,metaKey:false});

test('default shortcuts follow the requested scheme',()=>{
 assert.equal(DEFAULT_KEYBINDINGS['run.debug'],'F10');
 assert.equal(DEFAULT_KEYBINDINGS['run.over'],'F11');
 assert.equal(DEFAULT_KEYBINDINGS['run.stop'],'Ctrl+F2');
 assert.equal(DEFAULT_KEYBINDINGS['run.run'],'Ctrl+F5');
 // No two commands share a default key.
 const keys=Object.values(DEFAULT_KEYBINDINGS);assert.equal(new Set(keys).size,keys.length);
});

test('eventKey canonicalises modifiers and layout-independent codes',()=>{
 assert.equal(eventKey(ev('F5',{ctrl:true})),'Ctrl+F5');
 assert.equal(eventKey(ev('F2',{ctrl:true})),'Ctrl+F2');
 assert.equal(eventKey(ev('P',{ctrl:true,shift:true})),'Ctrl+Shift+P');
 assert.equal(eventKey(ev('ㅔ',{ctrl:true,code:'KeyP'})),'Ctrl+P');
 assert.equal(eventKey(ev('<',{ctrl:true,shift:true,code:'Comma'})),'Ctrl+Shift+,');
 assert.equal(eventKey(ev('b',{ctrl:true,alt:true})),'Ctrl+Alt+B');
 assert.equal(eventKey(ev('Control',{ctrl:true,code:'ControlLeft'})),null);
});

test('overrides are stored as a diff and invalid entries are ignored',()=>{
 const s=store();
 const b=loadKeybindings(s);b['run.run']='F5';b['view.terminal']='';saveKeybindings(b,s);
 assert.deepEqual(JSON.parse(s.getItem(KEYBINDINGS_KEY)),{'run.run':'F5','view.terminal':''});
 s.setItem(KEYBINDINGS_KEY,JSON.stringify({'run.run':'F5','bogus.cmd':'F1','run.stop':'not a key at all'}));
 const loaded=loadKeybindings(s);
 assert.equal(loaded['run.run'],'F5');assert.equal(loaded['run.stop'],'Ctrl+F2');assert.ok(!('bogus.cmd' in loaded));
 s.setItem(KEYBINDINGS_KEY,'{broken');assert.deepEqual(loadKeybindings(s),DEFAULT_KEYBINDINGS);
 assert.ok(validBinding('Ctrl+K Ctrl+S'));assert.ok(!validBinding('a b c'));
});

test('conflicts and chord matching',()=>{
 const b={...DEFAULT_KEYBINDINGS,'run.build':'F10'};
 assert.deepEqual(conflicts(b,'run.build','F10'),['run.debug']);
 const match=createMatcher(()=>DEFAULT_KEYBINDINGS);
 assert.deepEqual(match(ev('F10',{code:'F10'})),{id:'run.debug'});
 assert.deepEqual(match(ev('F5',{ctrl:true,code:'F5'})),{id:'run.run'});
 assert.deepEqual(match(ev('k',{ctrl:true})),{consumed:true});
 assert.deepEqual(match(ev('s',{ctrl:true})),{id:'view.keybindings'});
 assert.equal(match(ev('F5',{code:'F5'})),null);
});
