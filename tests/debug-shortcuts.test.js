import test from 'node:test';
import assert from 'node:assert/strict';
import {debugShortcut} from '../src/debug-shortcuts.js';

test('debug keys do not consume panel context menus, fullscreen modifiers or repeated events',()=>{
 for(const event of [{key:'F10',shiftKey:true},{key:'F11',ctrlKey:true},{key:'F5'},{key:'F6',altKey:true},{key:'F11',metaKey:true},{key:'F11',repeat:true},{key:'F11',isComposing:true}])assert.equal(debugShortcut(event),null);
 for(const [event,command]of [[{key:'F6'},'pause'],[{key:'F10'},'over'],[{key:'F11'},'into'],[{key:'F11',shiftKey:true},'out'],[{key:'F5',shiftKey:true},'stop'],[{key:'F5',ctrlKey:true,shiftKey:true},'start']])assert.equal(debugShortcut(event),command);
});
