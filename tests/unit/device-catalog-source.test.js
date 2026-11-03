import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';

// src/device-catalog-data.js is generated from this JSON: text changed only in the generated file comes back on the next `npm run build:catalog`.
test('the device catalog is what the generator makes from its JSON source',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../docs/device-visual-references.json',import.meta.url),'utf8'));
 const rows=data.variants.map(v=>({...v,source:v.source_ids.map(id=>({title:data.sources[id].title,url:data.sources[id].url})),image:data.sources[v.visual_source_id]?.image_url||null}));
 assert.deepEqual(DEVICE_CATALOG,rows);
});
