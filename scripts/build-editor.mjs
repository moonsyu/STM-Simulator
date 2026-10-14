import {build} from 'esbuild';
import './build-colorschemes.mjs';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('src/generated',{recursive:true});
await build({entryPoints:['src/code-editor.js'],bundle:true,format:'esm',platform:'browser',target:'chrome142',outfile:'src/generated/code-editor.js',loader:{'.ttf':'file'},minify:true,legalComments:'eof'});
await build({entryPoints:['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],bundle:true,format:'iife',platform:'browser',target:'chrome142',outfile:'src/generated/editor.worker.js',minify:true,legalComments:'eof'});
await copyFile('node_modules/monaco-editor/LICENSE','src/generated/MONACO-LICENSE.txt');
await copyFile('node_modules/monaco-editor/ThirdPartyNotices.txt','src/generated/MONACO-NOTICES.txt');
console.log('Built local Monaco editor and worker.');
