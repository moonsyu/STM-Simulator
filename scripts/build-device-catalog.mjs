import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../docs/device-visual-references.json',import.meta.url),'utf8'));
const rows=data.variants.map(v=>({...v,source:v.source_ids.map(id=>({title:data.sources[id].title,url:data.sources[id].url})),image:data.sources[v.visual_source_id]?.image_url||null}));
fs.writeFileSync(new URL('../src/device-catalog-data.js',import.meta.url),'// Generated from the researched device inventory. Original photographs are references, not bundled assets.\nexport const DEVICE_CATALOG = '+JSON.stringify(rows,null,2)+';\n');
