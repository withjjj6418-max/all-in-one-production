import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_TARGET_DIR = 'C:/Users/withj/Dropbox/source';
const YTDLP_PATH = path.join(projectRoot, 'source-finder', 'bin', 'yt-dlp.exe');
const FFMPEG_PATH = path.join(projectRoot, 'source-finder', 'bin', 'ffmpeg.exe');
const FINAL_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
const BROWSER_USER_DATA_CANDIDATES = [
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') : '',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') : '',
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Google', 'Chrome', 'User Data') : '',
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data') : '',
].filter(Boolean);

function resolveBrowserProfile() {
  for (const userDataDir of BROWSER_USER_DATA_CANDIDATES) {
    if (!fs.existsSync(userDataDir)) continue;

    const profileDirs = [path.join(userDataDir, 'Default')];
    const extraProfiles = fs.readdirSync(userDataDir)
      .filter((name) => /^Profile \d+$/.test(name) || name === 'Default')
      .sort();

    for (const entry of extraProfiles) {
      const candidate = path.join(userDataDir, entry);
      if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'Cookies'))) {
        profileDirs.push(candidate);
      }
    }

    const selected = profileDirs.find((candidate) => fs.existsSync(candidate));
    if (selected) {
      return {
        userDataDir,
        profileDir: path.basename(selected),
        profilePath: selected,
        channel: userDataDir.includes(`${path.sep}Google${path.sep}Chrome${path.sep}`) ? 'chrome' : 'msedge',
      };
    }
  }

  return null;
}

function parseArgs(argv) {
  const result = {
    dryRun: false,
    limit: null,
    outputDir: null,
    category: null,
    source: 'browser',
    inputFile: null,
    resume: false,
    concurrency: 1,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--dry-run') result.dryRun = true;
    else if (current === '--resume') result.resume = true;
    else if (current === '--concurrency' && argv[index + 1]) result.concurrency = Number(argv[index + 1]);
    else if (current === '--limit' && argv[index + 1]) result.limit = Number(argv[index + 1]);
    else if (current === '--category' && argv[index + 1]) result.category = argv[index + 1];
    else if (current === '--source' && argv[index + 1]) result.source = argv[index + 1];
    else if (current === '--input' && argv[index + 1]) result.inputFile = path.resolve(projectRoot, argv[index + 1]);
    else if (current === '--out' && argv[index + 1]) result.outputDir = path.resolve(projectRoot, argv[index + 1]);
    else if (current === '--help' || current === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (Number.isNaN(result.limit)) {
    throw new Error(' --limit 값은 숫자여야 합니다. ');
  }
  if (!Number.isInteger(result.concurrency) || result.concurrency < 1 || result.concurrency > 8) {
    throw new Error('--concurrency 값은 1~8 사이의 정수여야 합니다.');
  }

  return result;
}

function printHelp() {
  console.log(`사용법:
  node scripts/download-source-board.mjs [옵션]

옵션:
  --dry-run        실제 다운로드를 하지 않고 시뮬레이션만 수행
  --limit N        최대 N개만 처리
  --category NAME  특정 카테고리만 처리
  --source MODE    소스 수집 방식: browser, login 또는 db (기본: browser)
  --input FILE     이전 모의 실행의 download-report.json을 입력으로 사용
  --resume         출력 폴더의 기존 리포트를 읽고 처리 완료 항목을 건너뜀
  --concurrency N  동시 다운로드 수, 1~8 (기본: 1)
  --out DIR        저장 루트 지정 (기본: C:/Users/withj/Dropbox/source)
  --help           도움말 출력
`);
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }

  return values;
}

function getSupabaseConfig() {
  const envFile = readEnvFile(path.join(projectRoot, '.env.local'));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || envFile.NEXT_PUBLIC_SUPABASE_URL || envFile.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || envFile.NEXT_PUBLIC_SUPABASE_ANON_KEY || envFile.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL/anon key를 찾을 수 없습니다. .env.local 또는 환경변수를 확인하세요.');
  }

  return { supabaseUrl, supabaseKey };
}

