import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PREFERENCES_KEY,COLOR_LABELS,JELLYBEAN,LIGHT,BUILTIN_THEMES,appearanceMode,defaultPreferences,validatePreferences,loadPreferences,selectedTheme,withEditorTheme} from '../../src/ide-preferences.js';
import {validateEditorTheme,vimColorscheme,importColorscheme,editorTheme} from '../../src/colorscheme.js';
import GITHUB_LIGHT from '../../src/themes/github-light/theme.js';

const prefs=(extra={})=>({...defaultPreferences(),...extra});
const customTheme=(id='mine',base='dark',extra={})=>({id,name:'My theme',base,colors:{...JELLYBEAN.colors},...extra});
const memoryStorage=text=>({getItem:key=>key===PREFERENCES_KEY?text:null});

describe('IDE preference defaults',()=>{
  test('defaults: system appearance, Jellybeans dark, GitHub Light light, built-in themes',()=>{
    const d=defaultPreferences();
    assert.equal(d.version,2);assert.equal(d.appearance,'system');assert.equal(d.darkTheme,'jellybean');assert.equal(d.lightTheme,'github-light');
    assert.deepEqual(d.themes.map(t=>t.id),['jellybean','github-light','stm-light']);assert.equal(d.tabSize,4);assert.equal(d.fontSize,14);
    assert.notEqual(d.themes[0],JELLYBEAN,'themes are deep copies');
    assert.deepEqual(validatePreferences(d),d,'defaults validate unchanged');
  });
  test('built-in themes define every UI colour as #rrggbb',()=>{
    for(const theme of BUILTIN_THEMES)for(const key of Object.keys(COLOR_LABELS))assert.match(theme.colors[key],/^#[0-9a-f]{6}$/,`${theme.id}.${key}`);
    assert.equal(LIGHT.base,'light');assert.equal(JELLYBEAN.base,'dark');
  });
});

describe('appearance mode and selected theme',()=>{
  test('system follows the OS; explicit dark/light ignore it',()=>{
    assert.equal(appearanceMode({appearance:'system'},true),'dark');assert.equal(appearanceMode({appearance:'system'},false),'light');
    assert.equal(appearanceMode({appearance:'dark'},false),'dark');assert.equal(appearanceMode({appearance:'light'},true),'light');
    assert.equal(appearanceMode({},false),'dark','missing appearance defaults to dark');
  });
  test('system appearance without matchMedia (Node) is dark',()=>{
    assert.equal(appearanceMode({appearance:'system'}),'dark');
  });
  test('selectedTheme picks the per-mode theme',()=>{
    const p=prefs();assert.equal(selectedTheme(p,'dark').id,'jellybean');assert.equal(selectedTheme(p,'light').id,'github-light');
    const light=prefs({appearance:'light'});assert.equal(selectedTheme(light).id,'github-light');
  });
  test('withEditorTheme changes only the current mode slot',()=>{
    const p=withEditorTheme(prefs({appearance:'light'}),'stm-light');assert.equal(p.lightTheme,'stm-light');assert.equal(p.darkTheme,'jellybean');assert.equal(p.theme,'stm-light');
    const d=withEditorTheme(prefs({appearance:'dark'}),'stm-light');assert.equal(d.darkTheme,'stm-light');assert.equal(d.lightTheme,'github-light');
  });
});

describe('validatePreferences',()=>{
  test('numeric ranges and line height',()=>{
    for(const [key,bad]of [['fontSize',8],['fontSize',41],['fontSize',14.5],['lineHeight',65],['uiFontSize',10],['terminalFontSize',33],['tabSize',0],['tabSize',9]])
      assert.throws(()=>validatePreferences(prefs({[key]:bad})),new RegExp(key),`${key}=${bad}`);
    assert.throws(()=>validatePreferences(prefs({fontSize:30,lineHeight:20})),/줄 높이/);
    assert.equal(validatePreferences(prefs({fontSize:40,lineHeight:64})).fontSize,40);
  });
  test('font family must be a plain font list',()=>{
    for(const bad of ['', '   ','x'.repeat(181),'Arial; } body { color: red','url(evil)'])assert.throws(()=>validatePreferences(prefs({fontFamily:bad})),/글꼴/);
    assert.equal(validatePreferences(prefs({fontFamily:"'D2Coding', 맑은 고딕, monospace"})).fontFamily,"'D2Coding', 맑은 고딕, monospace");
  });
  test('boolean display options',()=>{
    assert.throws(()=>validatePreferences(prefs({minimap:'yes'})),/표시 옵션/);assert.equal(validatePreferences(prefs({wordWrap:true})).wordWrap,true);
  });
  test('theme list structure, ids and colours',()=>{
    assert.throws(()=>validatePreferences(prefs({themes:[]})),/형식/);assert.throws(()=>validatePreferences(prefs({themes:Array(31).fill(customTheme())})),/형식/);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme('1bad')]})),/ID/);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme(),customTheme()]})),/ID/);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme('a','grey')]})),/ID/);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme('a','dark',{colors:{...JELLYBEAN.colors,keyword:'red'}})]})),/키워드: #RRGGBB/);
    const upper=validatePreferences(prefs({themes:[customTheme('a','dark',{colors:{...JELLYBEAN.colors,keyword:'#ABCDEF'}})]}));assert.equal(upper.themes[0].colors.keyword,'#abcdef');
  });
  test('built-in themes are restored when an import only contains custom themes',()=>{
    const p=validatePreferences({version:2,appearance:'dark',theme:'mine',darkTheme:'mine',lightTheme:'github-light',themes:[customTheme()]});
    assert.deepEqual(p.themes.map(t=>t.id),['mine','jellybean','github-light','stm-light']);assert.equal(selectedTheme(p,'dark').id,'mine');
  });
  test('selected and per-mode themes must exist; appearance must be known',()=>{
    assert.throws(()=>validatePreferences(prefs({theme:'nope'})),/선택한 색상 테마/);
    assert.throws(()=>validatePreferences(prefs({darkTheme:'nope'})),/화면별 코드 테마/);
    assert.throws(()=>validatePreferences(prefs({appearance:'sepia'})),/System, Dark, White/);
    assert.throws(()=>validatePreferences(prefs({version:3})),/형식/);assert.throws(()=>validatePreferences(null),/형식/);
  });
  test('theme source metadata is validated',()=>{
    const good={repository:'https://github.com/a/b',commit:'a'.repeat(40),sha256:'b'.repeat(64),file:'x.json',license:'MIT'};
    assert.deepEqual(validatePreferences(prefs({themes:[customTheme('s','dark',{source:good})]})).themes[0].source,good);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme('s','dark',{source:{...good,repository:'https://evil.example/a/b'}})]})),/출처/);
    assert.throws(()=>validatePreferences(prefs({themes:[customTheme('s','dark',{importNote:'x'.repeat(501)})]})),/안내 문구/);
  });
});

