// Literal searches retain UTF-16 offsets used by textarea selections.
export function findMatches(text, query, caseSensitive = true) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(text.matchAll(new RegExp(escaped, caseSensitive ? 'gu' : 'giu')),
    match => ({start: match.index, end: match.index + match[0].length}));
}

export function replacementEdit(text, matches, replacement, maxLength) {
  if (!matches.length) return null;
  const size = text.length + matches.reduce((sum, match) => sum + replacement.length - (match.end - match.start), 0);
  if (size > maxLength) throw new Error('바꾼 내용이 소스 파일의 크기 제한을 넘습니다.');
  const start = matches[0].start, end = matches.at(-1).end, pieces = [];
  let cursor = start;
  for (const match of matches) {
    pieces.push(text.slice(cursor, match.start), replacement);
    cursor = match.end;
  }
  return {start, end, text: pieces.join(''), count: matches.length};
}

export function setupEditorSearch({applyEdit, maxLength}) {
  const $ = id => document.getElementById(id);
  const code = $('code'), panel = $('code-search'), query = $('code-find'), replacement = $('code-replacement');
  const count = $('code-find-count'), message = $('code-search-message'), sensitive = $('code-find-case');
  let matches = [], current = -1;

  function controls() {
    count.textContent = matches.length ? `${current < 0 ? 0 : current + 1} / ${matches.length}` : query.value ? '일치 없음' : '0 / 0';
    for (const id of ['code-find-prev', 'code-find-next']) $(id).disabled = !matches.length;
    for (const id of ['code-replace-one', 'code-replace-all']) $(id).disabled = code.readOnly || !matches.length;
    replacement.disabled = code.readOnly;
    $('code-search-readonly').hidden = !code.readOnly;
  }

  // Measure the actual font (including Hangul, tabs and long lines), then reveal
  // the match without taking keyboard focus away from the search input.
  function reveal(match) {
    code.setSelectionRange(match.start, match.end);
    const style = getComputedStyle(code), mirror = document.createElement('div'), marker = document.createElement('span');
    for (const name of ['font', 'letterSpacing', 'tabSize', 'padding', 'lineHeight']) mirror.style[name] = style[name];
    Object.assign(mirror.style, {position:'fixed', left:'-100000px', top:'0', whiteSpace:'pre', visibility:'hidden'});
    mirror.append(document.createTextNode(code.value.slice(0, match.start)));
    marker.textContent = code.value.slice(match.start, match.end) || ' ';
    mirror.append(marker);document.body.append(mirror);
    const a = mirror.getBoundingClientRect(), b = marker.getBoundingClientRect();
    code.scrollTop = Math.max(0, b.top - a.top - code.clientHeight / 2);
    code.scrollLeft = Math.max(0, b.left - a.left - code.clientWidth / 3);
    mirror.remove();code.dispatchEvent(new Event('scroll'));
  }

  function refresh({sourceChanged = false, select = false} = {}) {
    if (panel.hidden) return;
    matches = findMatches(code.value, query.value, sensitive.checked);
    current = matches.findIndex(m => m.start === code.selectionStart && m.end === code.selectionEnd);
    if (sourceChanged) message.textContent = '';
    if (select && matches.length) {
      current = matches.findIndex(m => m.start >= code.selectionStart);
      if (current < 0) current = 0;
      reveal(matches[current]);
    }
    controls();
  }

  function navigate(direction) {
    message.textContent = '';
    refresh();
    if (!matches.length) return;
    if (current >= 0) current = (current + direction + matches.length) % matches.length;
    else if (direction > 0) {current = matches.findIndex(m => m.start >= code.selectionEnd);if (current < 0) current = 0;}
    else {current = matches.findLastIndex(m => m.end <= code.selectionStart);if (current < 0) current = matches.length - 1;}
    reveal(matches[current]);controls();
  }

  function open(replace) {
    const selected = code.value.slice(code.selectionStart, code.selectionEnd);
    if (document.activeElement === code && selected && !/[\r\n]/.test(selected)) query.value = selected;
    panel.hidden = false;$('code-replace-row').hidden = !replace;$('code-panel').classList.add('searching');
    message.textContent = '';refresh({select:true});query.focus();query.select();
  }

  function close() {panel.hidden = true;$('code-panel').classList.remove('searching');code.focus({preventScroll:true});}

  function replace(all) {
    refresh();
    if (code.readOnly || !matches.length) return;
    if (current < 0) {current = matches.findIndex(m => m.start >= code.selectionStart);if (current < 0) current = 0;}
    const targets = all ? matches : [matches[current]];
    try {
      const edit = replacementEdit(code.value, targets, replacement.value, maxLength());
      if (code.value.slice(edit.start, edit.end) === edit.text) {message.textContent = '바꿀 내용이 현재 내용과 같습니다.';return;}
      applyEdit(edit);
      // Input events update the project and undo history synchronously.
      refresh();
      if (!all && matches.length) {
        current = matches.findIndex(m => m.start >= edit.start + edit.text.length);
        if (current < 0) current = 0;
        reveal(matches[current]);
      }
      controls();message.textContent = `${edit.count}개 바꿨습니다.`;
      $(all ? 'code-replace-all' : 'code-replace-one').focus({preventScroll:true});
    } catch (error) {message.textContent = error.message;}
  }

  $('code-find-open').onclick = () => open(false);
  $('code-replace-open').onclick = () => open(true);
  $('code-search-close').onclick = close;
  $('code-find-prev').onclick = () => navigate(-1);
  $('code-find-next').onclick = () => navigate(1);
  $('code-replace-one').onclick = () => replace(false);
  $('code-replace-all').onclick = () => replace(true);
  query.addEventListener('input', () => {message.textContent = '';refresh({select:true});});
  sensitive.addEventListener('change', () => {message.textContent = '';refresh({select:true});});
  code.addEventListener('input', () => {message.textContent = '';refresh();});
  code.addEventListener('select', () => refresh());
  document.addEventListener('keydown', event => {
    if (event.isComposing || document.querySelector('dialog[open]')) return;
    const inside = $('code-panel').contains(event.target);
    if (!inside) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && ['f','r'].includes(event.key.toLowerCase())) {
      event.preventDefault();event.stopPropagation();open(event.key.toLowerCase() === 'r');return;
    }
    if (panel.hidden) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();close();}
    else if (event.key === 'Enter' && [query, replacement].includes(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();event.stopPropagation();navigate(event.shiftKey ? -1 : 1);
    }
  }, true);
  return {refresh};
}
