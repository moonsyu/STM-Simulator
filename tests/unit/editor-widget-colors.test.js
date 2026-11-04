// The editor's suggestion list and hovers stay readable in every theme, whatever the scheme's popup colours are.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorTheme,widgetColors,contrast} from '../../src/colorscheme.js';
import {defaultPreferences} from '../../src/ide-preferences.js';

const check=(colors,name)=>{
 const bg=colors['editorSuggestWidget.background'],row=colors['editorSuggestWidget.selectedBackground'];
 assert.ok(contrast(colors['editorSuggestWidget.foreground'],bg)>=7,name+' text');
 assert.ok(contrast(colors['editorSuggestWidget.highlightForeground'],bg)>=4.5,name+' matched letters');
 assert.ok(contrast(colors['editorSuggestWidget.selectedForeground'],row)>=4.5,name+' selected row');
 assert.ok(contrast(colors['editorSuggestWidget.focusHighlightForeground'],row)>=4.5,name+' matched letters on the selected row');
 assert.ok(contrast(colors['editorHoverWidget.foreground'],colors['editorHoverWidget.background'])>=7,name+' hover');
};

test('every built-in theme gives the suggestion list readable text, matches and selected row',()=>{
 for(const theme of defaultPreferences().themes)check(editorTheme(theme).colors,theme.id);
});

test('a scheme with a grey popup and a low-contrast accent still gets readable suggestions',()=>{
 // The Vim Pmenu grey under Monaco's blue match letters was unreadable.
 const colors=widgetColors({background:'#151515',foreground:'#e8e8d3',panel:'#606060',border:'#403c41',accent:'#4a6a8a',function:'#556677',keyword:'#5a6a7a',selection:'#707070'});
 check(colors,'grey popup');assert.equal(colors['editorSuggestWidget.background'],'#151515','the editor background replaces the grey');
 assert.equal(contrast('#ffffff','#000000').toFixed(0),'21');
});
