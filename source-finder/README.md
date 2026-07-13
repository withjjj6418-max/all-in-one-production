# 영상 원본 조사 보조 도구 (source-finder)

이 폴더는 영상 원본 조사를 보조하는 로컬 도구들을 모아두는 곳입니다.
웹 애플리케이션 빌드 및 배포에 영향을 주지 않도록 구성되어 있습니다.

## 🛠️ 기능 구성
- **yt-dlp** (`source-finder/bin/yt-dlp.exe`): 다양한 플랫폼의 영상 다운로드 지원
- **ffmpeg / ffprobe** (`source-finder/bin/ffmpeg.exe`, `ffprobe.exe`): 영상의 프레임 추출 및 바둑판식 이미지 합병(Contact Sheet), 실제 영상 영역 크롭 지원
- **도우미 서버** (`source-finder/helper_server.mjs`): 웹앱과의 통신을 통해 원본 조사 명령을 수신하고, 대표 이미지를 클립보드에 자동 복사하는 로컬 API 서버
- **실행기** (`source-finder/조사도우미시작.bat`): 더블클릭하여 로컬 도우미 서버를 즉시 기동하는 윈도우 배치 스크립트

---

## 🚀 사용법

### 방법 A. 로컬 도우미 서버 사용 (권장)
웹앱 또는 외부 시스템과 통신하여 원본 조사를 자동화할 때 유용합니다.

1. **도우미 서버 시작:** `source-finder/조사도우미시작.bat` 파일을 더블클릭하여 기동합니다.
   * 검은 터미널 창이 뜨면서 `localhost:8787` 포트에서 대기하게 됩니다.
   * 터미널 창을 닫으면 도우미 서버가 꺼집니다.
2. **API 호출 방식:**
   * **상태 체크 (GET):**
     * URL: `http://localhost:8787/health`
     * 응답: `{ "ok": true }`
   * **조사 요청 (POST):**
     * URL: `http://localhost:8787/investigate`
     * Body (JSON): `{ "url": "여기에 영상 URL 입력" }`
     * 응답 (JSON):
       ```json
       {
         "ok": true,
         "outputDir": "C:/Users/...",
         "contactSheet": "C:/Users/...",
         "reportPath": "C:/Users/...",
         "title": "영상 제목",
         "uploader": "업로더 계정",
         "uploadDate": "YYYY-MM-DD",
         "clipboard": true,
         "message": "대표 프레임이 클립보드에 복사됐어요. 구글 렌즈에서 Ctrl+V 하세요."
       }
       ```
     * *※ 조사 완료 시 해당 결과물이 담긴 윈도우 탐색기 폴더가 자동으로 열리며, 검은 여백이 제거된 대표 프레임 중 하나가 **윈도우 클립보드에 이미지로 자동 복사**됩니다. 구글 렌즈 탭에서 곧바로 `Ctrl+V`를 누르면 즉시 검색이 가능합니다.*

### 방법 B. 콘솔에서 단독 실행하기
콘솔창을 통해 단독으로 동작을 테스트하거나 수동 조사할 때 사용합니다.

```bash
node source-finder/source_finder.mjs "<영상URL>"
```

---

## 📁 작업 결과물 구조 (outputs)
실행할 때마다 `outputs/<타임스탬프>/` 아래에 폴더가 고유하게 생성됩니다.
- `reference.mp4`: 720p 상한선으로 다운로드된 영상 파일
- `reference.info.json`: 영상 정보 메타데이터 원본 JSON 파일
- `frames/`: 비디오에서 고르게 분할 추출된 약 30장의 개별 프레임 이미지들
- `frames/contact_sheet.jpg`: 30장의 프레임을 5x6 격자로 모은 한 장짜리 요약 이미지
- `frames/cropped/`: 영상 위아래 검은 영역(여백)이 자동으로 제거된 대표 프레임 4장
- `report.md`: 영상 메타데이터, 구글 렌즈 역검색 안내, 제목 키워드 검색 링크, 업로더 SNS 프로필 확인 링크, 조사 체크리스트가 기재된 마크다운 보고서
