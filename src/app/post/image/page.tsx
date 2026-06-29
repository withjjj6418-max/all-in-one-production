"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./page.module.css";

// ===== 데이터: 화면에 보일 이름 (네가 정한 표 그대로) =====
const characters = [
  { id: "char01", name: "남자1" },
  { id: "char02", name: "남자2" },
  { id: "char03", name: "남자3" },
  { id: "char04", name: "딸" },
  { id: "char05", name: "아들" },
  { id: "char06", name: "아저씨1" },
  { id: "char07", name: "아저씨2" },
  { id: "char08", name: "아줌마1" },
  { id: "char09", name: "아줌마2" },
  { id: "char10", name: "여자1" },
  { id: "char11", name: "여자2" },
  { id: "char12", name: "여자3" },
  { id: "char13", name: "할머니1" },
  { id: "char14", name: "할머니2" },
  { id: "char15", name: "할아버지1" },
  { id: "char16", name: "할아버지2" },
];

const expressions = [
  { id: "expr01", name: "곤란1" },
  { id: "expr02", name: "곤란2" },
  { id: "expr03", name: "곤란3" },
  { id: "expr04", name: "곤란4" },
  { id: "expr05", name: "놀람1" },
  { id: "expr06", name: "놀람2" },
  { id: "expr07", name: "눈물1" },
  { id: "expr08", name: "눈물2" },
  { id: "expr09", name: "못마땅" },
  { id: "expr10", name: "무표정" },
  { id: "expr11", name: "미소" },
  { id: "expr12", name: "분노1" },
  { id: "expr13", name: "분노2" },
  { id: "expr14", name: "분노3" },
  { id: "expr15", name: "분노4" },
  { id: "expr16", name: "분노5" },
  { id: "expr17", name: "웃음" },
  { id: "expr18", name: "정색" },
];

type Item = { id: string; name: string };

