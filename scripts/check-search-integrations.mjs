import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const values = new Map();
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''));
}

const serpApiKey = values.get('SERPAPI_API_KEY');
const imgbbKey = values.get('IMGBB_API_KEY');
if (!serpApiKey || !imgbbKey) throw new Error('SERPAPI_API_KEY와 IMGBB_API_KEY가 필요합니다.');

const form = new URLSearchParams();
// Generated solid-color PNG. Integration checks must never upload a user's local footage.
const ffmpeg = path.resolve('source-finder', 'bin', 'ffmpeg.exe');
const generated = spawnSync(ffmpeg, [
  '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x7dd3fc:s=64x64:d=0.1',
  '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
], { encoding: null, maxBuffer: 2 * 1024 * 1024 });
if (generated.status !== 0 || !generated.stdout?.length) throw new Error('안전한 테스트 이미지 생성 실패');
form.set('image', generated.stdout.toString('base64'));
const upload = await fetch(`https://api.imgbb.com/1/upload?expiration=600&key=${encodeURIComponent(imgbbKey)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form,
});
const uploaded = await upload.json();
if (!upload.ok || !uploaded.success || !uploaded.data?.url) {
  throw new Error(uploaded.error?.message || 'ImgBB 테스트 업로드 실패');
}

const endpoint = new URL('https://serpapi.com/search.json');
endpoint.search = new URLSearchParams({
  engine: 'google_lens',
  url: uploaded.data.url,
  type: 'all',
  hl: 'en',
  country: 'us',
  safe: 'active',
  api_key: serpApiKey,
}).toString();
const search = await fetch(endpoint);
const result = await search.json();
if (!search.ok || result.error) throw new Error(result.error || 'SerpApi Google Lens 테스트 실패');

const visualMatches = Array.isArray(result.visual_matches) ? result.visual_matches : [];
console.log(JSON.stringify({
  imgbb: 'ok (10분 후 자동 삭제)',
  serpApiLens: 'ok',
  visualMatches: visualMatches.length,
  socialMatches: visualMatches.filter((item) => /youtube|youtu\.be|tiktok|instagram|facebook|reddit/i.test(String(item.link || ''))).length,
}, null, 2));
