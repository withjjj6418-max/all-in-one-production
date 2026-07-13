import http from 'http';
import { runSourceFinder } from './source_finder.mjs';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const PORT = 8787;

// 이미지를 윈도우 클립보드에 복사하는 PowerShell 헬퍼 함수
function copyImageToClipboard(imagePath) {
  try {
    const winPath = path.resolve(imagePath).replace(/\//g, '\\');
    
    // Windows Forms 및 Drawing 라이브러리를 사용해 클립보드 복사 실행
    const psCommand = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${winPath}'))`;
    
    const psArgs = [
      '-STA',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psCommand
    ];
    
    const result = spawnSync('powershell.exe', psArgs, { encoding: 'utf-8' });
    
    if (result.status === 0) {
      console.log(`[Helper Server] 대표 이미지가 클립보드에 복사되었습니다: ${winPath}`);
      return true;
    } else {
      console.error(`[Helper Server] 클립보드 복사 실패 (PowerShell): ${result.stderr || result.stdout}`);
      return false;
    }
  } catch (err) {
    console.error(`[Helper Server] 클립보드 복사 중 예외 발생: ${err.message}`);
    return false;
  }
}

const server = http.createServer((req, res) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // OPTIONS 프리플라이트 요청 처리
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, headers);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /investigate
  if (req.method === 'POST' && req.url === '/investigate') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const videoUrl = payload.url;

        if (!videoUrl) {
          res.writeHead(400, headers);
          res.end(JSON.stringify({ ok: false, error: "url 필드가 필요합니다." }));
          return;
        }

        console.log(`\n[Helper Server] 조사 요청 수신: ${videoUrl}`);
        const result = await runSourceFinder(videoUrl);

        // 윈도우 탐색기로 작업 폴더 열기
        try {
          spawn('explorer.exe', [result.outputDir]);
          console.log(`[Helper Server] 윈도우 탐색기 실행 완료: ${result.outputDir}`);
        } catch (explorerErr) {
          console.error(`[Helper Server] 탐색기 실행 실패: ${explorerErr.message}`);
        }

        // 대표 프레임 이미지 선택 로직 (cropped 우선, 없으면 일반 frames)
        let targetImage = null;
        const croppedDir = path.join(result.outputDir, 'frames', 'cropped');
        const framesDir = path.join(result.outputDir, 'frames');

        if (fs.existsSync(croppedDir)) {
          const croppedFiles = fs.readdirSync(croppedDir)
            .filter(file => file.endsWith('.jpg'))
            .sort();
          if (croppedFiles.length > 0) {
            const midIdx = Math.floor(croppedFiles.length / 2);
            targetImage = path.join(croppedDir, croppedFiles[midIdx]);
          }
        }

        if (!targetImage && fs.existsSync(framesDir)) {
          const frameFiles = fs.readdirSync(framesDir)
            .filter(file => file.startsWith('frame_') && file.endsWith('.jpg'))
            .sort();
          if (frameFiles.length > 0) {
            const midIdx = Math.floor(frameFiles.length / 2);
            targetImage = path.join(framesDir, frameFiles[midIdx]);
          }
        }

        // 클립보드 이미지 복사 실행
        let clipboardSuccess = false;
        if (targetImage && fs.existsSync(targetImage)) {
          clipboardSuccess = copyImageToClipboard(targetImage);
        } else {
          console.warn("[Helper Server] 클립보드에 복사할 대표 이미지를 찾지 못했습니다.");
        }

        if (clipboardSuccess) {
          console.log("👉 대표 프레임이 클립보드에 복사됐어요. 구글 렌즈에서 Ctrl+V 하세요.");
        }

        res.writeHead(200, headers);
        res.end(JSON.stringify({
          ok: true,
          ...result,
          clipboard: clipboardSuccess,
          message: clipboardSuccess 
            ? "대표 프레임이 클립보드에 복사됐어요. 구글 렌즈에서 Ctrl+V 하세요." 
            : "대표 프레임 클립보드 복사에 실패하였습니다. 직접 드래그 앤 드롭해 주세요."
        }));
      } catch (err) {
        console.error(`[Helper Server] 처리 중 오류 발생:`, err.message);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // POST /download
  if (req.method === 'POST' && req.url === '/download') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const videoUrl = payload.url;

        if (!videoUrl) {
          res.writeHead(400, headers);
          res.end(JSON.stringify({ ok: false, error: "url 필드가 필요합니다." }));
          return;
        }

        console.log(`\n[Helper Server] 원본 다운로드 요청 수신: ${videoUrl}`);

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const binDir = path.join(__dirname, 'bin');
        const ytdlpPath = path.join(binDir, 'yt-dlp.exe');

        if (!fs.existsSync(ytdlpPath)) {
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: "yt-dlp.exe 도구가 bin 폴더에 없습니다." }));
          return;
        }

        // 다운로드 폴더 생성
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const downloadsDir = path.join(__dirname, 'downloads');
        const workDir = path.join(downloadsDir, timestamp);
        fs.mkdirSync(workDir, { recursive: true });

        // yt-dlp 최고 화질 다운로드 설정 (원본 다운로드 목적이므로 화질 제한 없음)
        const ytdlpArgs = [
          '--ffmpeg-location', binDir,
          '--write-info-json',
          '-o', path.join(workDir, '%(title)s.%(ext)s'),
          videoUrl
        ];

        const ytdlpResult = spawnSync(ytdlpPath, ytdlpArgs, { encoding: 'utf-8', stdio: 'pipe' });

        if (ytdlpResult.status !== 0) {
          fs.rmSync(workDir, { recursive: true, force: true });
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: `다운로드 실패: ${ytdlpResult.stderr || ytdlpResult.stdout}` }));
          return;
        }

        // 다운로드된 파일 탐색
        const files = fs.readdirSync(workDir);
        const videoFile = files.find(file => !file.endsWith('.json'));
        const infoJsonFile = files.find(file => file.endsWith('.json'));

        let title = "알 수 없음";
        if (infoJsonFile) {
          try {
            const infoData = JSON.parse(fs.readFileSync(path.join(workDir, infoJsonFile), 'utf-8'));
            title = infoData.title || title;
          } catch (e) {
            console.error("메타데이터 파싱 실패:", e.message);
          }
        }

        // 탐색기로 폴더 열기
        try {
          spawn('explorer.exe', [workDir]);
          console.log(`[Helper Server] 윈도우 탐색기 실행 완료 (다운로드): ${workDir}`);
        } catch (explorerErr) {
          console.error(`[Helper Server] 탐색기 실행 실패: ${explorerErr.message}`);
        }

        res.writeHead(200, headers);
        res.end(JSON.stringify({
          ok: true,
          dir: workDir,
          filename: videoFile || "알 수 없음",
          title: title
        }));
      } catch (err) {
        console.error(`[Helper Server] 다운로드 중 오류 발생:`, err.message);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 그 외의 경로 404
  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, 'localhost', () => {
  console.log("==================================================================");
  console.log(`원본 조사 도우미가 켜졌어요 (포트 ${PORT}).`);
  console.log("이 창을 닫으면 조사 기능이 꺼집니다.");
  console.log("==================================================================");
});
