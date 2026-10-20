// Inspector sections for media parts: the camera's live frame/pattern/image and the SD card's files.
import {CAMERA_PATTERNS,validCameraImage,decodeImageAsync} from './camera.js';
import {SD_SIZES,SD_DEFAULT_MB,formatImage,listFiles,readFile,writeFile,deleteFile} from './sdcard.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const PATTERN_LABELS={colorbars:'컬러 바',gradient:'움직이는 그라데이션',ball:'움직이는 공',image:'불러온 이미지'};
export const isCamera=p=>p?.catalogVariant==='ov2640-camera';
export const isSdCard=p=>p?.catalogVariant==='sd-storage-board';
export function mediaSection(p,running){
 if(isCamera(p))return `<div class="inspector-card media-card"><label for="camera-pattern">카메라 영상</label><select id="camera-pattern" data-live="true">${CAMERA_PATTERNS.map(v=>`<option value="${v}" ${p.pattern===v?'selected':''}>${PATTERN_LABELS[v]||v}</option>`).join('')}</select><div class="media-actions"><button type="button" class="inspector-action" id="camera-image-pick">이미지 불러오기</button><input id="camera-image-file" type="file" accept="image/png,image/jpeg,image/bmp,image/gif,image/webp" hidden></div><canvas id="camera-preview" width="160" height="120" aria-label="카메라 프레임 미리보기"></canvas><p id="camera-info" class="form-hint">${running?'수신 대기 중':'실행하면 센서가 출력하는 프레임을 표시합니다.'}</p></div>`;
 if(isSdCard(p))return `<div class="inspector-card media-card"><label for="sd-size">SD 카드 (FAT32)</label><div class="media-row"><select id="sd-size" ${running?'disabled':''}>${SD_SIZES.map(v=>`<option value="${v}" ${(p.sizeMB||SD_DEFAULT_MB)===v?'selected':''}>${v} MB</option>`).join('')}</select><button type="button" id="sd-format" class="inspector-action" ${running?'disabled':''}>포맷</button></div><div id="sd-files" class="sd-files" aria-live="polite"></div><div class="media-actions"><button type="button" class="inspector-action" id="sd-upload" ${running?'disabled':''}>파일 넣기</button><input id="sd-upload-file" type="file" hidden></div><p class="form-hint">8.3 형식 파일 이름을 사용합니다. 실행 중 펌웨어가 쓴 파일은 정지하면 프로젝트에 저장됩니다.</p></div>`;
 return '';
}
// Binds handlers after the inspector HTML is rendered.
export function bindMedia(p,{running,checkpoint,changed,getSession,log}){
 const $=id=>document.getElementById(id);
 if(isCamera(p)){
  $('camera-pattern').onchange=e=>{checkpoint();p.pattern=e.target.value;changed();const s=getSession();if(s?.camera?.setPattern)s.camera.setPattern(p.id,p.pattern);};
  $('camera-image-pick').onclick=()=>$('camera-image-file').click();
  $('camera-image-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{
   if(file.size>1100000)throw new Error('이미지는 1 MB 이하로 선택하세요.');
   const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
   if(!validCameraImage(url))throw new Error('PNG·JPEG·BMP·GIF·WebP 이미지(1.5 MB 이하)를 선택하세요.');
   checkpoint();p.image=url;p.pattern='image';changed();await applyCameraImage(p,getSession());log(`${p.name}: 카메라 이미지를 불러왔습니다.`);
  }catch(error){log(error.message,'error');}};
 }
 if(isSdCard(p)){
  renderFiles(p,{running,getSession,checkpoint,changed,log});
  $('sd-size').onchange=e=>{const size=Number(e.target.value);if(!confirmFormat())return renderFiles(p,{running,getSession,checkpoint,changed,log});checkpoint();p.sizeMB=size;p.cardImage=formatImage(size);changed();log(`${p.name}: ${size} MB로 포맷했습니다.`);};
  $('sd-format').onclick=()=>{if(!confirmFormat())return;checkpoint();p.cardImage=formatImage(p.sizeMB||SD_DEFAULT_MB);changed();log(`${p.name}: SD 카드를 포맷했습니다.`);};
  $('sd-upload').onclick=()=>$('sd-upload-file').click();
  $('sd-upload-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{
   if(file.size>1024*1024)throw new Error('파일은 1 MB 이하로 넣을 수 있습니다.');
   const name=shortName(file.name);const bytes=new Uint8Array(await file.arrayBuffer());
   const next=writeFile(p.cardImage||formatImage(p.sizeMB||SD_DEFAULT_MB),'/'+name,bytes);checkpoint();p.cardImage=next;changed();log(`${p.name}: ${name} (${bytes.length} B)를 넣었습니다.`);
  }catch(error){log(error.message,'error');}};
 }
}
function confirmFormat(){return window.confirm?.('SD 카드의 모든 파일을 지웁니다. 계속할까요?')??true;}
function shortName(name){const clean=name.toUpperCase().replace(/[^A-Z0-9._-]/g,'_'),dot=clean.lastIndexOf('.'),base=(dot>0?clean.slice(0,dot):clean).replace(/\./g,'_').slice(0,8)||'FILE',ext=dot>0?clean.slice(dot+1).slice(0,3):'';return ext?`${base}.${ext}`:base;}
function renderFiles(p,{running,getSession,checkpoint,changed,log}){
 const box=document.getElementById('sd-files');if(!box)return;
 const storage=running?getSession()?.storage:null;let files=[];
 try{files=storage?.files?(storage.files(p.id)||[]):listFiles(p.cardImage||formatImage(p.sizeMB||SD_DEFAULT_MB));}catch(error){box.innerHTML=`<p class="form-error">${esc(error.message)}</p>`;return;}
 const flat=[];const walk=(list,prefix='')=>{for(const f of list||[]){const path=f.path||(prefix+'/'+(f.name||''));if(f.dir||f.children){walk(f.children,path);continue;}flat.push({path,size:f.size??0});}};walk(Array.isArray(files)?files:files.files||[]);
 box.innerHTML=flat.length?`<table><tbody>${flat.map((f,i)=>`<tr><td title="${esc(f.path)}">${esc(f.path)}</td><td>${f.size} B</td><td><button type="button" data-sd-download="${i}" title="내려받기" aria-label="${esc(f.path)} 내려받기">↓</button>${running?'':`<button type="button" data-sd-delete="${i}" title="삭제" aria-label="${esc(f.path)} 삭제">×</button>`}</td></tr>`).join('')}</tbody></table>`:'<p class="form-hint">파일이 없습니다.</p>';
 box.querySelectorAll('[data-sd-download]').forEach(b=>b.onclick=()=>{const f=flat[Number(b.dataset.sdDownload)];try{const bytes=storage?.readFile?storage.readFile(p.id,f.path):readFile(p.cardImage,f.path);const url=URL.createObjectURL(new Blob([bytes]));const a=document.createElement('a');a.href=url;a.download=f.path.split('/').pop();a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){log(error.message,'error');}});
 box.querySelectorAll('[data-sd-delete]').forEach(b=>b.onclick=()=>{const f=flat[Number(b.dataset.sdDelete)];try{const next=deleteFile(p.cardImage,f.path);checkpoint();p.cardImage=next;changed();}catch(error){log(error.message,'error');}});
}
export async function applyCameraImage(p,session){
 if(!session?.camera?.setImage||!p.image||p.pattern!=='image')return;
 try{const img=await decodeImageAsync(p.image);if(img)session.camera.setImage(p.id,img);}catch{}
}
// Draws the latest frame into the inspector preview while running.
let lastIndex=-1;
export function paintMedia(p,result,session){
 if(!isCamera(p))return;const canvas=document.getElementById('camera-preview');if(!canvas)return;
 const frame=result?.parts?.[p.id]?.frame||session?.cameraFrame?.();if(!frame?.rgba)return;
 const key=`${frame.index??''}:${frame.width}x${frame.height}:${frame.rgba.length}`;if(key===lastIndex&&frame.index!==undefined)return;lastIndex=key;
 if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}
 const ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba.buffer?frame.rgba:frame.rgba),frame.width,frame.height),0,0);
 const info=document.getElementById('camera-info');if(info)info.textContent=`${frame.width}×${frame.height} · ${frame.format||'RGB565'}${frame.index!==undefined?` · 프레임 ${frame.index}`:''}`;
}
export function refreshSdFiles(p,options){if(isSdCard(p))renderFiles(p,options);}
