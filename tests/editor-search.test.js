import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatches, replacementEdit} from '../src/editor-search.js';

test('code searches are literal, non-overlapping and use textarea offsets for Unicode', () => {
  assert.deepEqual(findMatches('a.b aXb a.b', 'a.b'), [{start:0,end:3},{start:8,end:11}]);
  assert.deepEqual(findMatches('aaaa', 'aa'), [{start:0,end:2},{start:2,end:4}]);
  assert.deepEqual(findMatches('😀한글 LED led', 'led', false), [{start:5,end:8},{start:9,end:12}]);
  assert.deepEqual(findMatches('İx i', 'i', false), [{start:3,end:4}]);
  assert.deepEqual(findMatches('anything', ''), []);
  for (const query of ['[', '\\', '$&', 'a\nb']) assert.equal(findMatches(query, query).length, 1);
});

test('single and all replacements preserve surrounding code and literal dollar sequences', () => {
  const code = 'led + led + LED', matches = findMatches(code, 'led');
  assert.deepEqual(replacementEdit(code, [matches[1]], '$&', 50), {start:6,end:9,text:'$&',count:1});
  assert.deepEqual(replacementEdit(code, matches, '$&', 50), {start:0,end:9,text:'$& + $&',count:2});
  assert.deepEqual(replacementEdit(code, matches, '', 50), {start:0,end:9,text:' + ',count:2});
  assert.equal(replacementEdit(code, [], 'new', 50), null);
});

test('replacement growth is rejected before allocating an oversized source', () => {
  const code = 'a'.repeat(50000), matches = findMatches(code, 'a');
  assert.throws(() => replacementEdit(code, matches, 'x'.repeat(50000), 50000), /크기 제한/);
  assert.doesNotThrow(() => replacementEdit(code, matches, '', 50000));
});
