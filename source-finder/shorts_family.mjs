import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

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
export const FAMILY_RECOMMENDATION_DIR = path.resolve(
  process.env.SHORTS_FAMILY_RECOMMENDATION_DIR || 'C:\\Users\\withj\\Dropbox\\source',
);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

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

export function assertSourcePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!isInside(SHORTS_FAMILY_ROOT, resolved) && !isInside(FAMILY_RECOMMENDATION_DIR, resolved)) throw new Error('허용된 소스 폴더 밖의 파일입니다.');
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
  const videoMatch = output.match(/Video:[^\r\n]*?(?:^|[\s,])(\d{2,5})x(\d{2,5})(?=[\s,\[])/im);
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
  return listVideoFiles(FAMILY_LIBRARY_DIR);
}

export function listFamilyRecommendationLibrary() {
  assertBinaries();
  fs.mkdirSync(FAMILY_RECOMMENDATION_DIR, { recursive: true });
  return listVideoFiles(FAMILY_RECOMMENDATION_DIR, true, false);
}

function listVideoFiles(directory, recursive = false, inspectMedia = true) {
  const collect = (currentDirectory) => fs.readdirSync(currentDirectory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) return recursive ? collect(entryPath) : [];
    return entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
  });
  return collect(directory)
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      let media = { duration: null, width: null, height: null, fps: 30, hasAudio: false };
      if (inspectMedia) {
        try { media = probeVideo(filePath); } catch { /* 목록은 계속 표시한다. */ }
      }
      return {
        name: recursive ? path.relative(directory, filePath) : path.basename(filePath),
        path: filePath,
        rankingReference: /-ra(?:-\d+)?\.[^.]+$/i.test(path.basename(filePath)) || /^ㄹ(?:_|\s)/u.test(path.basename(filePath)),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...media,
      };
    })
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function stageUploadedReference({ tempFilePath, title }) {
  const extension = path.extname(tempFilePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension)) throw new Error('지원하지 않는 영상 형식입니다.');
  fs.mkdirSync(FAMILY_LIBRARY_DIR, { recursive: true });
  const normalized = normalizeBoardTitle(`ㄹ ${title || '업로드 레퍼런스'}`);
  const uniqueStem = uniqueFilenameStem(FAMILY_LIBRARY_DIR, normalized.filenameStem);
  const destination = path.join(FAMILY_LIBRARY_DIR, `${uniqueStem}${extension}`);
  fs.renameSync(tempFilePath, destination);
  return { ...normalized, filename: path.basename(destination), path: destination };
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
    '00-reference', '01-candidates', '04-source-info', '05-assets', '06-premiere', 'temp-render',
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
  const pathname = pathToFileURL(path.resolve(filePath)).pathname.replace(/^\/+/, '');
  return `file://localhost/${pathname}`;
}

function createPremiereXml({ locale, title, ordered, targetDuration }) {
  const fps = 30;
  const perClip = Math.max(1, targetDuration / Math.max(1, ordered.length));
  let cursor = 0;
  const clips = ordered.map((item, index) => {
    const media = probeVideo(item.localPath);
    const mediaDuration = Math.max(0.1, Number(media.duration || item.clipEnd || perClip));
    const sourceStartSeconds = Math.max(0, Math.min(Number(item.clipStart || 0), mediaDuration - 0.1));
    const requestedEndSeconds = item.clipEnd === null || item.clipEnd === undefined ? mediaDuration : Number(item.clipEnd);
    const sourceEndSeconds = Math.max(sourceStartSeconds + 0.1, Math.min(requestedEndSeconds, mediaDuration));
    const availableSeconds = sourceEndSeconds - sourceStartSeconds;
    const frames = Math.max(1, Math.round(Math.min(perClip, availableSeconds) * fps));
    const start = cursor;
    const end = start + frames;
    cursor = end;
    const sourceStart = Math.round(sourceStartSeconds * fps);
    const sourceEnd = sourceStart + frames;
    const width = media.width || 1080;
    const height = media.height || 1920;
    const fileDuration = Math.max(sourceEnd, Math.round(mediaDuration * fps));
    const fileId = `file-${locale}-${index + 1}`;
    const videoId = `clip-${locale}-${index + 1}`;
    const audioId = `audio-${locale}-${index + 1}`;
    // 세로 1080x1920 프레임을 꽉 채우도록(cover) 확대 비율을 계산한다. 레터박스로 작게 나오는 것을 막는다.
    const scale = (Math.max(1080 / width, 1920 / height) * 100).toFixed(2);
    const motion = `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>scale</parameterid><name>Scale</name><value>${scale}</value></parameter><parameter><parameterid>center</parameterid><name>Center</name><value><horiz>0</horiz><vert>0</vert></value></parameter></effect></filter>`;
    const file = `<file id="${fileId}"><name>${xmlEscape(path.basename(item.localPath))}</name><pathurl>${xmlEscape(fileUrl(item.localPath))}</pathurl><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><duration>${fileDuration}</duration><media><video><samplecharacteristics><width>${width}</width><height>${height}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>${media.hasAudio ? '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>' : ''}</media></file>`;
    const links = media.hasAudio ? `<link><linkclipref>${videoId}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${index + 1}</clipindex></link><link><linkclipref>${audioId}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${index + 1}</clipindex></link>` : '';
    const video = `<clipitem id="${videoId}"><name>${xmlEscape(`${item.rank}위 ${item.label}${item.flip ? ' [좌우반전]' : ''}`)}</name><enabled>TRUE</enabled><duration>${fileDuration}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${start}</start><end>${end}</end><in>${sourceStart}</in><out>${sourceEnd}</out>${file}${links}${motion}</clipitem>`;
    const audio = media.hasAudio ? `<clipitem id="${audioId}"><name>${xmlEscape(`${item.rank}위 ${item.label}`)}</name><enabled>TRUE</enabled><duration>${fileDuration}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${start}</start><end>${end}</end><in>${sourceStart}</in><out>${sourceEnd}</out><file id="${fileId}"/>${links}</clipitem>` : '';
    return { video, audio };
  });
  const videoClips = clips.map((clip) => clip.video).join('');
  const audioClips = clips.map((clip) => clip.audio).join('');
  const audio = audioClips ? `<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format><track>${audioClips}</track></audio>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="5"><sequence id="sequence-${locale}"><name>${xmlEscape(title || `ranking-shorts-${locale}`)}</name><duration>${cursor}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><media><video><format><samplecharacteristics><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><width>1080</width><height>1920</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format><track>${videoClips}</track></video>${audio}</media></sequence></xmeml>`;
}

