// Helpers shared by the app's modules.

/** The element with this id. */
export const $=id=>document.getElementById(id);
/** Text made safe for HTML content and attribute values. */
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
/** v kept within [min, max]. */
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
