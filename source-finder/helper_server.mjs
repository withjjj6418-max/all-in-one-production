import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { inspectCandidate, runSourceFinder, verifyCandidates } from './source_finder.mjs';
import {
  downloadBoardSource,
  createFamilyStill,
  ensureProjectLayout,
  listFamilyLibrary,
  listFamilyRecommendationLibrary,
  packageFamilyProject,
  resolveFamilyFolder,
  stageFamilyCandidate,
  stageUploadedReference,
  splitRankingReference,
  assertSourcePath,
} from './shorts_family.mjs';
import { analyzeFamilyCandidates, describeFamilyCandidate, getLocalVisionStatus, verifyFamilyCandidates } from './local_family_analyzer.mjs';
import { downloadOneSourceBoardItem, getSourceBoardDownloadStatuses } from '../scripts/download-source-board.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.SOURCE_FINDER_PORT || 8787);
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function corsHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-File-Name',
    'Access-Control-Allow-Private-Network': 'true',
    'Content-Type': contentType,
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, corsHeaders());
  res.end(JSON.stringify(payload));
}

function contentTypeForVideo(extension) {
  switch (extension) {
    case '.mp4': case '.m4v': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.mkv': return 'video/x-matroska';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

function streamVideoFile(req, res, sourcePath) {
  const stat = fs.statSync(sourcePath);
  const contentType = contentTypeForVideo(path.extname(sourcePath).toLowerCase());
  const headers = { ...corsHeaders(contentType), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(sourcePath).pipe(res);
    return;
  }
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match && match[1] ? Number(match[1]) : 0;
  const end = match && match[2] ? Number(match[2]) : stat.size - 1;
  if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
    res.end();
    return;
  }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(sourcePath, { start, end }).pipe(res);
}

function readJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('요청 데이터가 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON 형식이 올바르지 않습니다.'));
      }
    });
    req.on('error', reject);
  });
}

function openOutputFolder(outputDir) {
  const target = path.resolve(String(outputDir || ''));
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`열 폴더를 찾을 수 없습니다: ${target}`);
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Start-Process -FilePath explorer.exe -ArgumentList @($env:SHORTS_FOLDER_TO_OPEN)',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, SHORTS_FOLDER_TO_OPEN: target },
  });
  if (result.status !== 0 || result.error) {
    const detail = String(result.stderr || result.error?.message || '').trim();
    throw new Error(detail || `Explorer에서 폴더를 열지 못했습니다: ${target}`);
  }
}

function copyImageToClipboard(imagePath) {
  try {
    const escaped = path.resolve(imagePath).replace(/'/g, "''");
    const command = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Image]::FromFile('${escaped}'); [Windows.Forms.Clipboard]::SetImage($image); $image.Dispose()`;
    const result = spawnSync('powershell.exe', [
      '-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command,
    ], { encoding: 'utf8', windowsHide: true });
    return result.status === 0;
  } catch {
    return false;
  }
}

function decorateResult(result, req) {
  const origin = `http://${req.headers.host || `localhost:${PORT}`}`;
  const assetUrl = (relativePath) => `${origin}/asset?jobId=${encodeURIComponent(result.jobId)}&file=${encodeURIComponent(relativePath)}`;
  return {
    ...result,
    contactSheetUrl: assetUrl(result.contactSheet),
    representativeFrameUrls: result.representativeFrames.map(assetUrl),
  };
}

function finishInvestigation(result, req, payload = {}) {
  const firstFrame = result.representativeFrames[0]
    ? path.join(result.outputDir, ...result.representativeFrames[0].split('/'))
    : null;
  const clipboard = firstFrame ? copyImageToClipboard(firstFrame) : false;
  if (payload.openFolder !== false) openOutputFolder(result.outputDir);
  return { ok: true, ...decorateResult(result, req), clipboard };
}

function resolveAsset(jobId, relativeFile) {
  if (!/^[\w.-]+$/.test(jobId || '')) return null;
  const jobDir = path.resolve(__dirname, 'outputs', jobId);
  const assetPath = path.resolve(jobDir, relativeFile || '');
  if (assetPath !== jobDir && !assetPath.startsWith(`${jobDir}${path.sep}`)) return null;
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) return null;
  return assetPath;
}

