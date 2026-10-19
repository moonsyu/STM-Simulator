const assert=require('node:assert/strict');
const {fillCode}=require('./smoke-fixture.cjs');

// Assert rendered C tokens, independently of the importer output. These values
// come from the pinned upstream themes' ordinary C token groups.
exports.checkEditorTheme=async(page,id)=>{
 const palettes={
  'github-light':['#cf222e','#8250df','#cf222e','#0550ae','#6e7781','#0a3069'],
  jellybean:['#ffb964','#fad07a','#8197bf','#cf6a4c','#888888','#99ad6a']
 };
 const labels=['int','main','return','42','// Theme review','"hello"'];
 const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ')+')';
 const expected=labels.map((text,index)=>({text,color:rgb(palettes[id][index])}));
 await page.click('[data-tab="code"]');
 await fillCode(page,'int main(void) {\n    // Theme review\n    const char *message = "hello";\n    return 42;\n}\n');
 await page.locator('#code').evaluate(el=>{el.focus();el.setSelectionRange(0,0);});
 await page.waitForFunction(expected=>expected.every(token=>[...document.querySelectorAll('.view-line span')].some(el=>el.textContent.replaceAll('\u00a0',' ')===token.text&&getComputedStyle(el).color===token.color)),expected);
 const actual=await page.evaluate(labels=>labels.map(text=>{
  const el=[...document.querySelectorAll('.view-line span')].find(el=>el.textContent.replaceAll('\u00a0',' ')===text);
  return {text,color:getComputedStyle(el).color};
 }),labels);
 assert.deepEqual(actual,expected);
 return {theme:id,tokens:actual};
};
