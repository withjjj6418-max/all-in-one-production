import fs from 'fs';
import path from 'path';
import { runSourceFinder, verifyCandidates } from './source_finder.mjs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_VISION_MODEL || 'gemma4:e2b-it-qat';

function extractJson(value) {
  const text = String(value || '').replace(/<\|channel\>thought[\s\S]*?<channel\|>/g, '').trim();
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('로컬 비전 모델의 JSON 결과를 읽지 못했습니다.');
    return JSON.parse(match[0]);
  }
}

export async function getLocalVisionStatus() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('Ollama 응답 오류');
    const payload = await response.json();
    const models = (payload.models || []).map((item) => item.name);
    return { online: true, model: OLLAMA_MODEL, modelReady: models.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`)), models };
  } catch {
    return { online: false, model: OLLAMA_MODEL, modelReady: false, models: [] };
  }
}

export async function analyzeFamilyCandidates(candidates) {
  const status = await getLocalVisionStatus();
  if (!status.online) throw new Error('Windows 로컬 Ollama가 실행 중이 아닙니다. setup-local-vision.ps1을 먼저 실행해주세요.');
  if (!status.modelReady) throw new Error(`${OLLAMA_MODEL} 모델이 없습니다. setup-local-vision.ps1을 먼저 실행해주세요.`);
  const selected = (Array.isArray(candidates) ? candidates : []).slice(0, 7);
  if (selected.length < 5) throw new Error('전체 원본 추적에는 후보가 최소 5개 필요합니다.');
  const jobs = [];
  for (const candidate of selected) jobs.push(await runSourceFinder(candidate.localPath, { originalFileName: candidate.sourceTitle }));
  const analyzed = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const middle = Math.floor(job.representativeFrames.length / 2);
    const chosen = [...new Set([job.representativeFrames[0], job.representativeFrames[middle], job.representativeFrames.at(-1)].filter(Boolean))];
    const images = chosen.map((relativePath) => fs.readFileSync(path.join(job.outputDir, ...relativePath.split('/'))).toString('base64'));
    const prompt = `All attached images are chronological frames from ONE short clip extracted from a compilation. Ignore ranking numbers, compilation logos, black title areas and added captions unless a caption gives a useful exact phrase. Analyze the underlying source footage. Describe the exact people, objects, action and location in Korean. Transcribe every visible username, watermark and useful on-screen phrase exactly. Infer the likely original language. Produce four highly distinctive, concise search queries for the original upload; use quoted OCR/watermark text first, then specific action/object phrases in English or the likely source language. Avoid generic queries such as "family video". Return JSON only: {"description":"한국어 장면 설명","ocr":["exact text"],"watermarks":["exact handle"],"language":"en","queries":["query1","query2","query3","query4"]}`;
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, format: 'json', keep_alive: '15m', options: { temperature: 0.1, num_ctx: 8192 }, messages: [{ role: 'user', content: prompt, images }] }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `${index + 1}번 로컬 비전 분석에 실패했습니다.`);
    analyzed.push(extractJson(payload.message?.content));
  }
  return {
    model: OLLAMA_MODEL,
    candidates: selected.map((candidate, index) => ({ index: index + 1, sourceTitle: candidate.sourceTitle, jobId: jobs[index].jobId,
      ...(analyzed[index] || { description: '', ocr: [], watermarks: [], language: '', queries: [] }) })),
  };
}

export async function describeFamilyCandidate(candidate) {
  const status = await getLocalVisionStatus();
  if (!status.online || !status.modelReady) throw new Error('Windows 로컬 비전 모델을 먼저 실행해주세요.');
  if (!candidate?.localPath) throw new Error('분석할 장면 영상이 없습니다.');
  const job = await runSourceFinder(candidate.localPath, { originalFileName: candidate.sourceTitle || 'family-scene' });
  const middle = Math.floor(job.representativeFrames.length / 2);
  const chosen = [...new Set([job.representativeFrames[0], job.representativeFrames[middle], job.representativeFrames.at(-1)].filter(Boolean))];
  const images = chosen.map((relativePath) => fs.readFileSync(path.join(job.outputDir, ...relativePath.split('/'))).toString('base64'));
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, format: 'json', keep_alive: '15m', options: { temperature: 0.15, num_ctx: 8192 }, messages: [{ role: 'user', content: 'These are chronological frames from one short family clip. Ignore compilation titles, rank numbers, logos and added captions. In natural Korean, describe only the underlying situation in 2 concise sentences: who is present, what happens, the key reaction or twist, and the emotion. Do not identify private people or invent facts. Return JSON only: {"description":"..."}', images }] }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '장면 설명 생성에 실패했습니다.');
  const parsed = extractJson(payload.message?.content);
  return { description: String(parsed.description || '').trim(), jobId: job.jobId };
}

export async function verifyFamilyCandidates(searches) {
  const entries = (Array.isArray(searches) ? searches : []).slice(0, 7);
  const output = [];
  for (let index = 0; index < entries.length; index += 2) {
    const batch = entries.slice(index, index + 2);
    output.push(...await Promise.all(batch.map(async (entry) => ({ index: Number(entry.index), results: await verifyCandidates(String(entry.jobId), (entry.urls || []).slice(0, 4)) }))));
  }
  return output;
}
