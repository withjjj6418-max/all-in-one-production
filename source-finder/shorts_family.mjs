import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const binDir = path.join(__dirname, 'bin');
const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
const ytdlpPath = path.join(binDir, 'yt-dlp.exe');

export const SHORTS_FAMILY_ROOT = path.resolve(
  process.env.SHORTS_FAMILY_SOURCE_ROOT || 'C:\\Users\\withj\\Dropbox\\해짜_소스모음',
);
export const FAMILY_LIBRARY_DIR = path.join(SHORTS_FAMILY_ROOT, '03_아기가족');
export const FAMILY_PROJECTS_DIR = path.join(SHORTS_FAMILY_ROOT, '05_랭킹형쇼츠_프로젝트');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
const RANK_COLORS = ['#ef4444', '#f59e0b', '#a3e635', '#22c55e', '#818cf8'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `${path.basename(command)} 실행에 실패했습니다.`);
  }
  return result;
}

function assertBinaries() {
  for (const binary of [ffmpegPath, ytdlpPath]) {
    if (!fs.existsSync(binary)) throw new Error(`필수 실행 파일을 찾을 수 없습니다: ${binary}`);
  }
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSourcePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!isInside(SHORTS_FAMILY_ROOT, resolved)) throw new Error('허용된 소스 폴더 밖의 파일입니다.');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error('영상 파일을 찾을 수 없습니다.');
  if (!VIDEO_EXTENSIONS.has(path.extname(resolved).toLowerCase())) throw new Error('지원하지 않는 영상 형식입니다.');
  return resolved;
}

