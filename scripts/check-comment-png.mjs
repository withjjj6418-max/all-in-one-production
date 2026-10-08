import test from 'node:test';
import assert from 'node:assert/strict';
import {commentLayout} from '../src/lib/comment-png.ts';
test('dialogue end and gap anchor centered full-frame overlay',()=>{
  const l=commentLayout('원문\n두 번째 😀',900,36,1380,24,s=>[...s].length*36);
  assert.equal(l.x,90);assert.equal(l.y,1404);assert.deepEqual(l.lines,['원문','두 번째 😀']);assert.ok(l.y+l.height<=1920);
});
test('wrapped comments retain text and overflow is rejected rather than cropped',()=>{
  const text='한국어와 emoji 😀 그리고 원문을 유지합니다';
  const l=commentLayout(text,480,36,1000,24,s=>[...s].length*36);assert.equal(l.lines.join(''),text);
  assert.throws(()=>commentLayout(text.repeat(30),900,36,1380,24,s=>[...s].length*36),/벗어납니다/);
  assert.throws(()=>commentLayout('',900,36,1380,24,s=>s.length),/입력/);
});
