// Update log list logic (도움말 → 업데이트 로그): newest first, search, five entries a page.
export const UPDATE_LOG_PAGE_SIZE=5;
const versionParts=v=>String(v).split('.').map(n=>Number.parseInt(n,10)||0);
export function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]??0)-(y[i]??0);if(d)return d;}return 0;}
/** Newest first: by date, then by version (several releases share a day). */
export const sortUpdateLog=entries=>[...entries].sort((a,b)=>b.date.localeCompare(a.date)||compareVersions(b.version,a.version));
const normalize=text=>String(text).toLowerCase().replace(/\s+/g,' ').trim();
/** Entries whose version, date or an item contains every word of the query; `items` keeps only the matching lines
 * unless the version or date matched. */
export function searchUpdateLog(entries,query){
 const words=normalize(query).split(' ').filter(Boolean);if(!words.length)return entries;
 const has=text=>words.every(w=>normalize(text).includes(w));
 return entries.flatMap(e=>{if(has(`${e.version} v${e.version} ${e.date}`))return [e];const all=`${e.version} ${e.date} ${e.items.join(' ')}`;if(!has(all))return [];const items=e.items.filter(item=>words.some(w=>normalize(item).includes(w)));return [{...e,items:items.length?items:e.items}];});
}
/** One page (1-based, clamped) of the entries and the page count. */
export function updateLogPage(entries,page,size=UPDATE_LOG_PAGE_SIZE){
 const pages=Math.max(1,Math.ceil(entries.length/size)),current=Math.min(Math.max(1,Math.trunc(page)||1),pages);
 return {page:current,pages,entries:entries.slice((current-1)*size,current*size)};
}
