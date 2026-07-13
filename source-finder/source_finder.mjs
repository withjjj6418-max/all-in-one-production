import { spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'url';
import nodePath from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

export async function runSourceFinder(videoUrl) {
  if (!videoUrl) {
    throw new Error("영상 URL이 제공되지 않았습니다.");
  }

  // 실행 파일 절대 경로 매핑 (Windows exe 주의)
  const binDir = nodePath.join(__dirname, 'bin');
  const ytdlpPath = nodePath.join(binDir, 'yt-dlp.exe');
  const ffmpegPath = nodePath.join(binDir, 'ffmpeg.exe');
  const ffprobePath = nodePath.join(binDir, 'ffprobe.exe');

  // 실행 파일 존재 여부 검사
  if (!fs.existsSync(ytdlpPath) || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
    throw new Error("필수 도구(yt-dlp.exe, ffmpeg.exe, ffprobe.exe)가 source-finder/bin 폴더에 없습니다.");
  }

  // 3. 작업 폴더 생성: source-finder/outputs/<timestamp>/
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputsDir = nodePath.join(__dirname, 'outputs');
  const workDir = nodePath.join(outputsDir, timestamp);
  const framesDir = nodePath.join(workDir, 'frames');

  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  console.log(`[1/5] 작업 폴더 생성 완료: ${workDir}`);

  // 4. yt-dlp 로 영상 다운로드
  console.log(`[2/5] 영상 다운로드 중... URL: ${videoUrl}`);

  const ytdlpArgs = [
    '--ffmpeg-location', binDir,
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
    '--merge-output-format', 'mp4',
    '--write-info-json',
    '-o', nodePath.join(workDir, 'reference.%(ext)s'),
    videoUrl
  ];

  const ytdlpResult = spawnSync(ytdlpPath, ytdlpArgs, { encoding: 'utf-8', stdio: 'pipe' });

  if (ytdlpResult.status !== 0) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw new Error(`영상 다운로드 실패! 상세 에러: ${ytdlpResult.stderr || ytdlpResult.stdout}`);
  }

  // 다운로드된 파일 탐색 (reference.*)
  const filesInWorkDir = fs.readdirSync(workDir);
  const videoFile = filesInWorkDir.find(file => file.startsWith('reference.') && !file.endsWith('.json'));

  if (!videoFile) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw new Error("다운로드된 영상 파일을 찾을 수 없습니다.");
  }

  const videoPath = nodePath.join(workDir, videoFile);
  const infoJsonPath = nodePath.join(workDir, 'reference.info.json');

  // 메타데이터 파싱
  let title = "알 수 없음";
  let uploader = "알 수 없음";
  let uploadDate = "알 수 없음";

  if (fs.existsSync(infoJsonPath)) {
    try {
      const infoData = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8'));
      title = infoData.title || title;
      uploader = infoData.uploader || infoData.channel || uploader;
      if (infoData.upload_date) {
        const dateStr = infoData.upload_date;
        if (dateStr.length === 8) {
          uploadDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        } else {
          uploadDate = dateStr;
        }
      }
    } catch (err) {
      console.warn("⚠️ 메타데이터 JSON 파싱 실패:", err.message);
    }
  }

  console.log(`[2/5] 다운로드 완료: ${videoFile}`);

  // 5. ffprobe 로 영상 길이(duration) 구하기
  console.log("[3/5] 영상 정보 분석 및 프레임 추출 중...");

  let duration = 0;
  try {
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ];
    const ffprobeOutput = execFileSync(ffprobePath, ffprobeArgs, { encoding: 'utf-8' });
    duration = parseFloat(ffprobeOutput.trim());
  } catch (err) {
    throw new Error(`영상 분석(ffprobe) 실패: ${err.message}`);
  }

  if (isNaN(duration) || duration <= 0) {
    throw new Error("영상 길이가 유효하지 않습니다.");
  }

  // 6. ffmpeg 로 프레임 추출
  const interval = duration / 30;

  const ffmpegExtractArgs = [
    '-i', videoPath,
    '-vf', `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${interval})',scale=400:-1`,
    '-vsync', 'vfr',
    '-q:v', '2',
    nodePath.join(framesDir, 'frame_%03d.jpg')
  ];

  const ffmpegExtractResult = spawnSync(ffmpegPath, ffmpegExtractArgs, { stdio: 'pipe' });

  if (ffmpegExtractResult.status !== 0) {
    throw new Error(`프레임 추출(ffmpeg) 실패: ${ffmpegExtractResult.stderr.toString()}`);
  }

  // 7. contact sheet 생성 (ffmpeg tile 필터)
  console.log("[4/5] Contact Sheet 생성 중...");

  const contactSheetPath = nodePath.join(framesDir, 'contact_sheet.jpg');

  const ffmpegTileArgs = [
    '-i', nodePath.join(framesDir, 'frame_%03d.jpg'),
    '-vf', 'tile=5x6',
    '-frames:v', '1',
    '-q:v', '2',
    contactSheetPath
  ];

  const ffmpegTileResult = spawnSync(ffmpegPath, ffmpegTileArgs, { stdio: 'pipe' });

  if (ffmpegTileResult.status !== 0) {
    throw new Error(`Contact Sheet 생성(ffmpeg tile) 실패: ${ffmpegTileResult.stderr.toString()}`);
  }

  // 8. 핵심 프레임 크롭 및 원본 조사 링크 생성
  console.log("[5/5] 원본 조사 분석 진행 중 (크롭 감지 및 보고서 생성)...");

  let cropParams = null;
  try {
    const cropdetectArgs = [
      '-ss', '5',
      '-i', videoPath,
      '-t', '10',
      '-vf', 'cropdetect=limit=24:round=16',
      '-f', 'null',
      '-'
    ];
    const cropResult = spawnSync(ffmpegPath, cropdetectArgs, { encoding: 'utf-8', stdio: 'pipe' });
    const stderr = cropResult.stderr || '';
    const matches = [...stderr.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
    if (matches.length > 0) {
      cropParams = matches[matches.length - 1][1];
    }
  } catch (err) {
    console.warn("⚠️ cropdetect 실패 (원본 프레임 사용):", err.message);
  }

  const croppedDir = nodePath.join(framesDir, 'cropped');
  fs.mkdirSync(croppedDir, { recursive: true });

  const frameFiles = fs.readdirSync(framesDir)
    .filter(file => file.startsWith('frame_') && file.endsWith('.jpg'))
    .sort();

  const selectCount = 4;
  const selectedFrames = [];
  if (frameFiles.length >= selectCount) {
    for (let i = 0; i < selectCount; i++) {
      const idx = Math.floor((i + 0.5) * (frameFiles.length / selectCount));
      selectedFrames.push(frameFiles[idx]);
    }
  } else {
    selectedFrames.push(...frameFiles);
  }

  selectedFrames.forEach((frameFile, index) => {
    const srcPath = nodePath.join(framesDir, frameFile);
    const destPath = nodePath.join(croppedDir, `cropped_${index + 1}.jpg`);
    
    if (cropParams) {
      const cropArgs = [
        '-i', srcPath,
        '-vf', `crop=${cropParams}`,
        '-y',
        destPath
      ];
      const cropRun = spawnSync(ffmpegPath, cropArgs);
      if (cropRun.status !== 0) {
        fs.copyFileSync(srcPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });

  const cleanTitle = title
    .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '')
    .replace(/[\\/:*?"<>|#\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanTitle)}`;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle)}`;
  const tiktokSearchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(cleanTitle)}`;

  const tiktokProfileUrl = uploader.startsWith('@') 
    ? `https://www.tiktok.com/${encodeURIComponent(uploader)}` 
    : `https://www.tiktok.com/@${encodeURIComponent(uploader)}`;
  const instagramProfileUrl = `https://www.instagram.com/${encodeURIComponent(uploader.replace('@', ''))}/`;
  const youtubeProfileUrl = uploader.startsWith('@')
    ? `https://www.youtube.com/${encodeURIComponent(uploader)}`
    : `https://www.youtube.com/@${encodeURIComponent(uploader)}`;

  const reportMdPath = nodePath.join(workDir, 'report.md');
  const reportContent = `# 🔍 영상 원본 조사 보고서

## 📌 영상 정보
- **입력 URL:** [영상 링크](${videoUrl})
- **영상 제목:** ${title}
- **업로더:** ${uploader}
- **업로드 날짜:** ${uploadDate}

## 🖼️ 작업 결과물 경로
- **Contact Sheet:** \`${contactSheetPath}\`
- **크롭된 프레임 폴더:** \`${croppedDir}\`

---

## 🔗 역검색 및 키워드 검색 링크

### 1. 이미지 역검색 (Google Lens)
- 🌐 [구글 렌즈 웹페이지 바로가기](https://lens.google.com/)
- 💡 **안내:** 위 링크를 열고, \`frames/cropped/\` 폴더의 크롭된 대표 이미지들을 직접 드래그 앤 드롭하여 유사한 영상이나 원본 출처를 찾을 수 있습니다.

### 2. 제목 키워드 검색
제거된 특수문자/이모지를 제외한 핵심 문구: **"${cleanTitle}"**
- 🔍 [Google 검색 링크](${googleSearchUrl})
- 📺 [YouTube 검색 링크](${youtubeSearchUrl})
- 🎵 [TikTok 검색 링크](${tiktokSearchUrl})

### 3. 업로더 프로필 확인 링크
- 🎵 [TikTok 프로필 확인](${tiktokProfileUrl})
- 📸 [Instagram 프로필 확인](${instagramProfileUrl})
- 📺 [YouTube 채널 확인](${youtubeProfileUrl})
- *※ 업로더명이 실제 계정 아이디와 일치하지 않을 수 있으므로 참고용으로 사용하세요.*

---

## 📋 다음 할 일 (조사 체크리스트)
- [ ] 1. **Contact Sheet 확인:** \`contact_sheet.jpg\`를 열어 영상 곳곳에 숨겨진 워터마크나 계정 아이디(예: @아이디)가 있는지 유심히 살펴봅니다.
- [ ] 2. **구글 렌즈 역검색:** \`frames/cropped/\` 내부의 이미지를 구글 렌즈에 올려 원본 또는 퍼온 곳이 있는지 대조해 봅니다.
- [ ] 3. **소셜 프로필 조회:** 영상 속 워터마크나 설명란에서 찾은 아이디가 있다면, 위의 SNS 프로필 주소 규칙을 활용해 실제 원본 채널을 찾아 방문합니다.
`;

  fs.writeFileSync(reportMdPath, reportContent, 'utf-8');

  return {
    outputDir: workDir,
    contactSheet: contactSheetPath,
    reportPath: reportMdPath,
    title,
    uploader,
    uploadDate
  };
}

// CLI 단독 실행 감지 및 핸들링
const isCli = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) || 
  nodePath.basename(process.argv[1]) === 'source_finder.mjs'
);

if (isCli) {
  const url = process.argv[2];
  if (!url) {
    console.log("사용법: node source-finder/source_finder.mjs \"<영상URL>\"");
    process.exit(1);
  }
  
  runSourceFinder(url)
    .then(result => {
      console.log("\n==================================================");
      console.log("🎉 작업 완료!");
      console.log(`- 작업 폴더: ${result.outputDir}`);
      console.log(`- Contact Sheet 경로: ${result.contactSheet}`);
      console.log(`- 조사 보고서(Markdown): ${result.reportPath}`);
      console.log(`- 영상 제목: ${result.title}`);
      console.log(`- 업로더: ${result.uploader}`);
      console.log(`- 업로드 날짜: ${result.uploadDate}`);
      console.log("==================================================");
    })
    .catch(err => {
      console.error("\n❌ 에러 발생:", err.message);
      process.exit(1);
    });
}
