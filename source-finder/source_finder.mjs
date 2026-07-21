import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import nodePath from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

const binDir = nodePath.join(__dirname, 'bin');
const ytdlpPath = nodePath.join(binDir, 'yt-dlp.exe');
const ffmpegPath = nodePath.join(binDir, 'ffmpeg.exe');

function requireBinaries() {
  for (const binary of [ytdlpPath, ffmpegPath]) {
    if (!fs.existsSync(binary)) {
      throw new Error(`필수 도구를 찾을 수 없습니다: ${binary}`);
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `${nodePath.basename(command)} 실행에 실패했습니다.`);
  }

  return result;
}

function isWebUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function compactTitle(value) {
  return String(value || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[\\/:*?"<>|#[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function formatDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function detectPlatform(url = '') {
  const host = (() => {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
  })();
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('instagram.com')) return 'instagram';
  return host ? 'web' : 'file';
}

function buildSearchLinks(title, uploader) {
  const query = compactTitle([title, uploader].filter(Boolean).join(' '));
  const encoded = encodeURIComponent(query);
  const google = (site) => `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${query}`)}`;

  return [
    { platform: 'youtube', label: 'YouTube에서 찾기', url: `https://www.youtube.com/results?search_query=${encoded}` },
    { platform: 'youtube', label: 'Google에서 YouTube Shorts 찾기', url: google('youtube.com/shorts') },
    { platform: 'tiktok', label: 'TikTok에서 찾기', url: `https://www.tiktok.com/search?q=${encoded}` },
    { platform: 'tiktok', label: 'Google에서 TikTok 찾기', url: google('tiktok.com') },
    { platform: 'instagram', label: 'Google에서 Instagram Reels 찾기', url: google('instagram.com/reel') },
    { platform: 'web', label: '웹 전체에서 찾기', url: `https://www.google.com/search?q=${encoded}` },
    { platform: 'lens', label: 'Google Lens로 대표 프레임 찾기', url: 'https://lens.google.com/' },
  ];
}

function readInfo(infoJsonPath, fallbackTitle, source) {
  const fallback = {
    title: compactTitle(fallbackTitle) || '제목 없음',
    uploader: null,
    uploadDate: null,
    duration: null,
    sourceUrl: isWebUrl(source) ? source : null,
    platform: isWebUrl(source) ? detectPlatform(source) : 'file',
  };

  if (!fs.existsSync(infoJsonPath)) return fallback;

  try {
    const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
    return {
      title: info.title || fallback.title,
      uploader: info.uploader || info.channel || info.creator || null,
      uploadDate: formatDate(info.upload_date) || (info.timestamp ? new Date(info.timestamp * 1000).toISOString().slice(0, 10) : null),
      duration: Number(info.duration) || null,
      sourceUrl: info.webpage_url || fallback.sourceUrl,
      platform: detectPlatform(info.webpage_url || source),
    };
  } catch {
    return fallback;
  }
}

function extractDuration(videoPath) {
  // 일부 Windows Smart App Control 환경은 배포본의 ffprobe.exe만 차단한다.
  // FFmpeg가 입력 헤더를 읽을 때 출력하는 Duration 값을 사용하면 별도 probe 바이너리가 필요 없다.
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', videoPath], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const match = String(result.stderr || result.stdout || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  const duration = match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('영상 길이를 확인할 수 없습니다.');
  }
  return duration;
}