async function fetchResearchSources(categoryFilter = null, sourceMode = 'browser') {
  if (sourceMode === 'login') {
    return fetchFromInteractiveLogin(categoryFilter);
  }

  if (sourceMode === 'browser') {
    const records = await fetchFromResearchPage(categoryFilter);
    if (records.length) return records;
    console.log('브라우저 방식으로 소스를 찾지 못해 DB 폴백을 시도합니다.');
  }

  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/research_sources`);
  url.searchParams.set('select', 'id,category,title,url,created_at');
  url.searchParams.set('order', 'created_at.desc');

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase 조회 실패: ${response.status} ${text}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  let records = payload.filter((item) => typeof item?.url === 'string' && item.url.trim());
  if (categoryFilter) {
    records = records.filter((item) => String(item.category || '미분류').trim() === categoryFilter.trim());
  }

  return records;
}

function captureRpcRequest(response) {
  const request = response.request();
  const headers = request.headers();
  return {
    url: request.url(),
    method: request.method(),
    body: request.postData() || '{}',
    headers: {
      accept: headers.accept || 'application/json',
      apikey: headers.apikey,
      authorization: headers.authorization,
      'content-type': headers['content-type'] || 'application/json',
    },
  };
}

async function fetchAllRpcPages(rpcRequest) {
  if (!rpcRequest?.headers?.apikey || !rpcRequest?.headers?.authorization) {
    throw new Error('게시판 요청의 로그인 인증정보를 확인하지 못했습니다.');
  }

  const pageSize = 1000;
  const records = [];

  for (let offset = 0; offset < 100000; offset += pageSize) {
    const pageUrl = new URL(rpcRequest.url);
    pageUrl.searchParams.set('offset', String(offset));
    pageUrl.searchParams.set('limit', String(pageSize));
    const response = await fetch(pageUrl, {
      method: rpcRequest.method,
      headers: rpcRequest.headers,
      body: rpcRequest.method === 'GET' ? undefined : rpcRequest.body,
    });

    if (!response.ok) {
      throw new Error(`게시판 페이지 조회 실패: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('게시판 페이지 응답 형식이 올바르지 않습니다.');
    records.push(...payload);
    if (payload.length < pageSize) return records;
  }

  throw new Error('게시판 항목이 안전 조회 한도(100,000개)를 초과했습니다.');
}

async function fetchFromInteractiveLogin(categoryFilter = null) {
  const { chromium } = await import('playwright');
  const temporaryProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'source-board-login-'));
  let context = null;

  try {
    let rpcRecords = null;
    let rpcRequest = null;
    context = await chromium.launchPersistentContext(temporaryProfile, {
      channel: 'chrome',
      headless: false,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });

    const page = context.pages()[0] || await context.newPage();
    page.on('response', async (response) => {
      if (!response.url().includes('/rest/v1/rpc/get_sources_with_nickname') || !response.ok()) return;
      try {
        const payload = await response.json();
        if (Array.isArray(payload)) {
          rpcRecords = payload;
          rpcRequest = captureRpcRequest(response);
        }
      } catch {
        // 로그인 후 페이지를 다시 열어 한 번 더 시도한다.
      }
    });

    await page.goto('https://all-in-one-production.vercel.app/research', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    if (new URL(page.url()).pathname.startsWith('/login')) {
      console.log('열린 Chrome 창에서 로그인해 주세요. 로그인 완료를 최대 10분 동안 기다립니다.');
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10 * 60 * 1000 });
    }

    await page.goto('https://all-in-one-production.vercel.app/research', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(8000);

    if (!Array.isArray(rpcRecords)) {
      throw new Error('로그인은 확인됐지만 게시판 데이터 응답을 읽지 못했습니다.');
    }

    let records = (rpcRecords.length === 1000 ? await fetchAllRpcPages(rpcRequest) : rpcRecords)
      .filter((item) => typeof item?.url === 'string' && item.url.trim());
    if (categoryFilter) {
      records = records.filter((item) => String(item.category || '미분류').trim() === categoryFilter.trim());
    }
    return records;
  } finally {
    if (context) await context.close().catch(() => {});
    const resolvedTemp = path.resolve(temporaryProfile);
    const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
    if (resolvedTemp.startsWith(tempRoot) && path.basename(resolvedTemp).startsWith('source-board-login-')) {
      fs.rmSync(resolvedTemp, { recursive: true, force: true });
    }
  }
}