describe('preference migrations',()=>{
  test('version 1 files map the theme to its mode slot and 2-space tabs to 4',()=>{
    const v1={version:1,theme:'stm-light',tabSize:2,themes:structuredClone(BUILTIN_THEMES)};
    const p=validatePreferences(v1);assert.equal(p.version,2);assert.equal(p.lightTheme,'stm-light');assert.equal(p.darkTheme,'jellybean');assert.equal(p.tabSize,4);assert.equal(p.appearance,'system');
    assert.equal(validatePreferences({...v1,tabSize:3}).tabSize,3);
  });
  test('a legacy Jellybeans entry without editor rules upgrades to the pinned theme, keeping user edits',()=>{
    const legacyColors={background:'#151515',foreground:'#e8e8d3',panel:'#1f1f1f',chrome:'#262626',border:'#403c41',muted:'#a0a8b0',accent:'#fad07a',selection:'#403c41',line:'#202020',search:'#5c3446',keyword:'#8197bf',type:'#ffb964',string:'#99ad6a',number:'#cf6a4c',comment:'#888888',identifier:'#c6b6ee',function:'#fad07a',debug:'#43512d',error:'#e07070',warning:'#fad07a',net:'#e8b843'};
    const edited={...legacyColors,comment:'#00ff00'};
    const p=validatePreferences({version:1,theme:'jellybean',themes:[{id:'jellybean',name:'Jellybeans',base:'dark',colors:edited}]});
    const jb=p.themes.find(t=>t.id==='jellybean');assert.deepEqual(jb.editor,JELLYBEAN.editor);assert.equal(jb.colors.comment,'#00ff00','user edit kept');
    assert.equal(jb.colors.selection,JELLYBEAN.colors.selection,'untouched legacy colours take the new pinned value');
  });
  test('loadPreferences falls back to defaults on missing, corrupt or invalid storage',()=>{
    assert.deepEqual(loadPreferences(memoryStorage(null)),defaultPreferences());
    assert.deepEqual(loadPreferences(memoryStorage('{oops')),defaultPreferences());
    assert.deepEqual(loadPreferences(memoryStorage(JSON.stringify({version:2,themes:[]}))),defaultPreferences());
    assert.deepEqual(loadPreferences({getItem(){throw new Error('denied');}}),defaultPreferences());
    assert.deepEqual(loadPreferences(undefined),defaultPreferences());
    const saved=prefs({fontSize:18,lineHeight:26,appearance:'light'});assert.equal(loadPreferences(memoryStorage(JSON.stringify(saved))).fontSize,18);
  });
});