function extractFrames(videoPath, framesDir, duration) {
  const frameCount = Math.max(6, Math.min(30, Math.ceil(duration / 2)));
  const interval = Math.max(0.25, duration / frameCount);
  run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vf', `fps=1/${interval},scale=640:-2`,
    '-frames:v', String(frameCount), '-q:v', '2',
    nodePath.join(framesDir, 'frame_%03d.jpg'),
  ]);

  const frameFiles = fs.readdirSync(framesDir)
    .filter((file) => /^frame_\d+\.jpg$/i.test(file))
    .sort();
  if (frameFiles.length === 0) throw new Error('대표 프레임을 추출하지 못했습니다.');

  const contactSheetPath = nodePath.join(framesDir, 'contact_sheet.jpg');
  run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', nodePath.join(framesDir, 'frame_%03d.jpg'),
    '-vf', 'scale=320:-2,tile=5x6:padding=6:margin=6:color=white',
    '-frames:v', '1', '-q:v', '2', contactSheetPath,
  ]);

  const selected = [];
  const selectedCount = Math.min(4, frameFiles.length);
  for (let i = 0; i < selectedCount; i += 1) {
    const index = Math.min(frameFiles.length - 1, Math.floor((i + 0.5) * frameFiles.length / selectedCount));
    selected.push(frameFiles[index]);
  }

  const croppedDir = nodePath.join(framesDir, 'cropped');
  fs.mkdirSync(croppedDir, { recursive: true });
  return selected.map((file, index) => {
    const outputName = `representative_${index + 1}.jpg`;
    const relativePath = nodePath.posix.join('frames', 'cropped', outputName);
    const inputFrame = nodePath.join(framesDir, file);
    const detection = spawnSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'verbose', '-loop', '1', '-i', inputFrame,
      '-t', '0.2', '-vf', 'cropdetect=limit=24:round=2:reset=0', '-f', 'null', 'NUL',
    ], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    const detectedCrops = [...String(detection.stderr || '').matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
    const crop = detectedCrops.at(-1)?.[1];
    let searchCrop = crop;
    if (crop) {
      const [width, height, x, y] = crop.split(':').map(Number);
      // 위쪽 검은 설명 영역이 발견된 재편집본은 실제 장면 내부의 상단 자막까지 제외한다.
      // Vision이 장면 대신 "screenshot" 같은 재편집 문구를 검색하는 오탐을 막기 위한 검색용 crop이다.
      if (y >= 20 && height >= 240) {
        const trimTop = Math.floor((height * 0.32) / 2) * 2;
        const trimBottom = Math.floor((height * 0.05) / 2) * 2;
        searchCrop = `${width}:${height - trimTop - trimBottom}:${x}:${y + trimTop}`;
      }
    }
    const filter = searchCrop ? `crop=${searchCrop},scale=640:-2` : 'scale=640:-2';
    const result = spawnSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', inputFrame,
      '-vf', filter, '-frames:v', '1',
      nodePath.join(croppedDir, outputName),
    ], { windowsHide: true });

    if (result.status !== 0 || !fs.existsSync(nodePath.join(croppedDir, outputName))) {
      fs.copyFileSync(nodePath.join(framesDir, file), nodePath.join(croppedDir, outputName));
    }
    return relativePath;
  });
}

function writeReport(workDir, result) {
  const rows = result.searchLinks
    .map((link) => `- [${link.label}](${link.url})`)
    .join('\n');
  const content = `# 영상 원본 조사 보고서

## 입력 영상
- 제목: ${result.title}
- 플랫폼: ${result.platform}
- 업로더: ${result.uploader || '확인되지 않음'}
- 게시일: ${result.uploadDate || '확인되지 않음'}
- 입력 URL: ${result.sourceUrl || '로컬 파일'}

## 검색 바로가기
${rows}

## 판정 원칙
검색으로 발견한 후보 URL을 Source Finder 화면에 추가하면 게시일을 정규화해 가장 이른 후보를 표시합니다. 삭제·비공개 게시물은 확인할 수 없으므로 결과는 절대적인 최초 원본이 아니라 “현재 확인 가능한 가장 이른 게시물”입니다.
`;
  const reportPath = nodePath.join(workDir, 'report.md');
  fs.writeFileSync(reportPath, content, 'utf8');
  return reportPath;
}

