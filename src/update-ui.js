const $=id=>document.getElementById(id);
export function setupUpdates({beforeInstall}){
 const api=window.appUpdates,button=$('app-update');
 button.hidden=true;if(!api)return;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="update-dialog" aria-labelledby="update-title"><h2 id="update-title">버전 정보 · 업데이트</h2><dl class="update-facts"><dt>현재 버전</dt><dd id="update-current"></dd><dt>최신 버전</dt><dd id="update-latest"></dd><dt>업데이트 상태</dt><dd id="update-phase"></dd><dt>마지막 확인</dt><dd id="update-checked"></dd></dl><p id="update-status" role="status" aria-live="polite"></p><progress id="update-progress" max="100" value="0" aria-label="업데이트 다운로드" hidden></progress><label class="update-setting"><input id="update-automatic" type="checkbox"> 새 버전 자동 확인 및 다운로드</label><p class="form-hint">다운로드 중에도 작업할 수 있습니다. 적용할 때 현재 회로와 코드를 저장하고 앱을 다시 시작합니다.</p><p id="update-error" class="form-error" role="alert"></p><div class="dialog-actions"><button id="update-releases" type="button">릴리스 보기</button><button id="update-check" type="button">업데이트 확인</button><button id="update-download" type="button" hidden>다운로드</button><button id="update-install" class="run-button" type="button" hidden>저장 후 재시작</button><button id="update-close" type="button">닫기</button></div></dialog>`);
 let state={},installing=false;
 const PHASES={idle:'확인 대기 중',checking:'확인 중',current:'최신 버전을 사용하고 있습니다',available:'새 버전이 있습니다',downloading:'새 버전 다운로드 중',ready:'적용 준비 완료 (저장 후 재시작하면 적용)',installing:'적용 중',error:'확인 또는 다운로드 실패',unsupported:'자동 업데이트를 쓸 수 없는 실행 방식 (개발 실행)'};
 function render(next){
  state=next;const phase=state.phase,busy=['checking','downloading','installing'].includes(phase),unsupported=phase==='unsupported';
  $('update-current').textContent=state.currentVersion||'-';
  $('update-latest').textContent=state.latestVersion||(phase==='current'?state.currentVersion:'확인 전');
  $('update-phase').textContent=(PHASES[phase]||phase||'-')+(phase==='downloading'?` ${state.progress||0}%`:'');$('update-phase').dataset.phase=phase||'';
  // 도움말 → 버전 정보 shows the version (and a waiting update) right in the menu.
  const item=document.querySelector('[data-command="help.about"] span');
  if(item)item.textContent=`버전 정보 · 업데이트 상태 (v${state.currentVersion}${['available','downloading','ready','installing'].includes(phase)&&state.latestVersion?` → v${state.latestVersion}`:''})`;
  $('update-checked').textContent=state.checkedAt?new Date(state.checkedAt).toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'}):'아직 확인하지 않음';
  $('update-status').textContent=state.message||'';
  $('update-progress').hidden=phase!=='downloading';$('update-progress').value=state.progress||0;
  $('update-automatic').checked=state.automatic;$('update-automatic').disabled=unsupported||installing;
  $('update-check').disabled=unsupported||busy||phase==='ready'||installing;
  $('update-download').hidden=!(['available','error'].includes(phase)&&state.latestVersion);$('update-download').disabled=installing;
  $('update-install').hidden=phase!=='ready';$('update-install').disabled=installing;
  $('update-close').disabled=installing;
  // The title-bar button exists only while there is a new version to download, downloading or ready to apply.
  button.hidden=!['available','downloading','ready','installing'].includes(phase);
  button.textContent=phase==='ready'||phase==='installing'?'업데이트 적용':phase==='downloading'?`업데이트 ${state.progress||0}%`:'업데이트';
  button.classList.toggle('update-ready',phase==='ready');button.title=(state.latestVersion?`새 버전 ${state.latestVersion} · `:'')+(state.message||'업데이트');
 }
 async function action(fn){$('update-error').textContent='';try{const next=await fn();if(next?.phase)render(next);}catch(error){$('update-error').textContent=error.message;}}
 api.onState(render);
 void action(()=>api.state());
 button.onclick=()=>{$('update-dialog').showModal();void action(()=>api.state());};
 $('update-close').onclick=()=>$('update-dialog').close();
 $('update-dialog').addEventListener('cancel',event=>{if(installing)event.preventDefault();});
 $('update-check').onclick=()=>void action(()=>api.check());
 $('update-download').onclick=()=>void action(()=>api.download());
 $('update-releases').onclick=()=>void action(()=>api.releases());
 $('update-automatic').onchange=()=>void action(()=>api.configure($('update-automatic').checked));
 $('update-install').onclick=async()=>{
  installing=true;render(state);
  try{await beforeInstall();await api.install();}
  catch(error){$('update-error').textContent='업데이트를 적용하지 않았습니다. '+error.message;}
  finally{installing=false;render(state);}
 };
}