export default function Home() {
  // ===== 현재 선택 상태 =====
  const [selectedChar, setSelectedChar] = useState<Item | null>(null);
  const [selectedExpr, setSelectedExpr] = useState<Item | null>(null);
  const [poseText, setPoseText] = useState("");
  // 포즈 참고 그림: base64 데이터 URL 한 장 (업로드 또는 붙여넣기)
  const [poseImage, setPoseImage] = useState<string | null>(null);
  // 옵션: 표정 충실도 / 모델 품질
  const [exprMode, setExprMode] = useState<"image" | "word">("image");
  const [quality, setQuality] = useState<"flash" | "pro">("flash");
  // 드래그앤드롭으로 파일을 끌고 있는 중인지 (테두리 강조용)
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== 파일을 base64 데이터 URL로 변환하는 공통 함수 =====
  function fileToDataUrl(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 넣을 수 있어요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPoseImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ===== 업로드 버튼으로 파일 선택 =====
  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) fileToDataUrl(file);
  }

  // ===== 드래그앤드롭: 파일을 끌어다 놓기 =====
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) fileToDataUrl(file);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); // 이걸 해야 브라우저가 파일을 열어버리지 않음
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  // ===== 붙여넣기(Ctrl+V): 클립보드의 이미지를 받음 =====
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            fileToDataUrl(file);
            e.preventDefault();
          }
          break;
        }
      }
    }
    // 화면 전체에서 Ctrl+V를 감지
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ===== 생성 버튼: 서버(/api/illust-generate)를 호출 =====
  async function onGenerate() {
    if (!selectedChar) { alert("캐릭터를 먼저 선택해 주세요."); return; }
    if (!selectedExpr) { alert("표정을 선택해 주세요."); return; }

    setLoading(true);
    setErrorMsg(null);
    setResultUrl(null);

    try {
      const res = await fetch("/api/illust-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedChar.id,
          expressionId: selectedExpr.id,
          poseText: poseText.trim(),
          poseImage: poseImage, // 포즈 참고 그림 (없으면 null)
          exprMode: exprMode,   // 표정 충실도
          quality: quality,     // 모델 품질
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "생성에 실패했습니다.");
      }
      setResultUrl(data.image);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  // ===== 다운로드 =====
  function onDownload() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${selectedChar?.id}_${selectedExpr?.id}.png`;
    a.click();
  }

  return (
    <div className={styles.wrap}>
      <header>
        <h1 className={styles.title}>캐릭터 일러스트 생성기</h1>
        <p className={styles.subtitle}>캐릭터와 표정을 고르고 포즈를 입력하면 흰 배경 PNG가 나옵니다</p>
      </header>

      {/* 1. 캐릭터 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          <span className={styles.num}>1</span> 캐릭터 <span className={styles.hint}>16종 중 하나를 클릭</span>
        </p>
        <div className={styles.charGrid}>
          {characters.map((c) => (
            <Tile
              key={c.id}
              item={c}
              imgSrc={`/images/${c.id}_thumb.png`}
              selected={selectedChar?.id === c.id}
              onClick={() => setSelectedChar(c)}
            />
          ))}
        </div>
      </section>

      {/* 2. 표정 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          <span className={styles.num}>2</span> 표정 <span className={styles.hint}>18종 중 하나를 클릭</span>
        </p>
        <div className={styles.exprGrid}>
          {expressions.map((e) => (
            <Tile
              key={e.id}
              item={e}
              imgSrc={`/images/${e.id}.png`}
              selected={selectedExpr?.id === e.id}
              onClick={() => setSelectedExpr(e)}
            />
          ))}
        </div>
      </section>

      {/* 3. 포즈 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          <span className={styles.num}>3</span> 포즈 <span className={styles.hint}>글로 쓰거나, 참고 그림을 올리거나 붙여넣기(Ctrl+V)</span>
        </p>
        <textarea
          className={styles.textarea}
          placeholder="예: 한 손을 들어 인사하는 포즈"
          value={poseText}
          onChange={(e) => setPoseText(e.target.value)}
        />

        {/* 포즈 참고 그림 영역 (업로드 / 붙여넣기 / 드래그앤드롭) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={styles.dropText}>
            포즈 참고 그림을 여기로 끌어다 놓거나, 클릭해서 업로드, 또는 Ctrl+V로 붙여넣기
          </span>
        </div>

        {/* 넣은 포즈 그림 미리보기 */}
        {poseImage && (
          <div className={styles.posePreview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poseImage} alt="포즈 참고" />
            <button
              type="button"
              className={styles.btnRemove}
              onClick={() => setPoseImage(null)}
            >
              포즈 그림 제거
            </button>
          </div>
        )}
      </section>

      {/* 4. 옵션 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          <span className={styles.num}>4</span> 옵션 <span className={styles.hint}>결과가 마음에 안 들면 바꿔보세요</span>
        </p>

        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>표정 적용 방식</span>
          <div className={styles.optionBtns}>
            <button
              type="button"
              className={`${styles.optBtn} ${exprMode === "image" ? styles.optBtnOn : ""}`}
              onClick={() => setExprMode("image")}
            >
              그림 그대로
            </button>
            <button
              type="button"
              className={`${styles.optBtn} ${exprMode === "word" ? styles.optBtnOn : ""}`}
              onClick={() => setExprMode("word")}
            >
              단어 설명 포함
            </button>
          </div>
        </div>
        <p className={styles.optionDesc}>
          {exprMode === "image"
            ? "표정 그림의 눈·입 모양을 최대한 그대로 따릅니다 (과장 적음)."
            : "표정 이름(예: 화난 표정)도 함께 알려줍니다 (AI 해석이 더 들어감)."}
        </p>

        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>모델 품질</span>
          <div className={styles.optionBtns}>
            <button
              type="button"
              className={`${styles.optBtn} ${quality === "flash" ? styles.optBtnOn : ""}`}
              onClick={() => setQuality("flash")}
            >
              빠름 · 저렴
            </button>
            <button
              type="button"
              className={`${styles.optBtn} ${quality === "pro" ? styles.optBtnOn : ""}`}
              onClick={() => setQuality("pro")}
            >
              고품질
            </button>
          </div>
        </div>
        <p className={styles.optionDesc}>
          {quality === "flash"
            ? "Flash 모델 — 빠르고 저렴합니다."
            : "Pro 모델 — reference를 더 정밀히 따릅니다 (장당 비용이 조금 더 듭니다)."}
        </p>
      </section>

      {/* 하단: 생성 + 결과 */}
      <div className={styles.bottom}>
        <div className={styles.generateCol}>
          <p className={styles.summary}>
            {selectedChar ? <b>{selectedChar.name}</b> : "(캐릭터 미선택)"} 캐릭터 ·{" "}
            {selectedExpr ? <b>{selectedExpr.name}</b> : "(표정 미선택)"} 표정
            {poseImage ? " · 포즈 그림 있음" : ""}
          </p>
          <button className={styles.btnGenerate} onClick={onGenerate} disabled={loading}>
            {loading ? "생성 중… (10~30초)" : "생성하기"}
          </button>
          {errorMsg && <p className={styles.error}>오류: {errorMsg}</p>}
        </div>

        <div className={styles.resultCol}>
          <div className={styles.resultBox}>
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="결과" className={styles.resultImg} />
            ) : (
              <span className={styles.resultPlaceholder}>{loading ? "그리는 중…" : "결과 그림"}</span>
            )}
          </div>
          <button className={styles.btnDownload} onClick={onDownload} disabled={!resultUrl}>
            PNG 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 캐릭터/표정 칸 (이미지가 없으면 이름 글자로 대체) =====
function Tile({
  item,
  imgSrc,
  selected,
  onClick,
}: {
  item: Item;
  imgSrc: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className={`${styles.tile} ${selected ? styles.tileSelected : ""}`}
      onClick={onClick}
    >
      <div className={styles.thumb}>
        {imgError ? (
          <span className={styles.placeholder}>{item.name}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={item.name} onError={() => setImgError(true)} />
        )}
      </div>
      <span className={styles.label}>{item.name}</span>
    </div>
  );
}