export async function runSourceFinder(source, options = {}) {
  if (!source) throw new Error('영상 URL 또는 파일 경로가 필요합니다.');
  requireBinaries();

  const jobId = new Date().toISOString().replace(/[:.]/g, '-');
  const workDir = nodePath.join(__dirname, 'outputs', jobId);
  const framesDir = nodePath.join(workDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  let videoPath;
  let infoJsonPath = nodePath.join(workDir, 'reference.info.json');
  const fallbackTitle = options.originalFileName || nodePath.basename(source, nodePath.extname(source));

  try {
    if (isWebUrl(source)) {
      run(ytdlpPath, [
        '--ffmpeg-location', binDir,
        '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
        '--merge-output-format', 'mp4', '--write-info-json',
        '-o', nodePath.join(workDir, 'reference.%(ext)s'), source,
      ]);
      const downloaded = fs.readdirSync(workDir)
        .find((file) => file.startsWith('reference.') && !file.endsWith('.json'));
      if (!downloaded) throw new Error('다운로드된 영상 파일을 찾을 수 없습니다.');
      videoPath = nodePath.join(workDir, downloaded);
    } else {
      const resolved = nodePath.resolve(source);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        throw new Error('업로드한 영상 파일을 찾을 수 없습니다.');
      }
      const extension = nodePath.extname(resolved) || '.mp4';
      videoPath = nodePath.join(workDir, `reference${extension}`);
      fs.copyFileSync(resolved, videoPath);
    }

    const metadata = readInfo(infoJsonPath, fallbackTitle, source);
    const duration = metadata.duration || extractDuration(videoPath);
    const representativeFrames = extractFrames(videoPath, framesDir, duration);
    const result = {
      jobId,
      outputDir: workDir,
      title: metadata.title,
      uploader: metadata.uploader,
      uploadDate: metadata.uploadDate,
      duration,
      platform: metadata.platform,
      sourceUrl: metadata.sourceUrl,
      representativeFrames,
      contactSheet: nodePath.posix.join('frames', 'contact_sheet.jpg'),
      searchLinks: buildSearchLinks(metadata.title, metadata.uploader),
    };
    result.reportPath = writeReport(workDir, result);
    return result;
  } catch (error) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

export function inspectCandidate(url) {
  if (!isWebUrl(url)) throw new Error('올바른 후보 URL이 아닙니다.');
  requireBinaries();
  const output = run(ytdlpPath, ['--dump-single-json', '--skip-download', '--no-warnings', url]).stdout;
  const info = JSON.parse(output);
  const publishedAt = formatDate(info.upload_date)
    || (info.timestamp ? new Date(info.timestamp * 1000).toISOString().slice(0, 10) : null)
    || (info.release_timestamp ? new Date(info.release_timestamp * 1000).toISOString().slice(0, 10) : null);

  return {
    url: info.webpage_url || url,
    platform: detectPlatform(info.webpage_url || url),
    title: info.title || '제목 없음',
    uploader: info.uploader || info.channel || info.creator || null,
    publishedAt,
    duration: Number(info.duration) || null,
    thumbnail: info.thumbnail || null,
  };
}

function grayFrameHashes(videoPath, fps = 1) {
  const filters = [
    `fps=${fps},scale=32:32,format=gray`,
    `fps=${fps},crop=iw*0.82:ih*0.82:iw*0.09:ih*0.09,scale=32:32,format=gray`,
    // 재편집 자막·검은 상하 여백을 제거한 장면 중심 변형들이다.
    `fps=${fps},crop=iw:ih*0.62:0:ih*0.19,scale=32:32,format=gray`,
    `fps=${fps},crop=iw:ih*0.46:0:ih*0.32,scale=32:32,format=gray`,
    `fps=${fps},crop=iw*0.76:ih*0.62:iw*0.12:ih*0.19,scale=32:32,format=gray`,
  ];
  const variants = [];
  for (const filter of filters) {
    const result = spawnSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', videoPath,
      '-t', '600', '-vf', filter, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
    ], { encoding: null, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    if (result.status !== 0) continue;
    const buffer = Buffer.from(result.stdout || []);
    const hashes = [];
    for (let offset = 0; offset + 1024 <= buffer.length; offset += 1024) {
      const pixels = buffer.subarray(offset, offset + 1024);
      hashes.push({ difference: differenceHash(pixels), perceptual: perceptualHash(pixels) });
    }
    variants.push(hashes);
  }
  return variants;
}

function differenceHash(pixels) {
  const bits = [];
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 31; x += 1) {
      bits.push(pixels[y * 32 + x] > pixels[y * 32 + x + 1]);
    }
  }
  return bits;
}