async function handleFileUpload(req, res) {
  const encodedName = String(req.headers['x-file-name'] || 'uploaded-video.mp4');
  let originalFileName = 'uploaded-video.mp4';
  try { originalFileName = decodeURIComponent(encodedName); } catch { originalFileName = encodedName; }
  originalFileName = path.basename(originalFileName).replace(/[<>:"/\\|?*]/g, '_');

  const uploadDir = path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const tempPath = path.join(uploadDir, `${Date.now()}-${originalFileName}`);
  const stream = fs.createWriteStream(tempPath, { flags: 'wx' });
  let size = 0;
  let settled = false;

  const fail = (status, message) => {
    if (settled) return;
    settled = true;
    stream.destroy();
    fs.rmSync(tempPath, { force: true });
    sendJson(res, status, { ok: false, error: message });
  };

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      fail(413, '파일은 최대 1GB까지 업로드할 수 있습니다.');
      req.destroy();
    }
  });
  req.on('error', (error) => fail(500, error.message));
  stream.on('error', (error) => fail(500, error.message));

  req.pipe(stream);
  stream.on('finish', async () => {
    if (settled) return;
    try {
      const result = await runSourceFinder(tempPath, { originalFileName });
      settled = true;
      fs.rmSync(tempPath, { force: true });
      sendJson(res, 200, finishInvestigation(result, req, { openFolder: false }));
    } catch (error) {
      fail(500, error.message);
    }
  });
}