async function fetchFromResearchPage(categoryFilter = null) {
  try {
    const { chromium } = await import('playwright');
    const profile = resolveBrowserProfile();

    if (!profile) {
      console.warn('로그인된 Chrome / Edge 프로필을 찾지 못했습니다. 브라우저 프로필이 있어야 같은 세션으로 페이지를 읽을 수 있습니다.');
      return [];
    }

    const context = await chromium.launchPersistentContext(profile.userDataDir, {
      channel: profile.channel,
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        `--profile-directory=${profile.profileDir}`,
      ],
    });

    try {
      const page = context.pages()[0] || await context.newPage();
      const pageUrl = 'https://all-in-one-production.vercel.app/research';
      let rpcRecords = null;
      let rpcRequest = null;

      page.on('response', async (response) => {
        if (!response.url().includes('/rest/v1/rpc/get_sources_with_nickname') || !response.ok()) return;
        try {
          const payload = await response.json();
          if (Array.isArray(payload)) {
            rpcRecords = payload;
            rpcRequest = captureRpcRequest(response);
          }
        } catch {
          // 응답 본문을 읽지 못하면 아래의 안전한 DOM 수집을 시도한다.
        }
      });

      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(8000);

      if (Array.isArray(rpcRecords)) {
        let records = (rpcRecords.length === 1000 ? await fetchAllRpcPages(rpcRequest) : rpcRecords)
          .filter((item) => typeof item?.url === 'string' && item.url.trim());
        if (categoryFilter) {
          records = records.filter((item) => String(item.category || '미분류').trim() === categoryFilter.trim());
        }
        return records;
      }

      const rows = await page.evaluate(() => {
        const textCleaner = (value) => (value || '').replace(/\s+/g, ' ').trim();
        const categoryNodes = [...document.querySelectorAll('h2')]
          .map((heading) => {
            const rawText = textCleaner(heading.textContent);
            if (!rawText || /소스 게시판|검색|전체|카테고리/i.test(rawText)) return null;
            const container = heading.closest('div');
            return { heading: rawText, container };
          })
          .filter(Boolean);

        const results = [];

        for (const { heading, container } of categoryNodes) {
          if (!container) continue;
          const items = [...container.querySelectorAll('h3, li, div')];
          for (const item of items) {
            const title = textCleaner(item.textContent);
            const href = item.querySelector('a[href]')?.href || item.querySelector('button[title]')?.closest('a[href]')?.href || '';
            if (!href || !/^https?:\/\//i.test(href)) continue;
            if (title.length < 2 || title.length > 200) continue;
            if (/^\d+$/.test(title)) continue;
            results.push({ category: heading, title, url: href });
          }
        }

        return results;
      });

      const filtered = rows.filter((item) => typeof item?.url === 'string' && item.url.trim());
      if (categoryFilter) {
        return filtered.filter((item) => String(item.category || '미분류').trim() === categoryFilter.trim());
      }
      return filtered;
    } finally {
      await context.close();
    }
  } catch (error) {
    console.warn('브라우저 소스 수집 실패:', error.message || error);
    return [];
  }
}

function stripInvalidPathChars(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/g, '')
    .replace(/^\.+/g, '')
    .slice(0, 120) || '제목없음';
}

function safeFolderName(category) {
  return stripInvalidPathChars(category || '미분류');
}

function safeVideoStem(title) {
  return stripInvalidPathChars(title || '영상');
}

function ensureOutputRoot(rootPath) {
  fs.mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

function uniqueDestination(folder, stem, ext, reservedPaths = new Set()) {
  const normalizedExt = ext && ext.startsWith('.') ? ext : `.${ext || 'mp4'}`;
  const candidates = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  let candidateStem = stem;
  let suffix = 1;

  while (reservedPaths.has(path.resolve(folder, `${candidateStem}${normalizedExt}`).toLowerCase()) || candidates.some((name) => {
    const actualStem = path.basename(name, path.extname(name));
    return actualStem.toLowerCase() === candidateStem.toLowerCase();
  })) {
    candidateStem = `${stem} ${suffix}`;
    suffix += 1;
  }

  return path.join(folder, `${candidateStem}${normalizedExt}`);
}

function firstMatchingFile(folder, stem) {
  if (!fs.existsSync(folder)) return null;
  const entries = fs.readdirSync(folder)
    .filter((name) => FINAL_VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => name.toLowerCase().startsWith(stem.toLowerCase()))
    .sort((a, b) => fs.statSync(path.join(folder, b)).mtimeMs - fs.statSync(path.join(folder, a)).mtimeMs);

  const exact = entries.find((name) => path.basename(name, path.extname(name)).toLowerCase() === stem.toLowerCase());
  return exact ? path.join(folder, exact) : entries[0] ? path.join(folder, entries[0]) : null;
}

function buildOutTemplate(folder, stem) {
  return path.join(folder, `${stem}.%(ext)s`);
}

function parseYtDlpError(result) {
  const message = [result?.stderr, result?.stdout].filter(Boolean).join('\n').trim();
  return message || '다운로드 실패';
}

function checkBinaries() {
  if (!fs.existsSync(YTDLP_PATH)) throw new Error(`yt-dlp를 찾을 수 없습니다: ${YTDLP_PATH}`);
  if (!fs.existsSync(FFMPEG_PATH)) throw new Error(`ffmpeg를 찾을 수 없습니다: ${FFMPEG_PATH}`);
}

function nonVideoPageReason(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const pathname = url.pathname.replace(/\/+$/, '');

    if ((host === 'youtube.com' || host === 'youtu.be') && (
      /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/i.test(pathname)
      || pathname === '/feed'
    )) return '단일 영상이 아닌 YouTube 채널/목록 링크입니다.';

    if (host === 'instagram.com' && !/^\/(?:reel|reels|p|tv)\//i.test(`${pathname}/`)) {
      return '단일 영상이 아닌 Instagram 프로필/페이지 링크입니다.';
    }

    if (host === 'tiktok.com' && /^\/@[^/]+$/i.test(pathname)) {
      return '단일 영상이 아닌 TikTok 프로필 링크입니다.';
    }
  } catch {
    return '올바르지 않은 URL입니다.';
  }
  return null;
}

