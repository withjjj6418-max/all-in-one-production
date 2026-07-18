"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./page.module.css";
import { storyCharacters as characters, storyExpressions as expressions } from "@/features/story/character-options";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

// ===== 데이터: 화면에 보일 이름 (네가 정한 표 그대로) =====
type Item = { readonly id: string; readonly name: string };
type ScenePosition = "left" | "center" | "right";

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "캐릭터";
}

function loadDataImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("생성된 캐릭터 이미지를 불러오지 못했습니다."));
    image.src = source;
  });
}

function removeWhiteBackground(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("이미지 합성 화면을 만들지 못했습니다.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const red = pixels.data[offset];
      const green = pixels.data[offset + 1];
      const blue = pixels.data[offset + 2];
      const nearWhite = red > 242 && green > 242 && blue > 242 && Math.max(red, green, blue) - Math.min(red, green, blue) < 12;
      if (nearWhite) {
        pixels.data[offset + 3] = 0;
      } else if (pixels.data[offset + 3] > 0) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  if (minX > maxX || minY > maxY) return { canvas, x: 0, y: 0, width: canvas.width, height: canvas.height };
  return { canvas, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function composeActorImages(sources: string[], positions: ScenePosition[]) {
  const outputSize = 1024;
  const output = document.createElement("canvas");
  output.width = outputSize;
  output.height = outputSize;
  const context = output.getContext("2d");
  if (!context) throw new Error("두 캐릭터를 합성하지 못했습니다.");
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, outputSize, outputSize);
  const preparedActors = await Promise.all(sources.map(async (source) => removeWhiteBackground(await loadDataImage(source))));
  const centerByPosition: Record<ScenePosition, number> = { left: 285, center: 512, right: 739 };
  for (const [index, actor] of preparedActors.entries()) {
    const scale = Math.min(440 / actor.width, 900 / actor.height);
    const targetWidth = actor.width * scale;
    const targetHeight = actor.height * scale;
    const targetX = centerByPosition[positions[index]] - targetWidth / 2;
    const targetY = 970 - targetHeight;
    context.drawImage(actor.canvas, actor.x, actor.y, actor.width, actor.height, targetX, targetY, targetWidth, targetHeight);
  }
  return output.toDataURL("image/png");
}

export default function Home() {
  // ===== 현재 선택 상태 =====
  const [selectedChar, setSelectedChar] = useState<Item | null>(null);
  const [selectedExpr, setSelectedExpr] = useState<Item | null>(null);
  const [poseText, setPoseText] = useState("");
  const [propImage, setPropImage] = useState<string | null>(null);
  const [propName, setPropName] = useState("소품");
  const [propText, setPropText] = useState("");
  const [propPosition, setPropPosition] = useState<ScenePosition>("center");
  const [secondEnabled, setSecondEnabled] = useState(false);
  const [secondChar, setSecondChar] = useState<Item | null>(null);
  const [secondExpr, setSecondExpr] = useState<Item | null>(null);
  const [secondPoseText, setSecondPoseText] = useState("");
  const [primaryPosition, setPrimaryPosition] = useState<ScenePosition>("left");
  const [secondPosition, setSecondPosition] = useState<ScenePosition>("right");
  const [sceneText, setSceneText] = useState("");
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
  const [projectId, setProjectId] = useState<number | null>(null);
  const [cueId, setCueId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const project = Number(params.get("project_id"));
    const character = characters.find((item) => item.id === params.get("character"));
    const expression = expressions.find((item) => item.id === params.get("expression"));
    const timeout = window.setTimeout(() => {
      if (Number.isFinite(project) && project > 0) setProjectId(project);
      setCueId(params.get("cue_id"));
      if (character) setSelectedChar(character);
      if (expression) setSelectedExpr(expression);
      if (params.get("pose")) setPoseText(params.get("pose") || "");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

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

  function propFileToDataUrl(file: File) {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("소품은 이미지 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 5_000_000) {
      setErrorMsg("소품 이미지는 5MB 이하로 올려주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      const name = file.name.replace(/\.[^.]+$/, "").trim();
      setPropImage(image);
      setPropName(name || "소품");
      setErrorMsg(null);
    };
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
    if (secondEnabled && !secondChar) { alert("두 번째 캐릭터를 선택해 주세요."); return; }
    if (secondEnabled && !secondExpr) { alert("두 번째 표정을 선택해 주세요."); return; }
    if (secondEnabled && selectedChar.id === secondChar?.id) { alert("두 명 장면에서는 서로 다른 캐릭터를 선택해 주세요."); return; }
    if (secondEnabled && primaryPosition === secondPosition) { alert("두 캐릭터의 화면 위치를 다르게 선택해 주세요."); return; }

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
          propImage,
          propText: propText.trim(),
          propPosition,
          primaryPosition: secondEnabled ? primaryPosition : "center",
          sceneText: secondEnabled ? sceneText.trim() : "",
          secondCharacter: secondEnabled && secondExpr ? {
            characterId: secondChar?.id || "",
            expressionId: secondExpr.id,
            poseText: secondPoseText.trim(),
            position: secondPosition,
          } : null,
          exprMode: exprMode,   // 표정 충실도
          quality: quality,     // 모델 품질
        }),
      });

      const data = await res.json() as { image?: string; actorImages?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "생성에 실패했습니다.");
      }
      const generatedImage = data.actorImages?.length === 2
        ? await composeActorImages(data.actorImages, [primaryPosition, secondPosition])
        : data.image;
      if (!generatedImage) throw new Error("생성된 이미지를 확인하지 못했습니다.");
      setResultUrl(generatedImage);
      setSaved(false);
      setSaveNotice(null);
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
    a.download = secondEnabled && secondExpr
      ? `${selectedChar?.id}_${selectedExpr?.id}_${secondChar?.id}_${secondExpr.id}.png`
      : `${selectedChar?.id}_${selectedExpr?.id}.png`;
    a.click();
  }

  async function saveToProject() {
    if (!resultUrl || !projectId || !selectedExpr) return;
    setSaving(true);
    setErrorMsg(null);
    setSaveNotice(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");
      let projectFolder: FileSystemDirectoryHandle | null = null;
      let localFolderReason = "연결된 프로젝트 폴더가 없어 클라우드에만 저장했습니다.";
      try {
        const savedHandle = await getProjectFolderHandle(projectId);
        if (savedHandle) {
          const permissionHandle = savedHandle as PermissionDirectoryHandle;
          let permission = await permissionHandle.queryPermission?.({ mode: "readwrite" });
          if (permission !== "granted") permission = await permissionHandle.requestPermission?.({ mode: "readwrite" });
          if (permission === "granted") projectFolder = savedHandle;
          else localFolderReason = "프로젝트 폴더 권한이 없어 클라우드에만 저장했습니다. TTS 화면에서 폴더를 다시 연결해주세요.";
        }
      } catch {
        localFolderReason = "프로젝트 폴더를 열지 못해 클라우드에만 저장했습니다. TTS 화면에서 폴더를 다시 연결해주세요.";
      }
      const blob = await fetch(resultUrl).then((response) => response.blob());
      const path = `${user.id}/${projectId}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from("story-images").upload(path, blob, { contentType: "image/png" });
      if (uploadError) throw new Error("이미지 저장소 업로드에 실패했습니다. 캐릭터 SQL 마이그레이션을 확인해주세요.");
      const { data: publicUrl } = supabase.storage.from("story-images").getPublicUrl(path);
      const title = secondEnabled && secondExpr
        ? `${selectedChar?.name || "캐릭터"}·${selectedExpr.name} + ${secondChar?.name || "캐릭터 2"}·${secondExpr.name}`
        : `${selectedChar?.name || "캐릭터"} · ${selectedExpr.name}`;
      const imageMemo = [poseText.trim(), secondEnabled ? secondPoseText.trim() : "", secondEnabled ? sceneText.trim() : "", propImage ? `${propName}: ${propText.trim() || "소품 추가"}` : ""].filter(Boolean).join(" / ");
      const { error: imageError } = await supabase.from("post_images").insert({
        user_id: user.id, project_id: projectId, title, url: publicUrl.publicUrl,
        cue_id: cueId, memo: imageMemo || null,
      });
      if (imageError) throw new Error("프로젝트 이미지 기록 저장에 실패했습니다.");
      let cueOrder: number | null = null;
      if (cueId) {
        const { data: cue } = await supabase.from("story_character_cues").update({ image_url: publicUrl.publicUrl, status: "done", updated_at: new Date().toISOString() }).eq("id", cueId).select("sort_order").maybeSingle();
        cueOrder = typeof cue?.sort_order === "number" ? cue.sort_order : null;
      }
      if (projectFolder) {
        try {
          const characterFolder = await projectFolder.getDirectoryHandle("캐릭터", { create: true });
          const orderPrefix = cueOrder === null ? "" : `${String(cueOrder + 1).padStart(2, "0")}_`;
          const fileName = `${orderPrefix}${safeFileName(title)}_${crypto.randomUUID().slice(0, 8)}.png`;
          await writeBlobToFolder(characterFolder, fileName, blob);
          setSaveNotice(`프로젝트와 ${projectFolder.name}\\캐릭터 폴더에 함께 저장했습니다.`);
        } catch {
          setSaveNotice("프로젝트 저장은 완료했지만 컴퓨터의 캐릭터 폴더에는 저장하지 못했습니다. 폴더 권한을 다시 확인해주세요.");
        }
      } else {
        setSaveNotice(localFolderReason);
      }
      setSaved(true);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "프로젝트 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <header>
        <h1 className={styles.title}>캐릭터 일러스트 생성기</h1>
        <p className={styles.subtitle}>캐릭터와 표정을 고르고 포즈를 입력하면 흰 배경 PNG가 나옵니다</p>
      </header>

      {/* 1. 캐릭터 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}><span className={styles.num}>1</span> 캐릭터 <span className={styles.hint}>16종 중 하나를 클릭</span></p>
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

      {/* 4. 소품 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}><span className={styles.num}>4</span> 소품 · 참고 이미지 <span className={styles.hint}>필요할 때만 추가</span></p>
        <label className={styles.characterUpload}>
          <input type="file" accept="image/png,image/jpeg,image/webp" className={styles.hiddenInput} onChange={(event) => { const file = event.target.files?.[0]; if (file) propFileToDataUrl(file); event.currentTarget.value = ""; }} />
          {propImage ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={propImage} alt={propName} />
            <span><b>{propName}</b><small>클릭해서 다른 소품으로 변경</small></span>
          </> : <span><b>이라스토야·소품 이미지 선택</b><small>사람이 아닌 물건·가구·차량 등 · PNG, JPG, WebP · 최대 5MB</small></span>}
        </label>
        {propImage && <div className={styles.propFields}><select value={propPosition} onChange={(event) => setPropPosition(event.target.value as ScenePosition)}><option value="left">왼쪽 배치</option><option value="center">가운데 배치</option><option value="right">오른쪽 배치</option></select><input value={propText} onChange={(event) => setPropText(event.target.value)} placeholder="소품 사용 방법: 예) 캐릭터가 휴대폰을 들고 화면을 보고 있음" /><button type="button" className={styles.btnRemove} onClick={() => { setPropImage(null); setPropText(""); }}>소품 제거</button></div>}
      </section>

      {/* 5. 두 번째 캐릭터 */}
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionTitle}><span className={styles.num}>5</span> 함께 나오는 캐릭터 <span className={styles.hint}>필요할 때만 추가</span></p>
          <button type="button" className={secondEnabled ? styles.btnRemove : styles.btnSub} onClick={() => {
            if (secondEnabled) {
              setSecondEnabled(false); setSecondChar(null); setSecondExpr(null); setSecondPoseText(""); setSceneText("");
            } else {
              setSecondEnabled(true);
              setSecondChar(characters.find((item) => item.id !== selectedChar?.id) || characters[0]);
              setSecondExpr(expressions.find((item) => item.id === "expr10") || expressions[0]);
            }
          }}>{secondEnabled ? "두 번째 캐릭터 제거" : "+ 두 번째 캐릭터 추가"}</button>
        </div>
        {secondEnabled && <div className={styles.secondActorCard}>
          <div className={styles.actorFields}>
            <label><span>두 번째 캐릭터</span><select value={secondChar?.id || ""} onChange={(event) => setSecondChar(characters.find((item) => item.id === event.target.value) || null)}><option value="">선택</option>{characters.map((item) => <option key={item.id} value={item.id} disabled={item.id === selectedChar?.id}>{item.name}</option>)}</select></label>
            <label><span>두 번째 표정</span><select value={secondExpr?.id || ""} onChange={(event) => setSecondExpr(expressions.find((item) => item.id === event.target.value) || null)}><option value="">선택</option>{expressions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>첫 번째 위치</span><select value={primaryPosition} onChange={(event) => setPrimaryPosition(event.target.value as ScenePosition)}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
            <label><span>두 번째 위치</span><select value={secondPosition} onChange={(event) => setSecondPosition(event.target.value as ScenePosition)}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
          </div>
          <div className={styles.secondPreviews}>
            {secondChar && <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/${secondChar.id}_thumb.png`} alt={secondChar.name} />
              <span>{secondChar.name}</span>
            </div>}
            {secondExpr && <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/${secondExpr.id}.png`} alt={secondExpr.name} />
              <span>{secondExpr.name}</span>
            </div>}
          </div>
          <textarea className={styles.textarea} placeholder="두 번째 캐릭터 포즈: 예) 첫 번째 인물을 가리키며 화내는 자세" value={secondPoseText} onChange={(event) => setSecondPoseText(event.target.value)} />
          <textarea className={styles.textarea} placeholder="두 사람의 상황: 예) 부부가 서로 마주 보고 말다툼하는 장면" value={sceneText} onChange={(event) => setSceneText(event.target.value)} />
        </div>}
      </section>

      {/* 6. 옵션 */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>
          <span className={styles.num}>6</span> 옵션 <span className={styles.hint}>결과가 마음에 안 들면 바꿔보세요</span>
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
            {secondEnabled && secondExpr ? <> · <b>{secondChar?.name || "두 번째 캐릭터"}</b> + <b>{secondExpr.name}</b></> : ""}
            {propImage ? <> · 소품 <b>{propName}</b></> : ""}
            {poseImage ? " · 포즈 그림 있음" : ""}
          </p>
          <button className={styles.btnGenerate} onClick={onGenerate} disabled={loading}>
            {loading ? secondEnabled ? "두 캐릭터 생성 중… (20~60초)" : "생성 중… (10~30초)" : "생성하기"}
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
          {projectId && (
            <button className={styles.btnDownload} onClick={saveToProject} disabled={!resultUrl || saving || saved}>
              {saving ? "프로젝트에 저장 중…" : saved ? "프로젝트에 저장됨" : "프로젝트에 저장"}
            </button>
          )}
          {saveNotice && <p className={styles.saveNotice}>{saveNotice}</p>}
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
