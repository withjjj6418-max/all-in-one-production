import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const env = new Map();
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0 && !line.trimStart().startsWith('#')) env.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''));
}
const outputs = path.resolve('source-finder', 'outputs');
const jobId = process.argv[2];
if (!/^[\w.-]+$/.test(jobId || '')) throw new Error('jobId가 필요합니다.');
const directory = path.join(outputs, jobId, 'frames', 'cropped');
const names = fs.readdirSync(directory).filter((name) => name.endsWith('.jpg')).sort();
const selected = names.length <= 3 ? names : [names[0], names[Math.floor(names.length / 2)], names.at(-1)];
const frames = selected.map((name) => fs.readFileSync(path.join(directory, name)));
const visionKey = env.get('GOOGLE_CLOUD_VISION_API_KEY') || env.get('GEMINI_API_KEY');
const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: frames.map((frame) => ({ image: { content: frame.toString('base64') }, features: [{ type: 'WEB_DETECTION', maxResults: 30 }] })) }) });
const vision = await visionResponse.json();
const pages = [];
for (const result of vision.responses || []) for (const page of result.webDetection?.pagesWithMatchingImages || []) pages.push({ url: page.url, title: page.pageTitle, full: (page.fullMatchingImages || []).length, partial: (page.partialMatchingImages || []).length });
const ai = new GoogleGenAI({ apiKey: env.get('GEMINI_API_KEY') });
const parts = [{ text: `Find the exact original public social video in these frames. Exact visible phrase hints: "waking daddy up on daddy's day", "Bro did understand the assignment". Search direct TikTok, Instagram Reel, YouTube Shorts, Facebook or Reddit video posts. Exclude compilations. Do not invent URLs.` }];
frames.forEach((frame, index) => { parts.push({ text: `FRAME ${index + 1}` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame.toString('base64') } }); });
const grounded = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: parts, config: { tools: [{ googleSearch: {} }], temperature: 0.05, maxOutputTokens: 600 } });
console.log(JSON.stringify({ visionPages: pages.slice(0, 20), groundedText: grounded.text, groundingChunks: grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [], searches: grounded.candidates?.[0]?.groundingMetadata?.webSearchQueries || [] }, null, 2));
