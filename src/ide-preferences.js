import jellybeans from './themes/jellybeans/theme.js';
import githubLight from './themes/github-light/theme.js';
import {validateEditorTheme} from './colorscheme.js';
export const PREFERENCES_KEY='stm32lab.idePreferences.v1';
export const COLOR_LABELS={background:'코드 배경',foreground:'기본 글자',panel:'패널 배경',chrome:'도구 모음',border:'구분선',muted:'보조 글자',accent:'강조 / 포커스',selection:'선택 영역',line:'현재 줄',search:'검색 결과',keyword:'키워드',type:'자료형',string:'문자열',number:'숫자 / 상수',comment:'주석',identifier:'식별자',function:'함수',debug:'디버그 현재 줄',error:'오류',warning:'경고',net:'회로 연결망 강조'};
export const JELLYBEAN=jellybeans;
const LEGACY_JELLYBEAN={background:'#151515',foreground:'#e8e8d3',panel:'#1f1f1f',chrome:'#262626',border:'#403c41',muted:'#a0a8b0',accent:'#fad07a',selection:'#403c41',line:'#202020',search:'#5c3446',keyword:'#8197bf',type:'#ffb964',string:'#99ad6a',number:'#cf6a4c',comment:'#888888',identifier:'#c6b6ee',function:'#fad07a',debug:'#43512d',error:'#e07070',warning:'#fad07a',net:'#e8b843'};
export const LIGHT={id:'stm-light',name:'STM Light',base:'light',colors:{background:'#fcfdfc',foreground:'#1a2b25',panel:'#f3f7f5',chrome:'#e7efec',border:'#c5d4cc',muted:'#4d6358',accent:'#126b4c',selection:'#cde7da',line:'#edf4f0',search:'#f5dc9c',keyword:'#7e4a9e',type:'#9c4526',string:'#7a5d1c',number:'#1d6587',comment:'#4f7359',identifier:'#2f526b',function:'#654480',debug:'#e8e5a7',error:'#a82c2c',warning:'#7a5710',net:'#b88210'}};
export const BUILTIN_THEMES=[JELLYBEAN,githubLight,LIGHT];
// Fingerprint of the old conversion of this exact pinned GitHub Light source.
// Comparing the full editor payload avoids replacing imported/customized rules.
const LEGACY_GITHUB_LIGHT_COLORS={background:'#ffffff',foreground:'#1f2328',panel:'#ffffff',chrome:'#f6f8fa',border:'#cbd8ce',muted:'#8c959f',accent:'#0969da',selection:'#cbe8d9',line:'#eaeef2',search:'#bf8700',keyword:'#cf222e',type:'#116329',string:'#0a3069',number:'#0a3069',comment:'#6e7781',identifier:'#1f2328',function:'#8250df',debug:'#d4a72c',error:'#e07070',warning:'#fad07a',net:'#e8b843'};
const LEGACY_GITHUB_LIGHT_RULES=[['comment','6e7781'],['delimiter','6e7781'],['string','6e7781'],['number','cf222e'],['number','cf222e'],['number','0550ae'],['identifier','0550ae'],['identifier','0550ae'],['identifier','0550ae'],['identifier','1f2328'],['function','8250df'],['keyword','cf222e'],['type','cf222e'],['type','cf222e'],['type','1f2328'],['type','1f2328'],['type','1f2328'],['string','0a3069'],['identifier','953800'],['identifier','1f2328'],['string','0a3069'],['string','0a3069'],['type','116329'],['delimiter','953800'],['delimiter','82071e','ffebe9'],['delimiter','cf222e'],['delimiter','116329','dafbe1'],['delimiter','953800','ffd8b5'],['number','0a3069'],['string','0a3069']].map(([token,foreground,background])=>({token,foreground,...(background?{background}:{})}));
const sameFields=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(key=>a[key]===b[key]);
function migrateGithubLight(theme){
 const editor=theme.editor;
 if(theme.id!=='github-light'||!sameFields(theme.source,githubLight.source)||!sameFields(theme.originalColors,LEGACY_GITHUB_LIGHT_COLORS)||!editor||editor.base!=='vs'||editor.inherit!==true||!sameFields(editor.colors,githubLight.editor.colors)||editor.rules.length!==LEGACY_GITHUB_LIGHT_RULES.length||!editor.rules.every((rule,i)=>sameFields(rule,LEGACY_GITHUB_LIGHT_RULES[i])))return theme;
 const next={...theme,editor:structuredClone(githubLight.editor),originalColors:{...githubLight.originalColors},colors:{...githubLight.colors}};
 for(const key of Object.keys(COLOR_LABELS))if(theme.colors[key]!==theme.originalColors[key])next.colors[key]=theme.colors[key];
 return next;
}
export const EDITOR_COLOR_LABELS={background:'코드 배경',foreground:'코드 글자',panel:'코드 팝업 배경',border:'코드 팝업 테두리',muted:'줄 번호',accent:'커서',selection:'선택 영역',line:'현재 줄',search:'검색 결과',keyword:'키워드',type:'자료형',string:'문자열',number:'숫자 / 상수',comment:'주석',identifier:'식별자',function:'함수',debug:'디버그 현재 줄',error:'코드 오류',warning:'코드 경고'};
// Windows/Fluent neutral surfaces and mode-specific blue accents. Editor themes stay independent.
// VS Code "Modern" inspired neutral surfaces. Editor colorschemes stay independent.
const LIGHT_UI={...LIGHT.colors,background:'#ffffff',foreground:'#1f1f1f',panel:'#f8f8f8',chrome:'#f8f8f8',border:'#e5e5e5',muted:'#616161',accent:'#005fb8',selection:'#dcebfa',line:'#f2f2f2',error:'#b3261e',warning:'#835000',string:'#216b2c',net:'#956500',input:'#c8c8c8',hover:'#ececec',activity:'#f8f8f8',status:'#f8f8f8',statusRun:'#005fb8',onAccent:'#ffffff',button:'#005fb8',selectionText:'#1f1f1f'};
const DARK_UI={...LEGACY_JELLYBEAN,background:'#1f1f1f',foreground:'#cccccc',panel:'#181818',chrome:'#181818',border:'#2b2b2b',muted:'#9d9d9d',accent:'#3794ff',selection:'#04395e',line:'#2a2d2e',error:'#f48771',warning:'#cca700',string:'#89d185',net:'#e8b843',input:'#3c3c3c',hover:'#2a2d2e',activity:'#181818',status:'#181818',statusRun:'#0078d4',onAccent:'#ffffff',button:'#0078d4',selectionText:'#ffffff'};
export const systemDark=()=>globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches??true;
export const appearanceMode=(preferences,dark=systemDark())=>preferences.appearance==='system'?(dark?'dark':'light'):preferences.appearance||'dark';
export function defaultPreferences(){return {version:2,appearance:'system',theme:'jellybean',darkTheme:'jellybean',lightTheme:'github-light',fontSize:14,fontFamily:"Consolas, 'Malgun Gothic', monospace",lineHeight:22,uiFontSize:13,terminalFontSize:12,tabSize:4,wordWrap:false,minimap:false,lineNumbers:true,bracketColors:true,formatOnType:true,formatOnSave:false,themes:structuredClone(BUILTIN_THEMES)};}
export function validatePreferences(value){
 if(!value||![1,2].includes(value.version)||!Array.isArray(value.themes)||value.themes.length<1||value.themes.length>30)throw new Error('IDE 설정 파일 형식을 확인하세요.');
 const result=defaultPreferences(),number=(key,min,max)=>{const n=value[key]??result[key];if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${key}: ${min}~${max} 범위의 정수를 입력하세요.`);result[key]=n;};
 number('fontSize',9,40);number('lineHeight',12,64);number('uiFontSize',11,20);number('terminalFontSize',9,32);number('tabSize',1,8);
 if(result.lineHeight<result.fontSize)throw new Error('줄 높이는 코드 글꼴 크기 이상이어야 합니다.');
 const family=value.fontFamily??result.fontFamily;if(typeof family!=='string'||family.length>180||!family.trim()||!/^[\p{L}\p{N}\s,'"._-]+$/u.test(family))throw new Error('글꼴 이름을 확인하세요.');result.fontFamily=family;
 for(const key of ['wordWrap','minimap','lineNumbers','bracketColors','formatOnType','formatOnSave']){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error('IDE 표시 옵션을 확인하세요.');result[key]=value[key]??result[key];}
 const ids=new Set();result.themes=value.themes.map(theme=>{
  if(!theme||typeof theme.id!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(theme.id)||ids.has(theme.id)||typeof theme.name!=='string'||!theme.name.trim()||theme.name.length>50||!['dark','light'].includes(theme.base)||!theme.colors)throw new Error('색상 테마 이름과 ID를 확인하세요.');
  ids.add(theme.id);const colors={};for(const key of Object.keys(COLOR_LABELS)){const color=theme.colors[key];if(typeof color!=='string'||!/^#[a-f\d]{6}$/i.test(color))throw new Error(`${COLOR_LABELS[key]}: #RRGGBB 색상을 입력하세요.`);colors[key]=color.toLowerCase();}
  const result={id:theme.id,name:theme.name.trim(),base:theme.base,colors};
  if(theme.editor!==undefined){result.editor=validateEditorTheme(theme.editor);if(!theme.originalColors||Object.keys(COLOR_LABELS).some(key=>!/^#[a-f\d]{6}$/i.test(theme.originalColors[key]||'')))throw new Error('원본 테마 색상 정보를 확인하세요.');result.originalColors=Object.fromEntries(Object.keys(COLOR_LABELS).map(key=>[key,theme.originalColors[key].toLowerCase()]));}
  if(theme.source!==undefined){const s=theme.source;if(!s||typeof s.repository!=='string'||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(s.repository)||!/^\w{40}$/.test(s.commit)||!/^\w{64}$/.test(s.sha256)||typeof s.file!=='string'||s.file.length>150||typeof s.license!=='string'||s.license.length>60)throw new Error('테마 출처 정보를 확인하세요.');result.source={repository:s.repository,commit:s.commit,sha256:s.sha256,file:s.file,license:s.license};}
  if(theme.importNote!==undefined){if(typeof theme.importNote!=='string'||theme.importNote.length>500)throw new Error('테마 안내 문구가 너무 깁니다.');result.importNote=theme.importNote;}
  if(theme.id==='jellybean'&&!theme.editor){const updated=structuredClone(JELLYBEAN);for(const key of Object.keys(COLOR_LABELS))if(colors[key]!==LEGACY_JELLYBEAN[key])updated.colors[key]=colors[key];updated.base=theme.base;return updated;}
  return migrateGithubLight(result);
 });
 // Built-ins always remain available, even when importing a custom-theme-only file.
 for(const theme of BUILTIN_THEMES)if(!ids.has(theme.id)){result.themes.push(structuredClone(theme));ids.add(theme.id);}
 if(result.themes.length>30)throw new Error('기본 테마를 포함해 색상 테마는 30개까지 저장할 수 있습니다.');
 if(typeof value.theme!=='string'||!ids.has(value.theme))throw new Error('선택한 색상 테마가 없습니다.');result.theme=value.theme;
 if(value.version===2){if(!['system','dark','light'].includes(value.appearance))throw new Error('화면 테마는 System, Dark, White 중에서 선택하세요.');result.appearance=value.appearance;for(const key of ['darkTheme','lightTheme']){if(!ids.has(value[key]))throw new Error('화면별 코드 테마가 없습니다.');result[key]=value[key];}}
 else {const previous=result.themes.find(t=>t.id===value.theme);result[previous.base+'Theme']=value.theme;if(value.tabSize===2)result.tabSize=4;}
 return result;
}
export function loadPreferences(storage=globalThis.localStorage){try{const text=storage?.getItem(PREFERENCES_KEY);return text?validatePreferences(JSON.parse(text)):defaultPreferences();}catch{return defaultPreferences();}}
export function selectedTheme(preferences,mode=appearanceMode(preferences)){return preferences.themes.find(theme=>theme.id===(preferences[mode+'Theme']??preferences.theme));}
export function withEditorTheme(preferences,id){return {...preferences,theme:id,[appearanceMode(preferences)+'Theme']:id};}
export function applyAppearance(preferences){
 const mode=appearanceMode(preferences),theme=selectedTheme(preferences,mode),root=document.documentElement;root.dataset.ideTheme=mode;root.dataset.appearance=preferences.appearance;root.dataset.colorscheme=theme.id;root.style.colorScheme=mode;
 for(const [key,color]of Object.entries(mode==='dark'?DARK_UI:LIGHT_UI))root.style.setProperty('--ide-'+key,color);
 for(const [key,color]of Object.entries(theme.colors))root.style.setProperty('--code-'+key,color);
 root.style.setProperty('--ide-ui-size',preferences.uiFontSize+'px');root.style.setProperty('--ide-terminal-size',preferences.terminalFontSize+'px');root.style.setProperty('--ide-font',preferences.fontFamily);
}
