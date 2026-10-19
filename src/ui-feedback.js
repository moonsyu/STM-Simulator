// Persistent, actionable feedback remains visible even when the log dock is closed.
export function setupFeedback({showLog}) {
  const banner=document.createElement('section');
  banner.id='app-feedback';banner.hidden=true;banner.setAttribute('role','alert');
  banner.innerHTML='<span id="app-feedback-message"></span><button id="app-feedback-log" type="button">로그 보기</button><button id="app-feedback-dismiss" type="button" aria-label="오류 알림 닫기">닫기</button>';
  document.body.append(banner);
  banner.querySelector('#app-feedback-log').onclick=()=>showLog();
  banner.querySelector('#app-feedback-dismiss').onclick=()=>{banner.hidden=true;};
  return {
    show(message,scope='operation') {banner.dataset.scope=scope;banner.querySelector('#app-feedback-message').textContent=message;banner.hidden=false;},
    clear(scope) {if(banner.dataset.scope===scope)banner.hidden=true;}
  };
}