function readRecordsFromReport(filePath, categoryFilter = null) {
  if (!fs.existsSync(filePath)) throw new Error(`입력 리포트를 찾을 수 없습니다: ${filePath}`);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(payload?.items)) throw new Error('입력 리포트에 items 목록이 없습니다.');
  let records = payload.items.filter((item) => typeof item?.url === 'string' && item.url.trim());
  if (categoryFilter) {
    records = records.filter((item) => String(item.category || '미분류').trim() === categoryFilter.trim());
  }
  return records;
}

function runYtDlp(args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const child = spawn(YTDLP_PATH, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { if (stdout.length < 64 * 1024 * 1024) stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 64 * 1024 * 1024) stderr += chunk.toString(); });
    const timeout = setTimeout(() => {
      timedOut = true;
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      killer.on('error', () => child.kill());
    }, timeoutMs);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ status: 1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ status: timedOut ? 1 : code, stdout, stderr: timedOut ? `${stderr}\n처리 시간 초과` : stderr });
    });
  });
}

async function downloadSingleVideo({ url, title, folderPath, destinationPath = null, dryRun = false }) {
  const fileStem = safeVideoStem(title || '영상');
  const candidatePath = destinationPath || uniqueDestination(folderPath, fileStem, '.mp4');
  const candidateStem = path.basename(candidatePath, path.extname(candidatePath));
  const outputTemplate = buildOutTemplate(folderPath, candidateStem);

  if (dryRun) {
    return {
      status: 'dry-run',
      title,
      url,
      path: candidatePath,
      reason: 'dry-run',
    };
  }

  const pageReason = nonVideoPageReason(url);
  if (pageReason) {
    return { status: 'failed', title, url, path: candidatePath, reason: pageReason };
  }

  const preflight = await runYtDlp([
    '--no-playlist', '--no-warnings', '--simulate', '--socket-timeout', '15',
    '--retries', '1', '--extractor-retries', '1', url,
  ], 30 * 1000);
  if (preflight.status !== 0) {
    return { status: 'failed', title, url, path: candidatePath, reason: parseYtDlpError(preflight) };
  }

  const result = await runYtDlp([
      '--no-playlist', '--no-warnings', '--no-overwrites', '--windows-filenames',
      '--socket-timeout', '30', '--retries', '2', '--fragment-retries', '2', '--extractor-retries', '1',
      '--merge-output-format', 'mp4', '--ffmpeg-location', path.dirname(FFMPEG_PATH),
      '-o', outputTemplate, url,
  ], 15 * 60 * 1000);

  if (result.status !== 0) {
    const errorMessage = parseYtDlpError(result);
    return {
      status: 'failed',
      title,
      url,
      path: candidatePath,
      reason: errorMessage,
    };
  }

  const downloadedPath = firstMatchingFile(folderPath, candidateStem);
  if (!downloadedPath) {
    return {
      status: 'failed',
      title,
      url,
      path: candidatePath,
      reason: '다운로드는 완료됐지만 생성 파일을 찾지 못했습니다.',
    };
  }

  return {
    status: 'downloaded',
    title,
    url,
    path: downloadedPath,
    reason: '완료',
  };
}

