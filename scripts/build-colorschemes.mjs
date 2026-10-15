import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {vimColorscheme,importColorscheme} from '../src/colorscheme.js';
const root=new URL('../src/themes/jellybeans/',import.meta.url);
const bytes=await readFile(new URL('jellybeans.vim',root)),source=JSON.parse((await readFile(new URL('source.json',root),'utf8')).replace(/^\uFEFF/,''));
if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw new Error('Jellybeans 원본 SHA-256 불일치');
const theme={...vimColorscheme(bytes.toString('utf8'),{jellybeans:true}),id:'jellybean',source};
await writeFile(new URL('theme.js',root),'// Generated from the pinned upstream Vim source by scripts/build-colorschemes.mjs.\nexport default '+JSON.stringify(theme,null,2)+';\n');
console.log('Converted pinned Jellybeans GUI highlights to Monaco.');
const lightRoot=new URL('../src/themes/github-light/',import.meta.url);
const lightBytes=await readFile(new URL('light-default.json',lightRoot)),lightSource=JSON.parse(await readFile(new URL('source.json',lightRoot),'utf8'));
if(createHash('sha256').update(lightBytes).digest('hex')!==lightSource.sha256)throw new Error('GitHub Light 원본 SHA-256 불일치');
// The upstream extension declares this file as a light theme in package.json.
const lightTheme={...importColorscheme(JSON.stringify({...JSON.parse(lightBytes),type:'light'}),'light-default.json'),id:'github-light',source:lightSource};
await writeFile(new URL('theme.js',lightRoot),'// Generated from pinned GitHub Light Default JSON by scripts/build-colorschemes.mjs.\nexport default '+JSON.stringify(lightTheme,null,2)+';\n');
console.log('Converted pinned GitHub Light Default highlights to Monaco.');