describe('colorscheme import',()=>{
  const monaco={name:'Ocean',base:'vs-dark',inherit:false,rules:[{token:'comment',foreground:'#123456',fontStyle:'italic bold blink'},{token:'keyword',foreground:'abcdef'}],colors:{'editor.background':'#000011','editor.foreground':'#eeeeee','editor.selectionBackground':'#11223344'}};
  test('Monaco theme JSON keeps rules, styles and alpha UI colours',()=>{
    const t=importColorscheme(JSON.stringify(monaco),'ocean.json');
    assert.equal(t.name,'Ocean');assert.equal(t.base,'dark');assert.equal(t.colors.background,'#000011');assert.equal(t.colors.comment,'#123456');assert.equal(t.colors.keyword,'#abcdef');
    assert.equal(t.editor.rules[0].fontStyle,'italic bold','unknown styles dropped');assert.equal(t.editor.colors['editor.selectionBackground'],'#11223344');
    assert.equal(t.colors.selection,'#112233','UI colour drops alpha');assert.deepEqual(t.originalColors,t.colors);
    assert.doesNotThrow(()=>validatePreferences(prefs({themes:[{...t,id:'ocean'}]})));
  });
  test('VS Code JSONC theme with tokenColors maps C scopes and ignores unrelated scopes',()=>{
    const text=`// comment\n{\n "name": "Code", "type": "light", /* block */\n "colors": {"editor.background": "#fafafa",},\n "tokenColors": [\n  {"scope": "comment", "settings": {"foreground": "#008000"}},\n  {"scope": ["keyword.control", "string.quoted.double"], "settings": {"foreground": "#0000ff"}},\n  {"scope": "comment.line.c", "settings": {"fontStyle": "italic"}},\n  {"scope": "support.type.property-name.json", "settings": {"foreground": "#ff0000"}},\n  {"scope": "meta.url \\"//x\\"", "settings": {"foreground": "#ff00ff"}}\n ]\n}`;
    const t=importColorscheme(text,'code.jsonc');
    assert.equal(t.base,'light');assert.equal(t.colors.background,'#fafafa');assert.equal(t.colors.comment,'#008000');assert.equal(t.colors.keyword,'#0000ff');assert.equal(t.colors.string,'#0000ff');
    const comment=t.editor.rules.find(r=>r.token==='comment');assert.equal(comment.foreground,'008000');assert.equal(comment.fontStyle,'italic','specific style merged with generic colour');
    assert.ok(!t.editor.rules.some(r=>r.foreground==='ff0000'),'JSON property scope never recolours C types');assert.match(t.importNote,/TextMate/);
  });
  test('rejections: size, syntax, include, settings files and unknown shapes',()=>{
    assert.throws(()=>importColorscheme('x'.repeat(500001)),/500 KB/);assert.throws(()=>importColorscheme('{bad json'),/JSON 문법/);
    assert.throws(()=>importColorscheme(JSON.stringify({include:'./base.json',tokenColors:[],colors:{}})),/include/);
    assert.throws(()=>importColorscheme(JSON.stringify({version:1,themes:[]})),/IDE 설정 파일/);
    assert.throws(()=>importColorscheme(JSON.stringify({hello:1})),/tokenColors/);
    assert.throws(()=>importColorscheme(JSON.stringify({colors:{},tokenColors:[{scope:'markup.heading',settings:{foreground:'#ffffff'}}]})),/대응되는 구문 규칙이 없습니다/);
  });
  test('validateEditorTheme rejects unsafe tokens and colours',()=>{
    const base={base:'vs',inherit:true,rules:[],colors:{}};
    assert.deepEqual(validateEditorTheme(base),base);
    for(const bad of [{...base,base:'solarized'},{...base,inherit:'yes'},{...base,rules:[{token:'a b'}]},{...base,rules:[{token:'x',foreground:'#12345678'}]},{...base,colors:{'bad key!':'#000000'}},{...base,colors:{'editor.background':'red'}},{...base,colors:[]}])
      assert.throws(()=>validateEditorTheme(bad));
  });
  test('static Vim colorschemes with links, light background and styles',()=>{
    const vim=['" comment','hi clear','syntax reset','let g:colors_name = "tiny"','set background=light','hi Normal guifg=#111111 guibg=#fefefe','hi Comment guifg=#00aa00 gui=italic','hi link Statement Comment','hi Visual guibg=#ccccdd'].join('\n');
    const t=importColorscheme(vim,'tiny.vim');
    assert.equal(t.name,'tiny');assert.equal(t.base,'light');assert.equal(t.colors.background,'#fefefe');assert.equal(t.colors.comment,'#00aa00');assert.equal(t.colors.keyword,'#00aa00','link resolved');
    assert.equal(t.editor.rules.find(r=>r.token==='comment').fontStyle,'italic');assert.equal(t.editor.colors['editor.selectionBackground'],'#ccccdd');
  });
  test('dynamic or malformed Vim scripts are refused',()=>{
    assert.throws(()=>vimColorscheme('if has("gui_running")\nendif\nhi Normal guifg=#000000 guibg=#ffffff'),/동적 스크립트/);
    assert.throws(()=>vimColorscheme('hi Normal guifg=#000000 guibg=#ffffff evil=1'),/해석할 수 없습니다/);
    assert.throws(()=>vimColorscheme('hi Normal guifg=red guibg=#ffffff'),/#RRGGBB/);
    assert.throws(()=>vimColorscheme('hi Comment guifg=#000000'),/Normal 그룹/);
    assert.throws(()=>vimColorscheme('hi Normal guifg=#000000 guibg=#ffffff\nhi link Statement Type\nhi link Type Statement'),/순환 참조/);
  });
  test('pinned upstream sources reproduce the bundled Jellybeans and GitHub Light themes',()=>{
    const vim=readFileSync(new URL('../../src/themes/jellybeans/jellybeans.vim',import.meta.url));
    assert.equal(createHash('sha256').update(vim).digest('hex'),JELLYBEAN.source.sha256,'jellybeans.vim unchanged');
    assert.deepEqual(vimColorscheme(vim.toString(),{jellybeans:true}).editor,JELLYBEAN.editor);
    const json=readFileSync(new URL('../../src/themes/github-light/light-default.json',import.meta.url));
    assert.equal(createHash('sha256').update(json).digest('hex'),GITHUB_LIGHT.source.sha256,'light-default.json unchanged');
  });
  test('editorTheme reflects user colour edits but keeps untouched imported rules',()=>{
    const jb=structuredClone(JELLYBEAN);let t=editorTheme(jb);assert.equal(t.base,'vs-dark');assert.deepEqual(t.rules,JELLYBEAN.editor.rules);
    jb.colors.keyword='#ff0000';t=editorTheme(jb);assert.equal(t.rules.filter(r=>r.token==='keyword').length,1);assert.equal(t.rules.find(r=>r.token==='keyword').foreground,'ff0000');
    const plain=editorTheme(LIGHT);assert.equal(plain.base,'vs');assert.equal(plain.colors['editor.background'],LIGHT.colors.background);assert.ok(plain.rules.some(r=>r.token==='keyword.directive'));
  });
});