function perceptualHash(pixels) {
  const coefficients = [];
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let x = 0; x < 32; x += 1) {
        for (let y = 0; y < 32; y += 1) {
          sum += pixels[y * 32 + x]
            * Math.cos(((2 * x + 1) * u * Math.PI) / 64)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      coefficients.push(sum);
    }
  }
  const values = coefficients.slice(1);
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  return values.map((value) => value > median);
}

function hashSimilarity(left, right) {
  const bitSimilarity = (leftBits, rightBits) => {
    const length = Math.min(leftBits.length, rightBits.length);
    if (!length) return 0;
    let equal = 0;
    for (let index = 0; index < length; index += 1) if (leftBits[index] === rightBits[index]) equal += 1;
    return equal / length;
  };
  const perceptual = bitSimilarity(left.perceptual, right.perceptual);
  const difference = bitSimilarity(left.difference, right.difference);
  return perceptual * 0.75 + difference * 0.25;
}

function compareHashSequences(queryVariants, candidateVariants) {
  const query = queryVariants.flatMap((variant, variantIndex) => variant.map((hash, frameIndex) => ({ hash, frameIndex, variantIndex })));
  const candidate = candidateVariants.flatMap((variant, variantIndex) => variant.map((hash, frameIndex) => ({ hash, frameIndex, variantIndex })));
  if (!query.length || !candidate.length) return { score: 0, matchedFrames: 0, bestSimilarity: 0 };

  const bestByQueryFrame = new Map();
  for (const queryFrame of query) {
    let best = 0;
    for (const candidateFrame of candidate) {
      const similarity = hashSimilarity(queryFrame.hash, candidateFrame.hash);
      if (similarity > best) best = similarity;
    }
    const previous = bestByQueryFrame.get(queryFrame.frameIndex) || 0;
    if (best > previous) bestByQueryFrame.set(queryFrame.frameIndex, best);
  }
  const similarities = [...bestByQueryFrame.values()].sort((a, b) => b - a);
  // 재편집본 안에 2~5초만 사용된 원본도 잡되, 우연히 한 프레임만 닮은 후보는 통과시키지 않는다.
  const topCount = Math.min(5, Math.max(2, Math.ceil(similarities.length * 0.15)));
  const topAverage = similarities.slice(0, topCount).reduce((sum, value) => sum + value, 0) / topCount;
  const matchedFrames = similarities.filter((value) => value >= 0.78).length;
  const coverage = matchedFrames / Math.max(1, similarities.length);
  let score = Math.round(Math.max(0, Math.min(100, ((topAverage - 0.5) * 160) + coverage * 20)));
  if (matchedFrames < 2) score = Math.min(score, 45);
  const alignment = bestSequenceAlignment(queryVariants, candidateVariants);
  return {
    score,
    matchedFrames,
    bestSimilarity: Math.round((similarities[0] || 0) * 100),
    alignedFrames: alignment.frames,
    alignedSimilarity: Math.round(alignment.similarity * 100),
  };
}

function bestSequenceAlignment(queryVariants, candidateVariants) {
  let best = { quality: 0, similarity: 0, frames: 0 };
  for (const query of queryVariants) {
    for (const candidate of candidateVariants) {
      for (let offset = -query.length + 1; offset < candidate.length; offset += 1) {
        const similarities = [];
        for (let queryIndex = 0; queryIndex < query.length; queryIndex += 1) {
          const candidateIndex = queryIndex + offset;
          if (candidateIndex >= 0 && candidateIndex < candidate.length) {
            similarities.push(hashSimilarity(query[queryIndex], candidate[candidateIndex]));
          }
        }
        for (let windowSize = 3; windowSize <= Math.min(8, similarities.length); windowSize += 1) {
          let sum = similarities.slice(0, windowSize).reduce((total, value) => total + value, 0);
          for (let start = 0; start + windowSize <= similarities.length; start += 1) {
            if (start > 0) sum += similarities[start + windowSize - 1] - similarities[start - 1];
            const average = sum / windowSize;
            const quality = average + Math.min(0.025, (windowSize - 3) * 0.005);
            if (quality > best.quality) best = { quality, similarity: average, frames: windowSize };
          }
        }
      }
    }
  }
  return best;
}