function writeReport(rootDir, report) {
  const summaryPath = path.join(rootDir, 'download-report.json');
  const textPath = path.join(rootDir, 'download-report.txt');

  fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2), 'utf8');
  const lines = [
    `대상 루트: ${report.rootDir}`,
    `생성 시각: ${report.generatedAt}`,
    `총 처리: ${report.total}`,
    `다운로드 완료: ${report.downloaded.length}`,
    `다운불가: ${report.failed.length}`,
    '',
    '=== 다운로드 완료 ===',
    ...report.downloaded.map((item) => `- ${item.category} / ${item.title} -> ${item.path}`),
    '',
    '=== 다운불가 ===',
    ...report.failed.map((item) => `- ${item.category} / ${item.title} -> ${item.reason}`),
  ];
  fs.writeFileSync(textPath, lines.join('\n'), 'utf8');
}

function readDownloadReport(rootDir = DEFAULT_TARGET_DIR) {
  const resolvedRoot = path.resolve(rootDir);
  const reportPath = path.join(resolvedRoot, 'download-report.json');
  if (!fs.existsSync(reportPath)) {
    return {
      generatedAt: new Date().toISOString(),
      rootDir: resolvedRoot,
      total: 0,
      downloaded: [],
      failed: [],
      items: [],
    };
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(report?.items) || !Array.isArray(report?.downloaded) || !Array.isArray(report?.failed)) {
    throw new Error('기존 다운로드 리포트의 형식이 올바르지 않습니다.');
  }
  return report;
}

export function getSourceBoardDownloadStatuses(rootDir = DEFAULT_TARGET_DIR) {
  const report = readDownloadReport(rootDir);
  return report.items.map((item) => ({
    url: String(item.url || '').trim(),
    status: item.status === '다운로드 완료' && item.path && fs.existsSync(item.path)
      ? 'downloaded'
      : item.status === '다운불가'
        ? 'failed'
        : 'pending',
  }));
}

