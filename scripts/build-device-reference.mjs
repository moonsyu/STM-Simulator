import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../src/part-library.js';
import {terminalKeys,terminalLabel} from '../src/components.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const data=JSON.parse(await fs.readFile(path.join(root,'docs/device-visual-references.json'),'utf8'));
const variants=new Map(data.variants.map(v=>[v.id,v]));
assert.equal(data.implemented_parts.length,PART_LIBRARY.length);
assert.equal(variants.size,data.variants.length);
for(const part of PART_LIBRARY){
  const record=data.implemented_parts.find(p=>p.type===part.type);assert.ok(record,part.type);
  assert.deepEqual(record.pins,terminalKeys(part).map(k=>terminalLabel(part,k)));
  assert.ok(record.reference_variant_ids.length);
  for(const id of record.reference_variant_ids)assert.ok(variants.has(id),id);
}
for(const row of data.variants){
  if(row.pin_count!==null)assert.equal(row.pin_count,row.pins.length,row.id);
  for(const id of [...row.source_ids,row.visual_source_id]){
    assert.ok(data.sources[id],id);assert.equal(new URL(data.sources[id].url).protocol,'https:');
  }
}
const md=s=>String(s??'').replaceAll('|',' / ').replaceAll('\n',' ');
const sourceLink=id=>`[${md(data.sources[id].title)}](${data.sources[id].url})`;
const imageLink=row=>{const s=data.sources[row.visual_source_id];return s.image_url?`[사진](${s.image_url})`:`[외형도 원문](${s.url})`;};
const familyName=id=>data.implemented_parts.find(p=>p.type===id)?.name||({board:'NUCLEO-F446RE',external_adc:'외부 ADC',external_dac:'외부 DAC',external_rtc:'외부 RTC',can:'CAN 트랜시버',rs485:'RS485 모듈',sd:'SD 카드',i2s:'디지털 오디오',dcmi:'카메라',dht11:'DHT11',dht22:'DHT22'}[id]||id);
const families=[...new Set(data.variants.map(v=>v.family))];
const lines=[
'# STM32 장치 외형과 핀 구성 자료집','',
`확인일: ${data.checked_on}. 기준 소스: \`${data.repository_commit.slice(0,7)}\`. 현재 부품 라이브러리 **${data.implemented_parts.length}종 전체**, 외형·핀 구성 **${data.variants.length}항목**, MCU 내부 주변장치 **${data.internal_peripherals.length}분류**를 연결한다.`,
'','[사진과 핀 수로 찾아보기](device-reference-gallery.html) · [구조화된 원본 목록](device-visual-references.json)','',
'## 핀을 세는 기준','',
'핀 수는 선정한 제품의 주요 외부 연결 접점 수다. 릴레이 제어 헤더와 접점, 모터 드라이버 제어와 모터 출력처럼 역할이 다른 단자는 나눠 기록한다. 중복 I²C 커넥터·점퍼·지지 탭은 별도 표기한다. 빵판은 구멍 수, 보드는 MCU 패키지 핀과 헤더 접점을 구분한다. 핀 목록은 신호 구성이고, 실제 좌우 순서는 해당 모델의 도면·실크 기준이다.',
'','이 목록은 아래 제조사 모델을 구분한 자료다. 같은 이름의 모든 시판 리비전을 하나의 핀맵으로 묶지 않는다. 사진은 원본 URL로 표시하며 애플리케이션 배포 이미지로 포함하지 않는다.','',
'## 현재 구현된 부품 35종','',
'| 앱 타입 | 부품 | 현재 앱 단자 | 실제 외형과 변형 |','|---|---|---|---|',
...data.implemented_parts.map(p=>`| \`${p.type}\` | ${md(p.name)} | ${p.type==='breadboard'?'400홀, 외부 핀 없음':`${p.pins.length}단자: ${md(p.pins.join(', '))}`} | ${p.reference_variant_ids.map(id=>`[${md(variants.get(id).name)}](#${id})`).join('<br>')} |`),
'','## 모델별 사진과 단자',''
];
for(const family of families){
 lines.push(`### ${familyName(family)}`,'');
 for(const row of data.variants.filter(v=>v.family===family)){
  lines.push(`<a id="${row.id}"></a>`,`#### ${row.name}`,'',
   `- 외형: ${row.appearance} ${imageLink(row)}`,
   `- 주요 핀: ${row.pin_count===null?'보드·기구 또는 회로도 별도 확인':`${row.pin_count}접점 — ${row.pins.join(', ')}`}`,
   `- 연결 방식: ${row.interface}`);
  if(row.additional_contacts)lines.push(`- 별도 접점: ${row.additional_contacts}`);
  if(row.notes)lines.push(`- 구분점: ${row.notes}`);
  lines.push(`- 근거: ${row.source_ids.map(sourceLink).join(' · ')}`,'');
 }
}
lines.push('## MCU 내부 주변장치와 외부 부품의 관계','',
 'TIM·ADC·DAC·DMA·RCC 등은 MCU 안에 있는 기능 블록으로, 각각 독립적인 실물 부품 외형이 있는 것은 아니다. 외부 ADC·DAC·RTC 모듈 사진은 해당 내부 기능의 사진으로 사용하지 않는다. F446 시리즈 기능과 F446RE 64핀 패키지에서 실제 연결 가능한 신호는 데이터시트·AF 표·보드 회로도로 대조한다. '+sourceLink('mcu')+' · '+sourceLink('mcu-datasheet'),'',
 '| 내부 기능 | 현재 구현 범위 | 외형·배선 확인 사항 |','|---|---|---|',
 ...data.internal_peripherals.map(p=>`| ${md(p.name)} | ${md(p.implementation)} | ${md(p.appearance_note)} |`),'',
 '## 추가 구현에서 먼저 분리할 모델','',
 '- 2핀 소자와 전원·신호를 따로 받는 3핀 모듈. 3핀에 NC가 있는 부저 모듈도 별도로 구분한다.',
 '- LCD 병렬 16핀과 I²C 4핀, OLED 4/7/8핀, TFT 백라이트 단자 유무.',
 '- 공통 양극·공통 음극 RGB 4핀과 주소지정 LED의 DIN/DOUT 4핀, TM1637 전용 통신과 I²C.',
 '- 현재 MPU6050 4단자와 실제 8핀 보드, 현재 메모리의 단순화된 4/6단자와 실제 EEPROM 패키지.',
 '- 릴레이 제어3+접점3, L298N 주요 외부13+점퍼, 스테퍼 모터4/5선과 드라이버 입력4.',
 '',
 '단일 핀 수로 부품을 식별하지 않고 모델명·커넥터 묶음·통신 방식·공통극을 함께 사용한다.',''
);
await fs.writeFile(path.join(root,'docs/DEVICE-VISUAL-REFERENCES.md'),lines.join('\n'));

const embedded=JSON.stringify(data).replaceAll('<','\\u003c');
const html=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>STM32 장치 외형과 핀 구성 자료집</title>
<style>
:root{--ink:#172b40;--muted:#4e6377;--paper:#f3f6fa;--line:#c9d5df;--blue:#005bbb;--white:#fff;--amber:#8a4b10;--green:#246547;font-family:'Malgun Gothic','Segoe UI',sans-serif;color:var(--ink);background:var(--paper);font-size:15px}*{box-sizing:border-box}body{margin:0}a{color:var(--blue);text-underline-offset:3px}button,input,select{font:inherit}button,select{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #d68d21;outline-offset:3px}header{background:var(--white);border-bottom:1px solid var(--line);padding:28px max(24px,calc((100vw - 1480px)/2)) 24px}h1{word-break:keep-all;font-size:clamp(24px,3vw,36px);line-height:1.35;letter-spacing:-1px;margin:0 0 12px}header p{max-width:78ch;color:var(--muted);line-height:1.8;margin:8px 0}.totals{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:16px}.totals strong{font-size:23px;color:var(--ink);padding-right:5px}.filters-toggle{display:none}.layout{max-width:1528px;margin:auto;display:grid;grid-template-columns:235px minmax(0,1fr);gap:25px;padding:24px}aside{position:sticky;top:20px;align-self:start;background:var(--white);padding:20px;border:1px solid var(--line)}label{display:block;font-weight:700;font-size:13px;margin:0 0 7px}input,select{display:block;width:100%;min-height:42px;border:1px solid #859caf;border-radius:4px;background:white;padding:8px 10px;margin-bottom:19px;color:var(--ink)}.hint{font-size:12px;color:var(--muted);line-height:1.7}.reset{background:white;border:1px solid #859caf;border-radius:4px;padding:9px 12px;width:100%;color:var(--ink)}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 15px}.toolbar p{margin:0;color:var(--muted)}.view{display:flex;gap:6px}.view button{background:white;color:var(--ink);border:1px solid #859caf;padding:8px 13px;border-radius:4px}.view button[aria-pressed=true]{background:var(--ink);color:white}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.device{background:white;border:1px solid var(--line);min-width:0;overflow:hidden}.photo{height:205px;display:flex;align-items:center;justify-content:center;background:white;position:relative;border-bottom:1px solid #e7edf2}.photo a{display:flex;align-items:center;justify-content:center;width:100%;height:100%}.photo img{width:100%;height:100%;object-fit:contain;padding:17px}.placeholder{padding:24px;text-align:center;color:var(--muted);line-height:1.8;font-size:14px}.body{padding:17px}.family{color:var(--muted);font-size:12px;margin:0 0 7px}.body h2{font-size:17px;line-height:1.6;margin:0 0 12px;letter-spacing:-.4px}.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:13px}.badge{background:#edf4fc;color:#164a7a;border:1px solid #c0d4e7;padding:3px 7px;border-radius:3px;font-size:11px}.badge.existing{color:var(--green);background:#edf7f0;border-color:#c5dbcc}.pins{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 12px}.pin{background:#f3f6f8;border:1px solid #d5dfe7;border-radius:3px;padding:3px 6px;font-family:'Consolas',monospace;font-size:11px;color:#263d4f}.body p{font-size:12px;line-height:1.75;margin:10px 0;color:var(--muted)}details{border-top:1px solid #e2e9ef;padding-top:12px;margin-top:12px}summary{font-size:12px;font-weight:700;cursor:pointer}.sources{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px;font-size:12px}.empty{padding:60px 15px;background:white;border:1px solid var(--line);text-align:center}.tablewrap{overflow:auto;background:white;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #dbe4ec;line-height:1.75}th{background:#eaf0f6;white-space:nowrap}.tablewrap td:nth-child(1){min-width:180px}.tablewrap td:nth-child(3){min-width:220px}.internal{margin:30px 0 12px;padding:22px;background:white;border:1px solid var(--line)}.internal h2{font-size:21px;margin:0 0 12px}.internal p{line-height:1.8;color:var(--muted);font-size:13px}.internal details{padding-top:15px}.internal summary{font-size:14px}.internal table{margin-top:15px}.internal td:first-child{min-width:160px}footer{padding:20px 24px 35px;max-width:1528px;margin:auto;color:var(--muted);font-size:12px;line-height:1.8}[hidden]{display:none!important}@media(max-width:1200px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:220px minmax(0,1fr)}}@media(max-width:720px){.filters-toggle{display:block;width:100%;padding:11px;border:1px solid #859caf;background:white;color:var(--ink);border-radius:4px;margin-bottom:14px}body:not(.filters-open) aside{display:none}header{padding:22px 18px}.layout{display:block;padding:16px}aside{position:static;display:grid;grid-template-columns:1fr 1fr;gap:0 12px;margin-bottom:20px;padding:15px}aside .field:first-child{grid-column:1/-1}.hint,.reset{grid-column:1/-1}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.photo{height:155px}.body{padding:12px}.body h2{font-size:15px}.toolbar{flex-wrap:wrap}.totals{gap:9px 18px}.totals strong{font-size:20px}}@media(max-width:420px){.grid{grid-template-columns:1fr}.photo{height:205px}}@media print{aside,.view{display:none}.layout{display:block}.grid{grid-template-columns:repeat(2,1fr)}.device{break-inside:avoid}.internal{break-before:page}}
</style></head><body>
<header><h1>STM32 장치 외형과 핀 구성 자료집</h1><p>사진, 핀 수, 인터페이스를 함께 비교하세요. 같은 장치명과 핀 수라도 공통극·배선·제어 방식이 다를 수 있습니다.</p><div class="totals"><span><strong>${data.implemented_parts.length}</strong>현재 부품 종류</span><span><strong>${data.variants.length}</strong>외형과 핀 구성</span><span><strong>${data.internal_peripherals.length}</strong>MCU 내부 기능 분류</span></div></header>
<div class="layout"><button class="filters-toggle" id="filters-toggle" aria-expanded="false" aria-controls="device-filters">장치 검색·필터 열기</button><aside id="device-filters" aria-label="장치 필터"><div class="field"><label for="query">장치·모델·신호 검색</label><input id="query" type="search" placeholder="예: LCD, 3핀, MPU6050"></div><div class="field"><label for="pins">주요 핀 수</label><select id="pins"><option value="">전체 핀 수</option value="other">보드·별도 확인</option></select></div><div class="field"><label for="family">장치 종류</label><select id="family"><option value="">전체 장치</option></select></div><div class="field"><label for="scope">자료 범위</label><select id="scope"><option value="">전체 항목</option><option value="existing">현재 35종 관련 외형</option><option value="future">추가 연결 예시</option></select></div><button class="reset" id="reset">필터 초기화</button><p class="hint">핀 목록은 신호 구성입니다. 실제 좌우 순서는 원문 핀맵·실크를 확인하세요. 중복 커넥터와 점퍼는 상세에 별도 표시합니다.</p><p class="hint">사진은 원본 사이트에서 표시합니다. 인터넷 연결이 필요하며, 사진이 열리지 않으면 출처 링크로 확인할 수 있습니다.</p></aside>
<main><div class="toolbar"><p id="count" aria-live="polite"></p><div class="view" aria-label="보기 방식"><button id="photo-view" aria-pressed="true">사진 보기</button><button id="table-view" aria-pressed="false">핀 표 보기</button></div></div><div id="results" class="grid"></div><div id="empty" class="empty" hidden>조건에 맞는 장치가 없습니다. 검색어나 핀 수를 바꿔 주세요.</div><section class="internal"><h2>현재 앱 단자와 실물 핀의 차이</h2><p>현재 35종은 모두 자료에 포함되어 있습니다. 각 변형의 사진이 해당 앱 부품과 완전히 같은 모델이라는 뜻은 아닙니다. 예를 들어 앱의 MPU6050은 4단자, TFT는 7단자, L298N은 주요 외부 13단자를 표현합니다.</p><details><summary>현재 부품 35종의 실제 앱 단자 보기</summary><div class="tablewrap"><table id="inventory"></table></div></details></section><section class="internal"><h2>MCU 내부 기능은 별도 부품 외형이 없습니다</h2><p>TIM·ADC·DAC·DMA 같은 내부 블록과 연결하는 외부 모듈을 구분합니다. 외부 ADC·DAC·RTC 사진은 MCU 안에 있는 기능의 사진이 아닙니다. F446RE의 64핀 패키지에서 가능한 신호 조합은 데이터시트와 보드 회로도로 대조해야 합니다.</p><details><summary>내부 주변장치 24분류와 현재 구현 범위</summary><div class="tablewrap"><table id="internal"></table></div></details></section></main></div>
<footer>확인일 ${data.checked_on} · 기준 커밋 ${data.repository_commit.slice(0,7)} · <a href="DEVICE-VISUAL-REFERENCES.md">조사 문서</a> · <a href="device-visual-references.json">JSON 원본</a><br>사진과 도면은 각 원문 제공자의 자료입니다. 기술 근거와 사진 출처가 다른 항목은 각각 링크로 표시합니다.</footer>
<script id="reference-data" type="application/json">${embedded}</script><script>
const data=JSON.parse(document.getElementById('reference-data').textContent),$=id=>document.getElementById(id),existing=new Map(data.implemented_parts.map(p=>[p.type,p])),names=${JSON.stringify(Object.fromEntries(families.map(f=>[f,familyName(f)]))).replaceAll('<','\\u003c')};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let view='photo';
const anchor=(url,label)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
for(const n of [...new Set(data.variants.map(v=>v.pin_count).filter(n=>n!==null))].sort((a,b)=>a-b))$('pins').insertAdjacentHTML('beforeend','<option value="'+n+'">'+n+'핀 / 접점</option>');
for(const [id,name]of Object.entries(names))$('family').insertAdjacentHTML('beforeend','<option value="'+id+'">'+esc(name)+'</option>');
function sourceLinks(v){const s=data.sources[v.visual_source_id];return v.source_ids.map((id,i)=>anchor(data.sources[id].url,i?'추가 자료':'핀·제품 원문')).join(' ')+(s.image_page_url?' '+anchor(s.image_page_url,'사진 출처'):'');}
function photo(v){const s=data.sources[v.visual_source_id];if(!s.image_url)return '<div class="photo"><div class="placeholder">'+esc(v.pin_count||'')+'핀 외형은 제조사 도면에서 확인<br>'+anchor(s.url,'외형도·제품 원문 열기')+'</div></div>';return '<div class="photo"><a href="'+esc(s.image_page_url||s.url)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(s.image_url)+'" alt="'+esc(v.name)+' 실제 외형 참고" loading="lazy" referrerpolicy="no-referrer"></a></div>';}
function render(){const q=$('query').value.normalize('NFKC').toLowerCase().replace(/\\s/g,''),pin=$('pins').value,family=$('family').value,scope=$('scope').value;const rows=data.variants.filter(v=>{const text=[v.name,v.family,names[v.family],v.interface,v.appearance,v.notes,v.pin_count===null?'':v.pin_count+'핀',...v.pins].join(' ').normalize('NFKC').toLowerCase().replace(/\\s/g,'');return(!q||text.includes(q))&&(!pin||(pin==='other'?v.pin_count===null:v.pin_count===Number(pin)))&&(!family||v.family===family)&&(!scope||(scope==='existing'?existing.has(v.family):!existing.has(v.family)));});$('count').textContent=rows.length+'개 표시 / 전체 '+data.variants.length+'개';$('empty').hidden=!!rows.length;$('results').className=view==='photo'?'grid':'tablewrap';
if(view==='photo')$('results').innerHTML=rows.map(v=>'<article class="device" data-id="'+v.id+'">'+photo(v)+'<div class="body"><p class="family">'+esc(names[v.family])+'</p><h2>'+esc(v.name)+'</h2><div class="badges"><span class="badge">'+(v.pin_count===null?'보드·별도 확인':v.pin_count+'접점')+'</span><span class="badge">'+esc(v.interface)+'</span><span class="badge '+(existing.has(v.family)?'existing':'')+'">'+(existing.has(v.family)?'현재 부품 관련 변형':'추가 연결 예시')+'</span></div><div class="pins">'+v.pins.map(p=>'<span class="pin">'+esc(p)+'</span>').join('')+'</div><p>'+esc(v.appearance)+'</p><details><summary>핀 구성과 현재 구현의 차이</summary><p>'+esc(v.notes||v.pin_order)+'</p>'+(v.additional_contacts?'<p>'+esc(v.additional_contacts)+'</p>':'')+(existing.has(v.family)?'<p>현재 앱: '+existing.get(v.family).pins.length+'단자 '+esc(existing.get(v.family).pins.join(', '))+'</p>':'')+'<p>'+esc(v.pin_order)+'</p></details><div class="sources">'+sourceLinks(v)+'</div></div></article>').join('');
else $('results').innerHTML='<table><thead><tr><th>모델</th><th>주요 접점</th><th>신호 구성</th><th>별도 접점과 구분점</th><th>원문</th></tr></thead><tbody>'+rows.map(v=>'<tr data-id="'+v.id+'"><td>'+esc(v.name)+'</td><td>'+(v.pin_count??'별도')+'</td><td>'+esc(v.pins.join(', '))+'</td><td>'+esc([v.additional_contacts,v.notes].filter(Boolean).join(' '))+'</td><td>'+sourceLinks(v)+'</td></tr>').join('')+'</tbody></table>';
for(const img of $('results').querySelectorAll('img'))img.addEventListener('error',()=>{const box=img.closest('.photo');box.innerHTML='<div class="placeholder">사진을 불러오지 못했습니다.<br>아래 원문 링크에서 확인하세요.</div>';},{once:true});}
for(const id of ['query','pins','family','scope'])$(id).addEventListener(id==='query'?'input':'change',render);
$('filters-toggle').onclick=()=>{const open=document.body.classList.toggle('filters-open');$('filters-toggle').setAttribute('aria-expanded',String(open));$('filters-toggle').textContent=open?'검색·필터 접기':'장치 검색·필터 열기';};
$('reset').onclick=()=>{for(const id of ['query','pins','family','scope'])$(id).value='';render();};
for(const [id,mode]of [['photo-view','photo'],['table-view','table']])$(id).onclick=()=>{view=mode;$('photo-view').setAttribute('aria-pressed',String(mode==='photo'));$('table-view').setAttribute('aria-pressed',String(mode==='table'));render();};
$('inventory').innerHTML='<thead><tr><th>현재 부품</th><th>타입</th><th>현재 앱 단자</th></tr></thead><tbody>'+data.implemented_parts.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.type)+'</td><td>'+esc(p.type==='breadboard'?'400홀':p.pins.length+'단자: '+p.pins.join(', '))+'</td></tr>').join('')+'</tbody>';
$('internal').innerHTML='<thead><tr><th>내부 주변장치</th><th>구현 범위</th><th>외형과 연결</th></tr></thead><tbody>'+data.internal_peripherals.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.implementation)+'</td><td>'+esc(p.appearance_note)+'</td></tr>').join('')+'</tbody>';
render();
</script></body></html>`;
await fs.writeFile(path.join(root,'docs/device-reference-gallery.html'),html);
console.log(JSON.stringify({implemented_types:data.implemented_parts.length,variants:data.variants.length,internal_groups:data.internal_peripherals.length,source_count:Object.keys(data.sources).length,generated:['docs/DEVICE-VISUAL-REFERENCES.md','docs/device-reference-gallery.html']}));
