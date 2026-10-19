import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import githubLight from '../src/themes/github-light/theme.js';
import {defaultPreferences,validatePreferences,loadPreferences,selectedTheme,PREFERENCES_KEY} from '../src/ide-preferences.js';
import {editorTheme} from '../src/colorscheme.js';

// Exact shipped theme before the C/C++ scope mapping correction, not rebuilt
// with the current importer (which would hide an upgrade regression).
const legacy=JSON.parse(readFileSync(new URL('./fixtures/github-light-legacy.json',import.meta.url),'utf8'));
const storedPreferences=()=>{const prefs=defaultPreferences();prefs.themes[prefs.themes.findIndex(t=>t.id==='github-light')]=structuredClone(legacy);return prefs;};
const light=prefs=>prefs.themes.find(t=>t.id==='github-light');

test('saved unmodified GitHub Light builtin migrates its complete old conversion on load',()=>{
 const before=storedPreferences(),text=JSON.stringify(before);
 const result=loadPreferences({getItem:key=>key===PREFERENCES_KEY?text:null});
 assert.deepEqual(light(result).editor,githubLight.editor);
 assert.deepEqual(light(result).colors,githubLight.colors);
 assert.deepEqual(light(result).originalColors,githubLight.originalColors);
 assert.equal(light(result).colors.number,'#0550ae');
 assert.equal(light(result).colors.type,'#cf222e');
 assert.deepEqual(editorTheme(light(result)),githubLight.editor);
 assert.equal(result.appearance,before.appearance);
 assert.equal(result.darkTheme,before.darkTheme);
 assert.equal(result.lightTheme,before.lightTheme);
 assert.equal(result.theme,before.theme);
 assert.equal(JSON.stringify(before),text,'loading must not mutate the supplied settings');
 assert.deepEqual(validatePreferences(result),result,'migration is idempotent');
});

test('builtin upgrade preserves explicit palette edits, renamed mode and theme selection',()=>{
 const prefs=storedPreferences(),theme=light(prefs);
 theme.name='My light palette';theme.base='dark';theme.colors.number='#abcdef';theme.colors.comment='#123456';theme.colors.background='#101010';
 prefs.appearance='dark';prefs.theme=prefs.darkTheme='github-light';prefs.lightTheme='stm-light';prefs.fontSize=18;prefs.lineHeight=26;
 const result=validatePreferences(prefs),updated=light(result),rendered=editorTheme(updated);
 assert.equal(updated.name,theme.name);assert.equal(updated.base,theme.base);
 for(const key of ['number','comment','background'])assert.equal(updated.colors[key],theme.colors[key]);
 assert.equal(updated.colors.type,githubLight.colors.type);
 assert.deepEqual(updated.editor,githubLight.editor);
 assert.deepEqual(updated.originalColors,githubLight.originalColors);
 assert.equal(rendered.base,'vs-dark');
 assert.equal(rendered.rules.find(r=>r.token==='number').foreground,'abcdef');
 assert.equal(rendered.rules.find(r=>r.token==='comment').foreground,'123456');
 assert.equal(rendered.colors['editor.background'],'#101010');
 assert.equal(selectedTheme(result,'dark').id,'github-light');assert.equal(selectedTheme(result,'light').id,'stm-light');
 assert.equal(result.theme,'github-light');assert.equal(result.fontSize,18);assert.equal(result.lineHeight,26);
 assert.deepEqual(validatePreferences(result),result);
});

test('custom editor rules and editor colors are never replaced even under the builtin ID',()=>{
 const edits=[
  t=>{t.editor.rules[0].foreground='112233';},
  t=>{t.editor.rules[0].fontStyle='italic';},
  t=>{t.editor.rules.push({token:'number.hex',foreground:'abcdef'});},
  t=>{t.editor.rules.reverse();},
  t=>{t.editor.colors['editor.background']='#fefefe';},
  t=>{t.editor.colors['editorWhitespace.foreground']='#aabbcc';},
  t=>{t.editor.inherit=false;},
  t=>{t.editor.base='hc-light';}
 ];
 for(const edit of edits){const prefs=storedPreferences(),theme=light(prefs);edit(theme);assert.deepEqual(light(validatePreferences(prefs)),theme);}
});

test('migration requires the exact pinned source and original palette, not just the name',()=>{
 const edits=[
  t=>{delete t.source;},
  t=>{t.source.repository='https://github.com/example/custom-theme';},
  t=>{t.source.commit='0'.repeat(40);},
  t=>{t.source.sha256='0'.repeat(64);},
  t=>{t.source.file='custom.json';},
  t=>{t.source.license='Custom';},
  t=>{t.originalColors.type='#123456';}
 ];
 for(const edit of edits){const prefs=storedPreferences(),theme=light(prefs);edit(theme);assert.deepEqual(light(validatePreferences(prefs)),theme);}
});

test('imported or copied GitHub themes retain their own editor even with builtin provenance',()=>{
 const prefs=defaultPreferences(),imported=structuredClone(legacy);imported.id='my-github-copy';imported.name='Imported GitHub';prefs.themes.push(imported);prefs.theme=prefs.lightTheme=imported.id;prefs.appearance='light';
 const result=validatePreferences(prefs);
 assert.deepEqual(selectedTheme(result,'light'),imported);
 assert.equal(result.theme,imported.id);assert.equal(result.lightTheme,imported.id);
 assert.deepEqual(light(result),githubLight);
});

test('normalized saved color case and object ordering do not block the known builtin upgrade',()=>{
 const prefs=storedPreferences(),theme=light(prefs);
 for(const key of Object.keys(theme.colors)){theme.colors[key]=theme.colors[key].toUpperCase();theme.originalColors[key]=theme.originalColors[key].toUpperCase();}
 theme.editor.colors=Object.fromEntries(Object.entries(theme.editor.colors).reverse().map(([key,value])=>[key,value.toUpperCase()]));
 for(const rule of theme.editor.rules)for(const key of ['foreground','background'])if(rule[key])rule[key]=rule[key].toUpperCase();
 assert.deepEqual(light(validatePreferences(prefs)).editor,githubLight.editor);
 assert.deepEqual(light(validatePreferences(prefs)).colors,githubLight.colors);
});

test('current canonical builtins and palette-only user replacements round-trip unchanged',()=>{
 const prefs=defaultPreferences();assert.deepEqual(validatePreferences(prefs),prefs);
 const replacement=storedPreferences(),theme=light(replacement);delete theme.editor;delete theme.originalColors;
 assert.deepEqual(light(validatePreferences(replacement)),theme);
});