function normalizePremiereCandidate(item, index, mediaDir) {
  const sourcePath = assertSourcePath(item.localPath);
  const media = probeVideo(sourcePath);
  if (!media.duration) throw new Error(`${index + 1}번 후보 영상 길이를 확인할 수 없습니다.`);
  const clipStart = Math.max(0, Math.min(Number(item.clipStart || 0), media.duration - 0.1));
  const requestedEnd = item.clipEnd === null || item.clipEnd === undefined ? media.duration : Number(item.clipEnd);
  const clipEnd = Math.max(clipStart + 0.1, Math.min(requestedEnd, media.duration));
  const duration = clipEnd - clipStart;
  const outputPath = path.join(mediaDir, `candidate-${String(index + 1).padStart(2, '0')}.mp4`);
  run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(clipStart), '-t', String(duration), '-i', sourcePath,
    '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', '48000', '-ac', '2', '-b:a', '192k',
    '-movflags', '+faststart', '-y', outputPath,
  ]);
  const normalized = probeVideo(outputPath);
  if (!normalized.duration || !normalized.width || !normalized.height) throw new Error(`${index + 1}번 후보를 Premiere 호환 영상으로 변환하지 못했습니다.`);
  return { ...item, originalLocalPath: sourcePath, localPath: outputPath, clipStart: 0, clipEnd: normalized.duration };
}

export function packageFamilyProject(payload) {
  assertBinaries();
  const project = ensureProjectLayout(payload.projectCode);
  const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 7) : [];
  if (candidates.length < 5) throw new Error('후보 영상이 최소 5개 필요합니다.');
  const selectedIndexes = candidates.map((item, index) => ({ item, index }))
    .filter(({ item }) => Number(item.koreanRank) >= 1 && Number(item.koreanRank) <= 5)
    .map(({ index }) => index);
  if (selectedIndexes.length !== 5) throw new Error('Premiere로 만들 한국판 후보 5개를 먼저 확정해주세요.');

  const assetsDir = path.join(project.root, '05-assets');
  for (const asset of ['logo-korea-dog.png', 'logo-japan-cat.png', 'fonts/BlackHanSans-Regular.ttf', 'fonts/NotoSansKR-VF.ttf', 'fonts/NotoSansJP-VF.ttf']) {
    const source = path.join(projectRoot, 'public', 'shorts-family', asset);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(assetsDir, path.basename(asset)));
  }
  const premiereDir = path.join(project.root, '06-premiere');
  const premiereMediaDir = path.join(premiereDir, 'media');
  fs.mkdirSync(premiereMediaDir, { recursive: true });
  const packagedCandidates = candidates.map((item, index) => selectedIndexes.includes(index)
    ? normalizePremiereCandidate(item, index, premiereMediaDir)
    : item);

  const locales = [
    { key: 'ko', title: payload.koreanTitle || '', rankKey: 'koreanRank', labelKey: 'koreanLabel', flipKey: 'flipKorean' },
    { key: 'ja', title: payload.japaneseTitle || '', rankKey: 'japaneseRank', labelKey: 'japaneseLabel', flipKey: 'flipJapanese' },
  ];
  const packaged = {};
  for (const locale of locales) {
    const ordered = packagedCandidates.filter((item) => Number(item[locale.rankKey]) >= 1 && Number(item[locale.rankKey]) <= 5)
      .map((item) => ({ ...item, rank: Number(item[locale.rankKey]), label: item[locale.labelKey] || '', flip: Boolean(item[locale.flipKey]) }))
      .sort((left, right) => right.rank - left.rank);
    if (ordered.length !== 5 || new Set(ordered.map((item) => item.rank)).size !== 5) {
      throw new Error(`${locale.key === 'ko' ? '한국' : '일본'}판 순위는 1~5위를 한 번씩 지정해야 합니다.`);
    }
    const script = [locale.title, '', ...ordered.map((item) => `${item.rank}위: ${item.label}`)].join('\n');
    fs.writeFileSync(path.join(premiereDir, `title-ranking-${locale.key}.txt`), script, 'utf8');
    const xml = createPremiereXml({ locale: locale.key, title: locale.title, ordered, targetDuration: Number(payload.targetDuration) || 35 });
    fs.writeFileSync(path.join(premiereDir, `premiere-${locale.key}.xml`), xml, 'utf8');
    packaged[locale.key] = { ordered };
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
