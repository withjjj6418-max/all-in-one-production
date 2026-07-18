import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { inspectCandidate, runSourceFinder, verifyCandidates } from './source_finder.mjs';

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
  try {
    const child = spawn('explorer.exe', [outputDir], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (error) {
    console.warn(`결과 폴더를 열지 못했습니다: ${error.message}`);
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
      version: 2,
      capabilities: ['url-analysis', 'file-analysis', 'candidate-metadata', 'candidate-video-verification', 'asset-preview'],
    });
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

  sendJson(res, 404, { ok: false, error: 'Not Found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('============================================================');
  console.log(`Source Finder 도우미가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log('이 창을 닫으면 URL/파일 분석 기능이 중지됩니다.');
  console.log('============================================================');
});
