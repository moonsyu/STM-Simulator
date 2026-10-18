import {build} from 'esbuild';
import './build-colorschemes.mjs';
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('src/generated',{recursive:true});
// Monaco also vendors DOMPurify: updating only the npm dependency would leave
// its older sanitizer embedded in the shipped editor. Resolve that one module
// to the reviewed, locked upstream release and verify the resulting graph.
const sanitizer={name:'locked-dompurify',setup(builder){builder.onResolve({filter:/dompurify\/dompurify\.js$/},()=>({path:path.resolve('node_modules/dompurify/dist/purify.es.mjs')}));}};
const editor=await build({entryPoints:['src/code-editor.js'],bundle:true,format:'esm',platform:'browser',target:'chrome142',outfile:'src/generated/code-editor.js',loader:{'.ttf':'file'},minify:true,legalComments:'eof',plugins:[sanitizer],metafile:true});
assert.ok(Object.keys(editor.metafile.inputs).some(p=>p.endsWith('dompurify/dist/purify.es.mjs')));
assert.ok(!Object.keys(editor.metafile.inputs).some(p=>p.includes('monaco-editor/')&&p.endsWith('dompurify/dompurify.js')));
await build({entryPoints:['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],bundle:true,format:'iife',platform:'browser',target:'chrome142',outfile:'src/generated/editor.worker.js',minify:true,legalComments:'eof'});
await copyFile('node_modules/monaco-editor/LICENSE','src/generated/MONACO-LICENSE.txt');
await copyFile('node_modules/monaco-editor/ThirdPartyNotices.txt','src/generated/MONACO-NOTICES.txt');
await copyFile('node_modules/dompurify/LICENSE','src/generated/DOMPURIFY-LICENSE.txt');
console.log('Built local Monaco editor and worker.');
