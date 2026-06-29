"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ===== 생성 버튼: 서버(/api/illust-generate)를 호출 =====
  async function onGenerate() {
    if (!selectedChar) { alert("캐릭터를 먼저 선택해 주세요."); return; }
    if (!selectedExpr) { alert("표정을 선택해 주세요."); return; }

    setLoading(true);
    setErrorMsg(null);
    setResultUrl(null);

    try {
      // 서버에 무엇을 만들지 알려준다 (키는 서버가 가지고 있음, 화면은 모름)
      const res = await fetch("/api/illust-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedChar.id,
          expressionId: selectedExpr.id,
          poseText: poseText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "생성에 실패했습니다.");
      }
      // 서버가 돌려준 이미지(base64 데이터 URL)를 화면에 표시
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
          <span className={styles.num}>3</span> 포즈 <span className={styles.hint}>글로 쓰거나 비워두면 기본 자세로 나옵니다</span>
        </p>
        <textarea
          className={styles.textarea}
          placeholder="예: 한 손을 들어 인사하는 포즈"
          value={poseText}
          onChange={(e) => setPoseText(e.target.value)}
        />
      </section>

      {/* 하단: 생성 + 결과 */}
      <div className={styles.bottom}>
        <div className={styles.generateCol}>
          <p className={styles.summary}>
            {selectedChar ? <b>{selectedChar.name}</b> : "(캐릭터 미선택)"} 캐릭터 ·{" "}
            {selectedExpr ? <b>{selectedExpr.name}</b> : "(표정 미선택)"} 표정
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