async function handleFamilyReferenceUpload(req, res) {
  const encodedName = String(req.headers['x-file-name'] || 'uploaded-reference.mp4');
  let originalFileName = 'uploaded-reference.mp4';
  try { originalFileName = decodeURIComponent(encodedName); } catch { originalFileName = encodedName; }
  originalFileName = path.basename(originalFileName).replace(/[<>:"/\\|?*]/g, '_');
  let title = originalFileName.replace(/\.[^.]+$/, '');
  try { title = req.headers['x-file-title'] ? decodeURIComponent(String(req.headers['x-file-title'])) : title; } catch { /* 제목 헤더가 없으면 파일명을 쓴다. */ }

  const uploadDir = path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const tempPath = path.join(uploadDir, `${Date.now()}-${originalFileName}`);
  const stream = fs.createWriteStream(tempPath, { flags: 'wx' });
  let size = 0;
  let settled = false;

  const fail = (status, message) => {
    if (settled) return;
    settled = true;
    stream.destroy();
    fs.rmSync(tempPath, { force: true });
    sendJson(res, status, { ok: false, error: message });
  };

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      fail(413, '파일은 최대 1GB까지 업로드할 수 있습니다.');
      req.destroy();
    }
  });
  req.on('error', (error) => fail(500, error.message));
  stream.on('error', (error) => fail(500, error.message));

  req.pipe(stream);
  stream.on('finish', () => {
    if (settled) return;
    try {
      const result = stageUploadedReference({ tempFilePath: tempPath, title });
      settled = true;
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      fail(500, error.message);
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'source-finder-helper',
      version: 3,
      capabilities: ['url-analysis', 'file-analysis', 'candidate-metadata', 'candidate-video-verification', 'asset-preview', 'source-board-download-status', 'source-board-download', 'shorts-family-library', 'shorts-family-download', 'shorts-family-split', 'shorts-family-package', 'shorts-family-local-vision', 'shorts-family-batch-originals', 'shorts-family-stream'],
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/source-board/download-status') {
    try {
      sendJson(res, 200, { ok: true, items: getSourceBoardDownloadStatuses() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/source-board/download') {
    try {
      const payload = await readJson(req);
      const result = await downloadOneSourceBoardItem(payload);
      sendJson(res, result.status === 'downloaded' ? 200 : 422, { ok: result.status === 'downloaded', ...result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/asset') {
    const assetPath = resolveAsset(requestUrl.searchParams.get('jobId'), requestUrl.searchParams.get('file'));
    if (!assetPath) {
      sendJson(res, 404, { ok: false, error: '이미지를 찾을 수 없습니다.' });
      return;
    }
    const extension = path.extname(assetPath).toLowerCase();
    const contentType = extension === '.png' ? 'image/png' : 'image/jpeg';
    res.writeHead(200, { ...corsHeaders(contentType), 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(assetPath).pipe(res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/investigate-file') {
    await handleFileUpload(req, res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/investigate') {
    try {
      const payload = await readJson(req);
      if (!payload.url) {
        sendJson(res, 400, { ok: false, error: 'url 필드가 필요합니다.' });
        return;
      }
      const result = await runSourceFinder(payload.url);
      sendJson(res, 200, finishInvestigation(result, req, payload));
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/candidates') {
    try {
      const payload = await readJson(req);
      const urls = [...new Set((Array.isArray(payload.urls) ? payload.urls : [])
        .map((value) => String(value).trim()).filter(Boolean))].slice(0, 20);
      if (urls.length === 0) {
        sendJson(res, 400, { ok: false, error: '후보 URL을 한 개 이상 입력하세요.' });
        return;
      }

      const candidates = urls.map((url) => {
        try {
          return { ok: true, ...inspectCandidate(url) };
        } catch (error) {
          return { ok: false, url, platform: 'unknown', error: error.message };
        }
      });
      const dated = candidates.filter((candidate) => candidate.ok && candidate.publishedAt)
        .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
      sendJson(res, 200, {
        ok: true,
        candidates,
        earliestUrl: dated[0]?.url || null,
        earliestPublishedAt: dated[0]?.publishedAt || null,
        notice: '삭제·비공개 게시물은 확인할 수 없어 현재 확인 가능한 후보만 비교합니다.',
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/verify-candidates') {
    try {
      const payload = await readJson(req);
      if (!payload.jobId || !Array.isArray(payload.urls) || payload.urls.length === 0) {
        sendJson(res, 400, { ok: false, error: 'jobId와 후보 URL이 필요합니다.' });
        return;
      }
      const results = await verifyCandidates(payload.jobId, payload.urls);
      sendJson(res, 200, {
        ok: true,
        results,
        verifiedCount: results.filter((result) => result.ok && result.score >= 55).length,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/shorts-family/library') {
    try {
      sendJson(res, 200, { ok: true, files: listFamilyLibrary() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/shorts-family/recommendation-library') {
    try {
      sendJson(res, 200, { ok: true, files: listFamilyRecommendationLibrary() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/shorts-family/local-vision-status') {
    sendJson(res, 200, { ok: true, ...await getLocalVisionStatus() });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && requestUrl.pathname === '/shorts-family/stream') {
    try {
      const sourcePath = assertSourcePath(requestUrl.searchParams.get('path'));
      streamVideoFile(req, res, sourcePath);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/shorts-family/still') {
    try {
      const image = createFamilyStill({ filePath: requestUrl.searchParams.get('path'), at: requestUrl.searchParams.get('at') });
      res.writeHead(200, corsHeaders('image/jpeg'));
      res.end(image);
    } catch (error) { sendJson(res, 400, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/analyze-all') {
    try {
      const payload = await readJson(req, 4 * 1024 * 1024);
      sendJson(res, 200, { ok: true, ...(await analyzeFamilyCandidates(payload.candidates)) });
    } catch (error) { sendJson(res, 500, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/describe-one') {
    try {
      const payload = await readJson(req, 4 * 1024 * 1024);
      sendJson(res, 200, { ok: true, ...(await describeFamilyCandidate(payload.candidate)) });
    } catch (error) { sendJson(res, 500, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/verify-all') {
    try {
      const payload = await readJson(req, 4 * 1024 * 1024);
      sendJson(res, 200, { ok: true, results: await verifyFamilyCandidates(payload.searches) });
    } catch (error) { sendJson(res, 500, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/upload-reference') {
    await handleFamilyReferenceUpload(req, res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/download') {
    try {
      const payload = await readJson(req);
      const result = downloadBoardSource(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/stage-candidate') {
    try {
      const payload = await readJson(req);
      sendJson(res, 200, { ok: true, ...stageFamilyCandidate(payload) });
    } catch (error) { sendJson(res, 400, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/split') {
    try {
      const payload = await readJson(req);
      const result = splitRankingReference(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/package') {
    try {
      const payload = await readJson(req, 4 * 1024 * 1024);
      const result = packageFamilyProject(payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/open-folder') {
    try {
      const payload = await readJson(req);
      const result = ensureProjectLayout(payload.projectCode);
      openOutputFolder(result.root);
      sendJson(res, 200, { ok: true, projectRoot: result.root });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }


  if (req.method === 'POST' && requestUrl.pathname === '/shorts-family/open-containing-folder') {
    try {
      const payload = await readJson(req);
      const folder = resolveFamilyFolder(payload.path);
      // 이 버튼의 목적은 파일 선택이 아니라 저장 폴더 확인이다.
      // /select 인자는 한글·공백 경로에서 Explorer가 조용히 실패할 수 있으므로 폴더를 직접 연다.
      openOutputFolder(folder);
      sendJson(res, 200, { ok: true, folder });
    } catch (error) { sendJson(res, 400, { ok: false, error: error.message }); }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not Found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('============================================================');
  console.log(`Source Finder 도우미가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log('이 창을 닫으면 URL/파일 분석 기능이 중지됩니다.');
  console.log('============================================================');
});
