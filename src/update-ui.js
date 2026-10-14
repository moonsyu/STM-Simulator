const $=id=>document.getElementById(id);
export function setupUpdates({beforeInstall}){
 const api=window.appUpdates,button=$('app-update');
 if(!api){button.hidden=true;return;}
 document.body.insertAdjacentHTML('beforeend',`<dialog id="update-dialog" aria-labelledby="update-title"><h2 id="update-title">STM Simulator 업데이트</h2><p id="update-version"></p><p id="update-status" role="status" aria-live="polite"></p><progress id="update-progress" max="100" value="0" aria-label="업데이트 다운로드" hidden></progress><label class="update-setting"><input id="update-automatic" type="checkbox"> 새 버전 자동 확인 및 다운로드</label><p class="form-hint">다운로드 중에도 작업할 수 있습니다. 적용할 때 현재 회로와 코드를 저장하고 앱을 다시 시작합니다.</p><p id="update-error" class="form-error" role="alert"></p><div class="dialog-actions"><button id="update-releases" type="button">릴리스 보기</button><button id="update-check" type="button">업데이트 확인</button><button id="update-download" type="button" hidden>다운로드</button><button id="update-install" class="run-button" type="button" hidden>저장 후 재시작</button><button id="update-close" type="button">닫기</button></div></dialog>`);
 let state={},installing=false;
 function render(next){
  state=next;const phase=state.phase,busy=['checking','downloading','installing'].includes(phase),unsupported=phase==='unsupported';
  $('update-version').textContent=`현재 버전 ${state.currentVersion}${state.latestVersion?' · 새 버전 '+state.latestVersion:''}`;
  $('update-status').textContent=state.message||'';
  $('update-progress').hidden=phase!=='downloading';$('update-progress').value=state.progress||0;
  $('update-automatic').checked=state.automatic;$('update-automatic').disabled=unsupported||installing;
  $('update-check').disabled=unsupported||busy||phase==='ready'||installing;
  $('update-download').hidden=!(['available','error'].includes(phase)&&state.latestVersion);$('update-download').disabled=installing;
  $('update-install').hidden=phase!=='ready';$('update-install').disabled=installing;
  $('update-close').disabled=installing;
  button.textContent=phase==='ready'?'업데이트 준비':phase==='downloading'?'다운로드 '+(state.progress||0)+'%':'업데이트';
  button.classList.toggle('update-ready',phase==='ready');button.title=state.message||'업데이트';
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
