import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importColorscheme,vimColorscheme,editorTheme,validateEditorTheme} from '../src/colorscheme.js';
import {JELLYBEAN,defaultPreferences,validatePreferences} from '../src/ide-preferences.js';
test('registered Jellybeans derives actual GUI groups from unchanged pinned source',()=>{
 const bytes=readFileSync(new URL('../src/themes/jellybeans/jellybeans.vim',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),JELLYBEAN.source.sha256);
 assert.deepEqual(vimColorscheme(bytes.toString(),{jellybeans:true}).editor,JELLYBEAN.editor);
 const theme=editorTheme(JELLYBEAN);assert.equal(theme.colors['editor.selectionBackground'],'#404040');assert.equal(theme.colors['editor.lineHighlightBackground'],'#1c1c1c');assert.equal(theme.colors['editor.findMatchBackground'],'#302028');assert.equal(theme.rules.find(r=>r.token==='comment').fontStyle,'italic');assert.equal(theme.rules.find(r=>r.token==='keyword.directive').foreground,'8fbfdc');assert.equal(theme.rules.find(r=>r.token==='delimiter').foreground,'668799');
});
test('Monaco theme keeps detailed rules and alpha UI colors through preferences and export',()=>{
 const theme=importColorscheme(JSON.stringify({name:'Ocean',base:'vs-dark',inherit:false,rules:[{token:'comment',foreground:'123456',fontStyle:'italic'},{token:'number.hex',foreground:'abcdef'}],colors:{'editor.background':'#101020','editor.foreground':'#eeeeee','editor.selectionBackground':'#8899aabb'}}));
 const p=defaultPreferences();p.themes.push(theme);p.theme=theme.id;const saved=validatePreferences(JSON.parse(JSON.stringify(p))).themes.at(-1);assert.deepEqual(editorTheme(saved),theme.editor);
 saved.colors.comment='#ffffff';assert.equal(editorTheme(saved).rules.find(r=>r.token==='comment').fontStyle,'italic');assert.equal(editorTheme(saved).rules.find(r=>r.token==='comment').foreground,'ffffff');assert.equal(editorTheme(saved).rules.find(r=>r.token==='number.hex').foreground,'abcdef');
 assert.equal(importColorscheme(JSON.stringify(editorTheme(saved))).editor.colors['editor.selectionBackground'],'#8899aabb');
});
test('VS Code JSONC maps supported C scopes, keeping quoted URLs and trailing commas valid',()=>{
 const t=importColorscheme(`{// comment\n"name":"https://example.org/theme", "type":"light", "colors":{"editor.background":"#ffffff",/* trailing comment */}, "tokenColors":[{"scope":["keyword.control.c","storage.type"],"settings":{"foreground":"#112233","fontStyle":"bold"}},],}`);
 assert.equal(t.base,'light');assert.equal(t.editor.rules.find(r=>r.token==='keyword').foreground,'112233');assert.equal(t.editor.rules.find(r=>r.token==='type').fontStyle,'bold');assert.match(t.importNote,/scope/);
});
test('static Vim registration resolves links but refuses dynamic commands and unresolved colors',()=>{
 const t=importColorscheme('let g:colors_name = "Plum"\nset background=dark\nhi Normal guifg=#dddddd guibg=#201020\nhi Statement guifg=#abcdef gui=bold\nhi! link Type Statement\nhi Comment guifg=#998899 gui=italic','plum.vim');assert.equal(t.name,'Plum');assert.equal(t.editor.rules.find(r=>r.token==='type').foreground,'abcdef');
 assert.throws(()=>importColorscheme('!calc.exe','bad.vim'),/동적/);assert.throws(()=>importColorscheme('hi Normal guifg=NotAColor guibg=#111111','bad.vim'),/GUI 색상/);assert.throws(()=>importColorscheme('{"include":"../a.json"}'),/include/);assert.throws(()=>importColorscheme('x'.repeat(500001)),/500 KB/);
 for(const data of [{base:'bad',inherit:true,rules:[],colors:{}},{base:'vs',inherit:true,rules:[{token:'x',foreground:'url(x)'}],colors:{}}])assert.throws(()=>validateEditorTheme(data));
});
test('legacy Jellybean palette migrates to upstream while keeping explicit user colors',()=>{
 const p=defaultPreferences(),t=p.themes[0];delete t.editor;delete t.originalColors;delete t.source;t.colors.selection='#403c41';t.colors.line='#202020';t.colors.search='#5c3446';t.colors.comment='#123456';
 const next=validatePreferences(p).themes[0];assert.equal(next.colors.selection,'#404040');assert.equal(next.colors.comment,'#123456');assert.equal(editorTheme(next).rules.find(r=>r.token==='comment').foreground,'123456');assert.ok(next.source.commit);
});
