import jellybeans from './themes/jellybeans/theme.js';
import githubLight from './themes/github-light/theme.js';
import {validateEditorTheme} from './colorscheme.js';
export const PREFERENCES_KEY='stm32lab.idePreferences.v1';
export const COLOR_LABELS={background:'코드 배경',foreground:'기본 글자',panel:'패널 배경',chrome:'도구 모음',border:'구분선',muted:'보조 글자',accent:'강조 / 포커스',selection:'선택 영역',line:'현재 줄',search:'검색 결과',keyword:'키워드',type:'자료형',string:'문자열',number:'숫자 / 상수',comment:'주석',identifier:'식별자',function:'함수',debug:'디버그 현재 줄',error:'오류',warning:'경고',net:'회로 연결망 강조'};
export const JELLYBEAN=jellybeans;
const LEGACY_JELLYBEAN={background:'#151515',foreground:'#e8e8d3',panel:'#1f1f1f',chrome:'#262626',border:'#403c41',muted:'#a0a8b0',accent:'#fad07a',selection:'#403c41',line:'#202020',search:'#5c3446',keyword:'#8197bf',type:'#ffb964',string:'#99ad6a',number:'#cf6a4c',comment:'#888888',identifier:'#c6b6ee',function:'#fad07a',debug:'#43512d',error:'#e07070',warning:'#fad07a',net:'#e8b843'};
export const LIGHT={id:'stm-light',name:'STM Light',base:'light',colors:{background:'#fcfdfc',foreground:'#263e34',panel:'#f5f8f6',chrome:'#eaf0eb',border:'#cbd8ce',muted:'#586d60',accent:'#166e4e',selection:'#cbe8d9',line:'#eff5f1',search:'#f6dda1',keyword:'#8755a1',type:'#a34d2f',string:'#826523',number:'#246d90',comment:'#567b60',identifier:'#385c76',function:'#6f4e89',debug:'#e9e7ae',error:'#ad3737',warning:'#805d15',net:'#c28b14'}};
export const BUILTIN_THEMES=[JELLYBEAN,githubLight,LIGHT];
export const EDITOR_COLOR_LABELS={background:'코드 배경',foreground:'코드 글자',panel:'코드 팝업 배경',border:'코드 팝업 테두리',muted:'줄 번호',accent:'커서',selection:'선택 영역',line:'현재 줄',search:'검색 결과',keyword:'키워드',type:'자료형',string:'문자열',number:'숫자 / 상수',comment:'주석',identifier:'식별자',function:'함수',debug:'디버그 현재 줄',error:'코드 오류',warning:'코드 경고'};
const DARK_UI={...LEGACY_JELLYBEAN,background:'#181b20',foreground:'#e6edf3',panel:'#20252c',chrome:'#262d36',border:'#536171',muted:'#b7c1cc',accent:'#9ecbff',selection:'#364150',error:'#ff9a9a',warning:'#f3ce82',string:'#b7d9a2',net:'#e8b843'};
export const systemDark=()=>globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches??true;
export const appearanceMode=(preferences,dark=systemDark())=>preferences.appearance==='system'?(dark?'dark':'light'):preferences.appearance||'dark';
export function defaultPreferences(){return {version:2,appearance:'system',theme:'jellybean',darkTheme:'jellybean',lightTheme:'github-light',fontSize:14,fontFamily:"Consolas, 'Malgun Gothic', monospace",lineHeight:22,uiFontSize:13,terminalFontSize:12,tabSize:4,wordWrap:false,minimap:false,lineNumbers:true,bracketColors:true,themes:structuredClone(BUILTIN_THEMES)};}
export function validatePreferences(value){
 if(!value||![1,2].includes(value.version)||!Array.isArray(value.themes)||value.themes.length<1||value.themes.length>30)throw new Error('IDE 설정 파일 형식을 확인하세요.');
 const result=defaultPreferences(),number=(key,min,max)=>{const n=value[key]??result[key];if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${key}: ${min}~${max} 범위의 정수를 입력하세요.`);result[key]=n;};
 number('fontSize',9,40);number('lineHeight',12,64);number('uiFontSize',11,20);number('terminalFontSize',9,32);number('tabSize',1,8);
 if(result.lineHeight<result.fontSize)throw new Error('줄 높이는 코드 글꼴 크기 이상이어야 합니다.');
 const family=value.fontFamily??result.fontFamily;if(typeof family!=='string'||family.length>180||!family.trim()||!/^[\p{L}\p{N}\s,'"._-]+$/u.test(family))throw new Error('글꼴 이름을 확인하세요.');result.fontFamily=family;
 for(const key of ['wordWrap','minimap','lineNumbers','bracketColors']){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error('IDE 표시 옵션을 확인하세요.');result[key]=value[key]??result[key];}
 const ids=new Set();result.themes=value.themes.map(theme=>{
  if(!theme||typeof theme.id!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(theme.id)||ids.has(theme.id)||typeof theme.name!=='string'||!theme.name.trim()||theme.name.length>50||!['dark','light'].includes(theme.base)||!theme.colors)throw new Error('색상 테마 이름과 ID를 확인하세요.');
  ids.add(theme.id);const colors={};for(const key of Object.keys(COLOR_LABELS)){const color=theme.colors[key];if(typeof color!=='string'||!/^#[a-f\d]{6}$/i.test(color))throw new Error(`${COLOR_LABELS[key]}: #RRGGBB 색상을 입력하세요.`);colors[key]=color.toLowerCase();}
  const result={id:theme.id,name:theme.name.trim(),base:theme.base,colors};
  if(theme.editor!==undefined){result.editor=validateEditorTheme(theme.editor);if(!theme.originalColors||Object.keys(COLOR_LABELS).some(key=>!/^#[a-f\d]{6}$/i.test(theme.originalColors[key]||'')))throw new Error('원본 테마 색상 정보를 확인하세요.');result.originalColors=Object.fromEntries(Object.keys(COLOR_LABELS).map(key=>[key,theme.originalColors[key].toLowerCase()]));}
  if(theme.source!==undefined){const s=theme.source;if(!s||typeof s.repository!=='string'||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(s.repository)||!/^\w{40}$/.test(s.commit)||!/^\w{64}$/.test(s.sha256)||typeof s.file!=='string'||s.file.length>150||typeof s.license!=='string'||s.license.length>60)throw new Error('테마 출처 정보를 확인하세요.');result.source={repository:s.repository,commit:s.commit,sha256:s.sha256,file:s.file,license:s.license};}
  if(theme.importNote!==undefined){if(typeof theme.importNote!=='string'||theme.importNote.length>500)throw new Error('테마 안내 문구가 너무 깁니다.');result.importNote=theme.importNote;}
  if(theme.id==='jellybean'&&!theme.editor){const updated=structuredClone(JELLYBEAN);for(const key of Object.keys(COLOR_LABELS))if(colors[key]!==LEGACY_JELLYBEAN[key])updated.colors[key]=colors[key];updated.base=theme.base;return updated;}
  return result;
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
 for(const [key,color]of Object.entries(mode==='dark'?DARK_UI:LIGHT.colors))root.style.setProperty('--ide-'+key,color);
 for(const [key,color]of Object.entries(theme.colors))root.style.setProperty('--code-'+key,color);
 root.style.setProperty('--ide-ui-size',preferences.uiFontSize+'px');root.style.setProperty('--ide-terminal-size',preferences.terminalFontSize+'px');root.style.setProperty('--ide-font',preferences.fontFamily);
}
