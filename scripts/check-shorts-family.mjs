import fs from 'fs';

const values = new Map();
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''));
}

const required = ['YOUTUBE_API_KEY', 'GEMINI_API_KEY', 'SERPAPI_API_KEY', 'IMGBB_API_KEY'];
const missing = required.filter((name) => !values.get(name));
if (missing.length) throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);

const endpoint = new URL('https://www.googleapis.com/youtube/v3/channels');
endpoint.search = new URLSearchParams({
  part: 'id',
  forHandle: 'buzrino',
  key: values.get('YOUTUBE_API_KEY'),
}).toString();
const response = await fetch(endpoint);
const payload = await response.json();
if (!response.ok) throw new Error(payload.error?.message || 'YouTube API 연결 실패');

let localVision = { online: false, modelReady: false };
try {
  const ollama = await fetch('http://127.0.0.1:11434/api/tags');
  const tags = await ollama.json();
  localVision = {
    online: ollama.ok,
    modelReady: (tags.models || []).some((item) => item.name === 'gemma4:e2b-it-qat'),
  };
} catch { /* 상태만 보고합니다. */ }

console.log(JSON.stringify({
  youtubeApi: 'ok',
  geminiConfigured: true,
  serpApiConfigured: true,
  imgbbConfigured: true,
  localVision,
}, null, 2));