export function normalizeBoardTitle(value) {
  const original = String(value || '').trim();
  const ranking = /(^|[\s_\-()[\]{}])ㄹ(?=$|[\s_\-()[\]{}])/u.test(original);
  const clean = original
    .replace(/(^|[\s_\-()[\]{}])ㄹ(?=$|[\s_\-()[\]{}])/gu, '$1')
    .replace(/[<>:"/\\|?*#]/g, ' ')
    .replace(/[\s_\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || '제목없음';
  return { original, clean, ranking, filenameStem: `${clean}${ranking ? '-ra' : ''}` };
}

function uniqueFilenameStem(directory, stem) {
  let candidateStem = stem;
  let suffix = 2;
  const names = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  while (names.some((name) => path.basename(name, path.extname(name)).toLocaleLowerCase('ko-KR') === candidateStem.toLocaleLowerCase('ko-KR'))) {
    candidateStem = `${stem}-${String(suffix).padStart(2, '0')}`;
    suffix += 1;
  }
  return candidateStem;
}

function probeVideo(filePath) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', filePath], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  const output = String(result.stderr || result.stdout || '');
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  const videoMatch = output.match(/Video:\s*[^,]+,[^,]*,\s*(\d+)x(\d+)/i);
  const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/i);
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;
  return {
    duration,
    width: videoMatch ? Number(videoMatch[1]) : null,
    height: videoMatch ? Number(videoMatch[2]) : null,
    fps: fpsMatch ? Number(fpsMatch[1]) : 30,
    hasAudio: /Audio:\s*/i.test(output),
  };
}

export function listFamilyLibrary() {
  assertBinaries();
  fs.mkdirSync(FAMILY_LIBRARY_DIR, { recursive: true });
  fs.mkdirSync(FAMILY_PROJECTS_DIR, { recursive: true });
  return fs.readdirSync(FAMILY_LIBRARY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const filePath = path.join(FAMILY_LIBRARY_DIR, entry.name);
      const stat = fs.statSync(filePath);
      let media = { duration: null, width: null, height: null, fps: 30, hasAudio: false };
      try { media = probeVideo(filePath); } catch { /* 목록은 계속 표시한다. */ }
      return {
        name: entry.name,
        path: filePath,
        rankingReference: /-ra(?:-\d+)?\.[^.]+$/i.test(entry.name) || /^ㄹ(?:_|\s)/u.test(entry.name),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...media,
      };
    })
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function downloadBoardSource({ url, title }) {
  assertBinaries();
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('올바른 영상 URL이 필요합니다.');
  fs.mkdirSync(FAMILY_LIBRARY_DIR, { recursive: true });
  const normalized = normalizeBoardTitle(title);
  const uniqueStem = uniqueFilenameStem(FAMILY_LIBRARY_DIR, normalized.filenameStem);
  const outputTemplate = path.join(FAMILY_LIBRARY_DIR, `${uniqueStem}.%(ext)s`);
  run(ytdlpPath, [
    '--no-playlist', '--no-warnings', '--ffmpeg-location', binDir,
    '-S', 'res:1080,ext:mp4:m4a', '--merge-output-format', 'mp4',
    '-o', outputTemplate, String(url),
  ]);
  const prefix = uniqueStem;
  const downloaded = fs.readdirSync(FAMILY_LIBRARY_DIR)
    .filter((name) => name.startsWith(prefix) && VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((left, right) => fs.statSync(path.join(FAMILY_LIBRARY_DIR, right)).mtimeMs - fs.statSync(path.join(FAMILY_LIBRARY_DIR, left)).mtimeMs)[0];
  if (!downloaded) throw new Error('다운로드된 파일을 확인하지 못했습니다.');
  return { ...normalized, filename: downloaded, path: path.join(FAMILY_LIBRARY_DIR, downloaded) };
}

export function createFamilyStill({ filePath, at = 1 }) {
  assertBinaries();
  const sourcePath = assertSourcePath(filePath);
  const seconds = Math.max(0, Math.min(600, Number(at) || 0));
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', sourcePath,
    '-frames:v', '1', '-vf', 'scale=480:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
  ], { encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout?.length) throw new Error('참고용 스틸컷을 만들지 못했습니다.');
  return Buffer.from(result.stdout);
}

export function resolveFamilyFolder(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!isInside(SHORTS_FAMILY_ROOT, resolved)) throw new Error('허용된 가족 소스 폴더 밖의 경로입니다.');
  const target = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  if (!isInside(SHORTS_FAMILY_ROOT, target)) throw new Error('허용된 가족 소스 폴더 밖의 경로입니다.');
  fs.mkdirSync(target, { recursive: true });
  return target;
}

export function stageFamilyCandidate({ projectCode, filePath, title, index = 1 }) {
  const sourcePath = assertSourcePath(filePath);
  const project = ensureProjectLayout(projectCode);
  const safeTitle = String(title || `candidate-${index}`)
    .replace(/[<>:"/\\|?*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || `candidate-${index}`;
  const extension = path.extname(sourcePath).toLowerCase() || '.mp4';
  const stem = `${String(index).padStart(2, '0')}-${safeTitle}`;
  const uniqueStem = uniqueFilenameStem(path.join(project.root, '01-candidates'), stem);
  const destination = path.join(project.root, '01-candidates', `${uniqueStem}${extension}`);
  fs.copyFileSync(sourcePath, destination);
  return { path: destination, filename: path.basename(destination), folder: path.dirname(destination) };
}

function sceneChanges(filePath) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'info', '-i', filePath,
    '-vf', "select='gt(scene,0.12)',metadata=print:key=lavfi.scene_score",
    '-an', '-f', 'null', 'NUL',
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const output = String(result.stderr || result.stdout || '');
  const lines = output.split(/\r?\n/);
  const changes = [];
  let time = null;
  for (const line of lines) {
    const timeMatch = line.match(/pts_time:([\d.]+)/);
    if (timeMatch) time = Number(timeMatch[1]);
    const scoreMatch = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (scoreMatch && Number.isFinite(time)) {
      changes.push({ time, score: Number(scoreMatch[1]) });
      time = null;
    }
  }
  return changes;
}

function chooseBoundaries(duration, segmentCount, changes) {
  const boundaries = [0];
  const minLength = Math.max(3, Math.min(8, duration / (segmentCount * 2.2)));
  for (let index = 1; index < segmentCount; index += 1) {
    const target = duration * index / segmentCount;
    const window = Math.max(5, duration / segmentCount * 0.42);
    const previous = boundaries.at(-1);
    const candidates = changes.filter((item) => item.time >= previous + minLength && Math.abs(item.time - target) <= window);
    candidates.sort((left, right) => {
      const leftValue = left.score * 2 - Math.abs(left.time - target) / window;
      const rightValue = right.score * 2 - Math.abs(right.time - target) / window;
      return rightValue - leftValue;
    });
    const selected = candidates[0]?.time ?? target;
    boundaries.push(Number(selected.toFixed(3)));
  }
  boundaries.push(duration);
  return boundaries;
}

function safeProjectCode(value) {
  const code = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^\d{4}-[a-z0-9-]+$/.test(code)) throw new Error('프로젝트 코드는 0001-english-title 형식이어야 합니다.');
  return code;
}

export function ensureProjectLayout(projectCode) {
  const code = safeProjectCode(projectCode);
  fs.mkdirSync(FAMILY_PROJECTS_DIR, { recursive: true });
  const root = path.resolve(FAMILY_PROJECTS_DIR, code);
  if (!isInside(FAMILY_PROJECTS_DIR, root)) throw new Error('프로젝트 경로가 올바르지 않습니다.');
  const directories = [
    '00-reference', '01-candidates', '02-korea', '03-japan', '04-source-info', '05-assets', '06-premiere', 'temp-render',
  ];
  for (const directory of directories) fs.mkdirSync(path.join(root, directory), { recursive: true });
  return { code, root };
}

export function splitRankingReference({ filePath, projectCode, segmentCount = 5 }) {
  assertBinaries();
  const sourcePath = assertSourcePath(filePath);
  const count = Math.max(5, Math.min(7, Number(segmentCount) || 5));
  const media = probeVideo(sourcePath);
  if (!media.duration) throw new Error('영상 길이를 확인할 수 없습니다.');
  const project = ensureProjectLayout(projectCode);
  const referenceName = `reference-ra${path.extname(sourcePath).toLowerCase()}`;
  fs.copyFileSync(sourcePath, path.join(project.root, '00-reference', referenceName));
  const changes = sceneChanges(sourcePath);
  const boundaries = chooseBoundaries(media.duration, count, changes);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const rawStart = boundaries[index];
    const rawEnd = boundaries[index + 1];
    const start = index === 0 ? rawStart : Math.min(rawEnd - 0.5, rawStart + 0.28);
    const end = index === count - 1 ? rawEnd : Math.max(start + 0.5, rawEnd - 0.22);
    const referenceRank = count - index;
    const filename = `candidate-${String(index + 1).padStart(2, '0')}-rank${referenceRank}.mp4`;
    const outputPath = path.join(project.root, '01-candidates', filename);
    run(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', outputPath,
    ]);
    candidates.push({
      index: index + 1,
      referenceRank,
      filename,
      path: outputPath,
      rawStart,
      rawEnd,
      recommendedStart: start,
      recommendedEnd: end,
      duration: Number((end - start).toFixed(3)),
      transitionAdjusted: index > 0 || index < count - 1,
    });
  }
  const manifest = {
    version: 1,
    projectCode: project.code,
    reference: sourcePath,
    detectedAt: new Date().toISOString(),
    duration: media.duration,
    requestedSegments: count,
    sceneChangeCount: changes.length,
    boundaries,
    candidates,
    notice: '장면 변화와 예상 순위 간격으로 자동 분리한 초안입니다. 각 구간은 사용자 검수가 필요합니다.',
  };
  fs.writeFileSync(path.join(project.root, '00-reference', 'split-analysis.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { ...manifest, projectRoot: project.root };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fileUrl(filePath) {
  return `file://localhost/${encodeURI(path.resolve(filePath).replace(/\\/g, '/'))}`;
}

function createPremiereXml({ locale, title, ordered, targetDuration }) {
  const fps = 30;
  const perClip = Math.max(1, targetDuration / Math.max(1, ordered.length));
  let cursor = 0;
  const clips = ordered.map((item, index) => {
    const frames = Math.round(perClip * fps);
    const start = cursor;
    const end = start + frames;
    cursor = end;
    const sourceStart = Math.round(Number(item.clipStart || 0) * fps);
    const sourceEnd = sourceStart + frames;
    return `<clipitem id="clip-${locale}-${index + 1}"><name>${xmlEscape(`${item.rank}위 ${item.label}${item.flip ? ' [좌우반전]' : ''}`)}</name><enabled>TRUE</enabled><duration>${frames}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${start}</start><end>${end}</end><in>${sourceStart}</in><out>${sourceEnd}</out><file id="file-${locale}-${index + 1}"><name>${xmlEscape(path.basename(item.localPath))}</name><pathurl>${xmlEscape(fileUrl(item.localPath))}</pathurl><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><duration>${frames}</duration><media><video><samplecharacteristics><width>1080</width><height>1920</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video></media></file></clipitem>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="5"><sequence id="sequence-${locale}"><name>${xmlEscape(title || `ranking-shorts-${locale}`)}</name><duration>${cursor}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><media><video><format><samplecharacteristics><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><width>1080</width><height>1920</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format><track>${clips}</track></video></media></sequence></xmeml>`;
}

function textFilePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function renderLocalePreview({ projectRoot, locale, title, ordered, targetDuration }) {
  if (ordered.length !== 5) return null;
  const outputDir = path.join(projectRoot, locale === 'ko' ? '02-korea' : '03-japan');
  const tempDir = path.join(projectRoot, 'temp-render', locale);
  fs.mkdirSync(tempDir, { recursive: true });
  const logoPath = path.join(projectRoot, '05-assets', locale === 'ko' ? 'logo-korea-dog.png' : 'logo-japan-cat.png');
  // FFmpeg/Fontconfig on Windows cannot reliably parse non-ASCII font paths,
  // so rendering uses the app's ASCII workspace path. Copies are still bundled for handoff.
  const fontSourceDir = path.join(path.resolve(__dirname, '..'), 'public', 'shorts-family', 'fonts');
  const titleFontPath = path.join(fontSourceDir, locale === 'ko' ? 'BlackHanSans-Regular.ttf' : 'NotoSansJP-VF.ttf');
  const rankFontPath = path.join(fontSourceDir, locale === 'ko' ? 'NotoSansKR-VF.ttf' : 'NotoSansJP-VF.ttf');
  if (!fs.existsSync(titleFontPath) || !fs.existsSync(rankFontPath) || !fs.existsSync(logoPath)) return null;
  const perClip = targetDuration / 5;
  const titleParts = locale === 'ja'
    ? String(title || '').split(/[｜|\n]/).map((part) => part.trim()).filter(Boolean)
    : [String(title || '')];
  const normalized = [];
  for (const item of ordered) {
    const input = assertSourcePath(item.localPath);
    const media = probeVideo(input);
    const clipStart = Math.max(0, Number(item.clipStart || 0));
    const requestedEnd = Number(item.clipEnd || 0);
    const available = requestedEnd > clipStart ? requestedEnd - clipStart : Math.max(0.5, (media.duration || perClip) - clipStart);
    const duration = Math.min(perClip, available);
    const titlePath = path.join(tempDir, `title-${item.rank}.txt`);
    fs.writeFileSync(titlePath, titleParts[0] || (locale === 'ko' ? '가족 랭킹 TOP5' : 'どれが1番好き？'), 'utf8');
    const titleSecondPath = path.join(tempDir, `title-second-${item.rank}.txt`);
    if (locale === 'ja') fs.writeFileSync(titleSecondPath, titleParts[1] || '家族のバズった5選', 'utf8');
    const inputArgs = ['-ss', String(clipStart), '-i', input, '-loop', '1', '-i', logoPath];
    if (!media.hasAudio) inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    const flip = item.flip ? ',hflip' : '';
    const subtitleStrategy = String(item.subtitleStrategy || 'auto');
    const foregroundScale = subtitleStrategy === 'crop'
      ? 'scale=1260:1800:force_original_aspect_ratio=decrease'
      : subtitleStrategy === 'auto'
        ? 'scale=1166:1663:force_original_aspect_ratio=decrease'
        : 'scale=1080:1540:force_original_aspect_ratio=decrease';
    const rankDraw = ordered.map((rankItem) => {
      const color = locale === 'ko' ? (RANK_COLORS[rankItem.rank - 1] || '#ffffff') : '#ffffff';
      const alpha = rankItem.rank === item.rank ? '1.0' : locale === 'ko' ? '0.5' : '0.32';
      const label = locale === 'ko' ? String(rankItem.label || '').replace(/\s/g, '').slice(0, 4) : String(rankItem.label || '').slice(0, 18);
      const y = 455 + (rankItem.rank - 1) * 72;
      const labelPath = path.join(tempDir, `rank-${item.rank}-${rankItem.rank}.txt`);
      fs.writeFileSync(labelPath, `${rankItem.rank}. ${label}`, 'utf8');
      const underline = locale === 'ja' && rankItem.rank === item.rank
        ? `drawbox=x=45:y=${y + 52}:w=420:h=7:color=red@0.95:t=fill,`
        : '';
      return `${underline}drawtext=fontfile='${textFilePath(rankFontPath)}':textfile='${textFilePath(labelPath)}':fontcolor=${color}@${alpha}:fontsize=${rankItem.rank === item.rank ? 48 : 43}:borderw=3:bordercolor=black@${alpha}:x=45:y=${y}`;
    }).join(',');
    const titleDraw = locale === 'ko'
      ? `drawtext=fontfile='${textFilePath(titleFontPath)}':textfile='${textFilePath(titlePath)}':fontcolor=white:fontsize=76:borderw=5:bordercolor=#7c3aed:shadowx=4:shadowy=4:shadowcolor=black:x=(w-text_w)/2:y=145`
      : `drawtext=fontfile='${textFilePath(titleFontPath)}':textfile='${textFilePath(titlePath)}':fontcolor=white:fontsize=60:borderw=5:bordercolor=#0284c7:shadowx=3:shadowy=3:shadowcolor=black:x=(w-text_w)/2:y=105,drawtext=fontfile='${textFilePath(titleFontPath)}':textfile='${textFilePath(titleSecondPath)}':fontcolor=#fde047:fontsize=66:borderw=5:bordercolor=#e11d48:shadowx=3:shadowy=3:shadowcolor=black:x=(w-text_w)/2:y=185`;
    const foregroundFilter = subtitleStrategy === 'blur'
      ? `[fg]${foregroundScale},eq=brightness=0.025:saturation=1.08,split=2[front][subtitle];` +
        `[subtitle]crop=iw:260:0:ih-260,gblur=sigma=24[subblur];` +
        `[blur][front]overlay=(W-w)/2:(H-h)/2[base];[base][subblur]overlay=(W-w)/2:H-h,pad=1080:1920:0:380:black[canvas];`
      : `[fg]${foregroundScale},eq=brightness=0.025:saturation=1.08[front];` +
        `[blur][front]overlay=(W-w)/2:(H-h)/2,pad=1080:1920:0:380:black[canvas];`;
    const filter = `[0:v]setpts=PTS-STARTPTS${flip},split=2[bg][fg];` +
      `[bg]scale=1080:1540:force_original_aspect_ratio=increase,crop=1080:1540,gblur=sigma=36,eq=brightness=0.025:saturation=1.08[blur];` +
      foregroundFilter +
      `[1:v]scale=112:112[logo];[canvas][logo]overlay=48:36,` +
      `${titleDraw},${rankDraw},fade=t=in:st=0:d=0.12,fade=t=out:st=${Math.max(0, duration - 0.18).toFixed(3)}:d=0.18[v]`;
    const output = path.join(tempDir, `${item.rank}.mp4`);
    const audioIndex = media.hasAudio ? '0:a:0' : '2:a:0';
    run(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', ...inputArgs,
      '-filter_complex', filter, '-map', '[v]', '-map', audioIndex,
      '-t', String(duration), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-y', output,
    ]);
    normalized.push(output);
  }
  const concatList = path.join(tempDir, 'concat.txt');
  fs.writeFileSync(concatList, normalized.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const output = path.join(outputDir, `preview-${locale}.mp4`);
  run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-movflags', '+faststart', '-y', output]);
  return output;
}

export function packageFamilyProject(payload) {
  assertBinaries();
  const project = ensureProjectLayout(payload.projectCode);
  const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 7) : [];
  if (candidates.length < 5) throw new Error('후보 영상이 최소 5개 필요합니다.');
  for (const item of candidates) item.localPath = assertSourcePath(item.localPath);

  const assetsDir = path.join(project.root, '05-assets');
  for (const asset of ['logo-korea-dog.png', 'logo-japan-cat.png', 'fonts/BlackHanSans-Regular.ttf', 'fonts/NotoSansKR-VF.ttf', 'fonts/NotoSansJP-VF.ttf']) {
    const source = path.join(projectRoot, 'public', 'shorts-family', asset);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(assetsDir, path.basename(asset)));
  }

  const locales = [
    { key: 'ko', dir: '02-korea', title: payload.koreanTitle || '', rankKey: 'koreanRank', labelKey: 'koreanLabel', flipKey: 'flipKorean' },
    { key: 'ja', dir: '03-japan', title: payload.japaneseTitle || '', rankKey: 'japaneseRank', labelKey: 'japaneseLabel', flipKey: 'flipJapanese' },
  ];
  const packaged = {};
  for (const locale of locales) {
    const ordered = candidates.filter((item) => Number(item[locale.rankKey]) >= 1 && Number(item[locale.rankKey]) <= 5)
      .map((item) => ({ ...item, rank: Number(item[locale.rankKey]), label: item[locale.labelKey] || '', flip: Boolean(item[locale.flipKey]) }))
      .sort((left, right) => right.rank - left.rank);
    if (ordered.length !== 5 || new Set(ordered.map((item) => item.rank)).size !== 5) {
      throw new Error(`${locale.key === 'ko' ? '한국' : '일본'}판 순위는 1~5위를 한 번씩 지정해야 합니다.`);
    }
    const localeDir = path.join(project.root, locale.dir);
    fs.writeFileSync(path.join(localeDir, `title-${locale.key}.txt`), locale.title, 'utf8');
    fs.writeFileSync(path.join(localeDir, `ranking-${locale.key}.txt`), ordered.map((item) => `${item.rank}. ${item.label}`).join('\n'), 'utf8');
    fs.writeFileSync(path.join(localeDir, `edit-order-${locale.key}.txt`), ordered.map((item) => `${item.rank}위: ${path.basename(item.localPath)}${item.flip ? ' · 좌우반전' : ''}`).join('\n'), 'utf8');
    const xml = createPremiereXml({ locale: locale.key, title: locale.title, ordered, targetDuration: Number(payload.targetDuration) || 35 });
    fs.writeFileSync(path.join(project.root, '06-premiere', `premiere-${locale.key}.xml`), xml, 'utf8');
    packaged[locale.key] = { ordered, preview: payload.renderPreview === false ? null : renderLocalePreview({ projectRoot: project.root, locale: locale.key, title: locale.title, ordered, targetDuration: Number(payload.targetDuration) || 35 }) };
  }

  const sourceRows = ['candidate,source_title,source_url,local_path,clip_start,clip_end,korean_rank,japanese_rank,flip_korean,flip_japanese'];
  candidates.forEach((item, index) => sourceRows.push([
    index + 1, item.sourceTitle, item.sourceUrl, item.localPath, item.clipStart, item.clipEnd,
    item.koreanRank, item.japaneseRank, item.flipKorean, item.flipJapanese,
  ].map(csvCell).join(',')));
  fs.writeFileSync(path.join(project.root, '04-source-info', 'sources.csv'), `\ufeff${sourceRows.join('\r\n')}`, 'utf8');
  fs.writeFileSync(path.join(project.root, '04-source-info', 'review-checklist.txt'), [
    '□ 아동 위험 행동 및 민감 장면 직접 검수', '□ 7개 후보의 원본/사용 권리 확인', '□ 기존 자막·워터마크가 가려졌는지 확인',
    '□ 한국판·일본판 순위와 표현 확인', '□ 자동 좌우 반전 2개가 문자와 방향성을 왜곡하지 않는지 확인',
    '□ 최종 길이 20~50초 확인', '□ Premiere Pro 2026에서 XML과 미디어 연결 확인',
  ].join('\n'), 'utf8');
  const manifest = { ...payload, projectRoot: project.root, packagedAt: new Date().toISOString(), candidates, outputs: packaged };
  fs.writeFileSync(path.join(project.root, 'project.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { projectCode: project.code, projectRoot: project.root, outputs: packaged };
}