export async function downloadOneSourceBoardItem({ url, title, category, rootDir = DEFAULT_TARGET_DIR }) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) throw new Error('다운로드할 영상 URL이 필요합니다.');

  const targetRoot = ensureOutputRoot(path.resolve(rootDir));
  const report = readDownloadReport(targetRoot);
  const existing = report.items.find((item) => String(item.url || '').trim() === cleanUrl);
  if (existing?.status === '다운로드 완료' && existing.path && fs.existsSync(existing.path)) {
    return { status: 'downloaded', path: existing.path, alreadyDownloaded: true };
  }
  if (existing?.status === '다운불가') {
    return { status: 'failed', reason: existing.reason || '이전에 다운로드 불가로 판정된 영상입니다.' };
  }

  checkBinaries();
  const categoryName = String(category || '미분류').trim() || '미분류';
  const cleanTitle = String(title || '').trim() || new URL(cleanUrl).hostname || '영상';
  const folderPath = path.join(targetRoot, safeFolderName(categoryName));
  fs.mkdirSync(folderPath, { recursive: true });
  const destinationPath = uniqueDestination(folderPath, safeVideoStem(cleanTitle), '.mp4');
  const result = await downloadSingleVideo({
    url: cleanUrl,
    title: cleanTitle,
    folderPath,
    destinationPath,
  });

  const reportItem = result.status === 'downloaded'
    ? { category: categoryName, title: cleanTitle, url: cleanUrl, path: result.path, status: '다운로드 완료' }
    : { category: categoryName, title: cleanTitle, url: cleanUrl, path: result.path, status: '다운불가', reason: result.reason };

  // 같은 URL의 오래된 미완료 기록이 있다면 새 판정으로 교체한다.
  report.items = report.items.filter((item) => String(item.url || '').trim() !== cleanUrl);
  report.downloaded = report.downloaded.filter((item) => String(item.url || '').trim() !== cleanUrl);
  report.failed = report.failed.filter((item) => String(item.url || '').trim() !== cleanUrl);
  report.items.push(reportItem);
  if (result.status === 'downloaded') report.downloaded.push(reportItem);
  else report.failed.push(reportItem);
  report.generatedAt = new Date().toISOString();
  report.rootDir = targetRoot;
  report.total = report.items.length;
  writeReport(targetRoot, report);

  return result.status === 'downloaded'
    ? { status: 'downloaded', path: result.path, alreadyDownloaded: false }
    : { status: 'failed', reason: result.reason };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = args.outputDir || process.env.SOURCE_BOARD_DOWNLOAD_DIR || DEFAULT_TARGET_DIR;
  const targetRoot = ensureOutputRoot(path.resolve(outputDir));

  checkBinaries();

  const records = args.inputFile
    ? readRecordsFromReport(args.inputFile, args.category)
    : await fetchResearchSources(args.category, args.source);
  if (!records.length) {
    console.log('조회된 소스가 없습니다.');
    return;
  }

  const limited = args.limit !== null ? records.slice(0, Number(args.limit)) : records;
  const grouped = new Map();

  for (const item of limited) {
    const categoryName = String(item.category || '미분류').trim() || '미분류';
    if (!grouped.has(categoryName)) grouped.set(categoryName, []);
    grouped.get(categoryName).push(item);
  }

  const existingReportPath = path.join(targetRoot, 'download-report.json');
  let previousReport = null;
  if (args.resume && fs.existsSync(existingReportPath)) {
    previousReport = JSON.parse(fs.readFileSync(existingReportPath, 'utf8'));
    if (!Array.isArray(previousReport?.items)) throw new Error('기존 진행 리포트의 형식이 올바르지 않습니다.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rootDir: targetRoot,
    total: limited.length,
    downloaded: previousReport?.downloaded || [],
    failed: previousReport?.failed || [],
    items: previousReport?.items || [],
  };

  const itemKey = (category, title, url) => `${category}\u0000${title}\u0000${url}`;
  const completedCounts = new Map();
  for (const item of report.items) {
    const key = itemKey(item.category, item.title, item.url);
    completedCounts.set(key, (completedCounts.get(key) || 0) + 1);
  }

  const reservedPaths = new Set();
  const tasks = [];
  for (const [categoryName, items] of grouped.entries()) {
    const folderName = safeFolderName(categoryName);
    const folderPath = path.join(targetRoot, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    console.log(`\n[카테고리] ${categoryName} -> ${folderPath}`);

    for (const item of items) {
      const title = String(item.title || '').trim() || new URL(item.url).hostname || '영상';
      const key = itemKey(categoryName, title, item.url);
      const completedCount = completedCounts.get(key) || 0;
      if (completedCount > 0) {
        completedCounts.set(key, completedCount - 1);
        continue;
      }

      const fileStem = safeVideoStem(title);
      const destinationPath = uniqueDestination(folderPath, fileStem, '.mp4', reservedPaths);
      reservedPaths.add(path.resolve(destinationPath).toLowerCase());
      tasks.push({ categoryName, title, url: item.url, folderPath, destinationPath });
    }
  }

  console.log(`\n남은 처리: ${tasks.length}개 / 동시 다운로드: ${args.concurrency}개`);
  let taskIndex = 0;

  async function worker() {
    while (taskIndex < tasks.length) {
      const currentIndex = taskIndex;
      taskIndex += 1;
      const task = tasks[currentIndex];
      const result = await downloadSingleVideo({
        url: task.url,
        title: task.title,
        folderPath: task.folderPath,
        destinationPath: task.destinationPath,
        dryRun: args.dryRun,
      });

      if (result.status === 'downloaded' || result.status === 'dry-run') {
        console.log(`✅ ${task.title} : ${result.status === 'dry-run' ? '시뮬레이션' : '다운로드 완료'}`);
        const reportItem = {
          category: task.categoryName,
          title: task.title,
          url: task.url,
          path: result.path,
          status: result.status === 'dry-run' ? '모의 실행' : '다운로드 완료',
        };
        report.downloaded.push(reportItem);
        report.items.push(reportItem);
      } else {
        console.log(`⚠️ ${task.title} : ${result.reason}`);
        const reportItem = {
          category: task.categoryName,
          title: task.title,
          url: task.url,
          path: result.path,
          status: '다운불가',
          reason: result.reason,
        };
        report.failed.push(reportItem);
        report.items.push(reportItem);
      }

      // 긴 일괄 작업이 중단되더라도 여기까지의 결과는 보존한다.
      writeReport(targetRoot, report);
    }
  }

  await Promise.all(Array.from({ length: Math.min(args.concurrency, tasks.length || 1) }, () => worker()));

  writeReport(targetRoot, report);

  const summaryText = `완료: ${report.downloaded.length}개 / 다운불가: ${report.failed.length}개 / 총: ${report.total}개`;
  console.log(`\n${summaryText}`);
  console.log(`리포트 위치: ${path.join(targetRoot, 'download-report.json')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('오류:', error.message || error);
    process.exit(1);
  });
}
