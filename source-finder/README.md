# Source Finder 로컬 도우미

`/source-finder` 화면에서 영상 파일 또는 URL을 분석하기 위한 Windows 로컬 서비스입니다. 영상 처리는 사용자의 PC에서 실행되며 결과는 `source-finder/outputs/<job-id>/`에 저장됩니다.

## 시작하기

프로젝트 루트에서 터미널 두 개를 열고 각각 실행합니다.

```powershell
npm run source-finder
```

```powershell
npm run dev
```

웹앱에서 **원본 찾기** 메뉴를 열고 도우미 상태가 `연결됨`인지 확인합니다. 이미 이전 버전의 도우미가 8787 포트에서 실행 중이라면 해당 터미널을 종료하고 다시 시작해야 새 기능이 적용됩니다.

`.env.local`에는 다음 서버 전용 키가 필요합니다.

```dotenv
GEMINI_API_KEY=
YOUTUBE_API_KEY=
GOOGLE_CLOUD_VISION_API_KEY=
```

`GOOGLE_CLOUD_VISION_API_KEY`를 사용할 Google Cloud 프로젝트에서는 **Cloud Vision API**와 결제를 활성화하고, 키의 API 제한에 Cloud Vision API를 허용해야 합니다. 이 키는 브라우저로 전달되지 않습니다. 원본 탐색 시 검색용 대표 프레임이 최대 4장까지 Google Vision Web Detection으로 전송됩니다.

## 지원 흐름

1. URL 또는 최대 1GB 영상 파일 입력
2. FFmpeg로 대표 프레임과 콘택트 시트 생성
3. Google Vision Web Detection으로 동일·부분 일치 이미지가 게시된 웹페이지 탐색
4. Gemini가 프레임별 워터마크·인물·장소·사건과 외국어 검색어 추출
5. YouTube·Instagram·TikTok·샤오홍슈에서 해외 원본 후보 자동 수집
6. 입력한 한국 재편집 URL과 한국어 재업로드 결과 제외
7. 상위 후보 영상을 최대 480p로 직접 가져와 입력 영상과 초 단위 프레임 지문 대조
8. 두 프레임 이상 일치하고 검증 점수 55점 이상인 후보만 결과에 표시
9. 후보 제목·업로더·게시일과 직접 열 수 있는 링크 표시

별도 후보 입력은 필요하지 않습니다. 자동 검색에 누락된 후보가 이미 알려진 경우에만 선택적으로 직접 추가할 수 있습니다.

## 로컬 API

- `GET /health`: 서비스 상태와 기능 목록
- `POST /investigate`: `{ "url": "...", "openFolder": false }`
- `POST /investigate-file`: 영상 바이너리, 파일명은 `X-File-Name` 헤더
- `POST /candidates`: `{ "urls": ["...", "..."] }`
- `POST /verify-candidates`: `{ "jobId": "...", "urls": ["...", "..."] }`
- `GET /asset?jobId=...&file=...`: 생성된 대표 프레임 조회
- `POST /api/source-finder/discover`: 웹앱의 자동 원본 탐색 API

서비스는 보안을 위해 `127.0.0.1:8787`에만 바인딩되며, `/asset`은 `outputs/<job-id>` 내부 파일만 제공합니다.

## 결과물

- `reference.*`: 분석용 입력 영상 복사본
- `reference.info.json`: URL 입력 시 플랫폼 메타데이터
- `frames/frame_*.jpg`: 시간 간격별 프레임
- `frames/cropped/representative_*.jpg`: 검색용 대표 프레임
- `frames/contact_sheet.jpg`: 전체 프레임 요약
- `report.md`: 메타데이터와 플랫폼별 검색 링크

## 판정 범위와 주의사항

- 결과는 인터넷 전체의 절대적 원본이 아니라 **현재 확인 가능한 후보 중 가장 이른 게시물**입니다.
- 삭제·비공개·검색 미노출 게시물은 확인할 수 없습니다.
- URL 분석은 플랫폼 정책과 로그인 상태에 따라 실패할 수 있습니다.
- 소유하거나 분석 권한이 있는 영상만 처리하고 각 플랫폼의 이용약관을 준수하세요.
- 상위 후보 영상은 전체 프레임 지문으로 자동 검증합니다. 플랫폼 로그인·지역 제한·삭제·비공개 영상은 검증하지 못할 수 있습니다.
- Google Vision은 검색엔진에 노출된 공개 웹페이지만 찾을 수 있습니다. 대표 프레임은 Google Cloud로 전송되므로 비공개·민감 영상에는 사용하지 마세요.