export function compareVideoFiles(queryPath, candidatePath) {
  requireBinaries();
  const queryHashes = grayFrameHashes(queryPath, 1);
  const candidateHashes = grayFrameHashes(candidatePath, 1);
  return compareHashSequences(queryHashes, candidateHashes);
}

export function compareDownloadedCandidates(jobId) {
  const jobDir = nodePath.resolve(__dirname, 'outputs', jobId);
  const referenceName = fs.readdirSync(jobDir).find((file) => file.startsWith('reference.') && !file.endsWith('.json'));
  if (!referenceName) throw new Error('Reference video not found.');
  const queryHashes = grayFrameHashes(nodePath.join(jobDir, referenceName), 1);
  const verificationRoot = nodePath.join(jobDir, 'verification');
  if (!fs.existsSync(verificationRoot)) return [];
  return fs.readdirSync(verificationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const candidateDir = nodePath.join(verificationRoot, entry.name);
      const candidateName = fs.readdirSync(candidateDir).find((file) => file.startsWith('candidate.') && !file.endsWith('.part'));
      if (!candidateName) return { candidateId: entry.name, ok: false, score: 0 };
      return {
        candidateId: entry.name,
        ok: true,
        ...compareHashSequences(queryHashes, grayFrameHashes(nodePath.join(candidateDir, candidateName), 1)),
      };
    })
    .sort((left, right) => right.score - left.score);
}

export async function verifyCandidates(jobId, urls) {
  if (!/^[\w.-]+$/.test(jobId || '')) throw new Error('유효하지 않은 분석 작업입니다.');
  requireBinaries();
  const outputsRoot = nodePath.resolve(__dirname, 'outputs');
  const jobDir = nodePath.resolve(outputsRoot, jobId);
  if (!jobDir.startsWith(`${outputsRoot}${nodePath.sep}`) || !fs.existsSync(jobDir)) {
    throw new Error('분석 작업을 찾을 수 없습니다.');
  }
  const referenceName = fs.readdirSync(jobDir).find((file) => file.startsWith('reference.') && !file.endsWith('.json'));
  if (!referenceName) throw new Error('비교할 입력 영상이 없습니다.');
  const queryHashes = grayFrameHashes(nodePath.join(jobDir, referenceName), 1);
  if (!queryHashes.some((variant) => variant.length)) throw new Error('입력 영상 지문을 만들지 못했습니다.');

  const verificationRoot = nodePath.join(jobDir, 'verification');
  fs.mkdirSync(verificationRoot, { recursive: true });
  const uniqueUrls = [...new Set((urls || []).map((url) => String(url).trim()).filter(isWebUrl))].slice(0, 12);
  const results = [];

  for (const url of uniqueUrls) {
    const candidateId = createHash('sha1').update(url).digest('hex').slice(0, 12);
    const candidateDir = nodePath.join(verificationRoot, candidateId);
    fs.mkdirSync(candidateDir, { recursive: true });
    try {
      run(ytdlpPath, [
        '--ffmpeg-location', binDir, '--no-playlist',
        '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
        '--merge-output-format', 'mp4',
        '-o', nodePath.join(candidateDir, 'candidate.%(ext)s'), url,
      ]);
      const candidateName = fs.readdirSync(candidateDir).find((file) => file.startsWith('candidate.') && !file.endsWith('.part'));
      if (!candidateName) throw new Error('후보 영상을 가져오지 못했습니다.');
      const candidateHashes = grayFrameHashes(nodePath.join(candidateDir, candidateName), 1);
      const comparison = compareHashSequences(queryHashes, candidateHashes);
      results.push({ ok: true, url, ...comparison });
    } catch (error) {
      results.push({ ok: false, url, score: 0, matchedFrames: 0, bestSimilarity: 0, error: error.message });
    }
  }
  fs.writeFileSync(
    nodePath.join(verificationRoot, 'results.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), candidateCount: uniqueUrls.length, results }, null, 2),
    'utf8',
  );
  return results;
}

const isCli = process.argv[1] && nodePath.resolve(process.argv[1]) === __filename;
if (isCli) {
  runSourceFinder(process.argv[2])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
