"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useParams } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Copy, Download,
  ExternalLink, FolderOpen, ImageIcon, Loader2, PanelsTopLeft, Plus, Save, ShieldCheck,
  Sparkles, Trash2, Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";
import {
  buildJapanStorySceneAnalysisPrompt,
  JAPAN_HORROR_ILLUSTRATION_STYLE,
  JAPAN_HORROR_SAFETY_PROMPT,
  JAPAN_STORY_SCENE_RESOLUTION,
  normalizeJapanStorySceneStylePrompt,
  parseJapanStorySceneResult,
  withJapanStorySceneResolution,
  type JapanStoryScene,
} from "@/lib/japan-longform-scenes";

type VoiceSegment = {
  section_title: string;
  text: string;
  audio_duration: number | null;
};

type Message = { kind: "error" | "notice"; text: string };
type SceneImage = {
  id: string;
  scene_id: string;
  sort_order: number;
  file_name: string;
  storage_path: string | null;
  url: string;
  created_at: string;
};
type SceneImageUploadResult = { saved: boolean; localSaved: boolean };
type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

const VISUAL_BUCKET = "japan-longform-visuals";

function imageExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) return extension === "jpeg" ? "jpg" : extension;
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  return "png";
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 70) || "장면";
}

function extensionFromStoredImage(image: SceneImage, contentType = "") {
  const extension = image.file_name.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) return extension === "jpeg" ? "jpg" : extension;
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

function newScene(projectId: number, userId: string, sortOrder: number): JapanStoryScene {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    user_id: userId,
    sort_order: sortOrder,
    scene_title: "새 장면",
    source_excerpt: "",
    insertion_seconds: 0,
    characters: [],
    location: "",
    scene_action: "",
    camera_direction: "",
    horror_level: 2,
    safety_status: "safe",
    safety_note: "",
    scene_prompt: JAPAN_STORY_SCENE_RESOLUTION,
    status: "draft",
    image_url: null,
    storage_path: null,
  };
}

function addTimings(source: VoiceSegment[]) {
  return source.reduce<{
    rows: Array<VoiceSegment & { start_seconds: number; end_seconds: number }>;
    offset: number;
  }>((result, segment) => {
    const duration = Math.max(1, Number(segment.audio_duration) || segment.text.length / 7);
    return {
      rows: [...result.rows, { ...segment, start_seconds: result.offset, end_seconds: result.offset + duration }],
      offset: result.offset + duration,
    };
  }, { rows: [], offset: 0 }).rows;
}

export default function JapanLongformScenesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [script, setScript] = useState("");
  const [voiceSegments, setVoiceSegments] = useState<VoiceSegment[]>([]);
  const [scenes, setScenes] = useState<JapanStoryScene[]>([]);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [stylePrompt, setStylePrompt] = useState(JAPAN_HORROR_ILLUSTRATION_STYLE);
  const [safetyPrompt, setSafetyPrompt] = useState(JAPAN_HORROR_SAFETY_PROMPT);
  const [sceneCount, setSceneCount] = useState(5);
  const [gptResult, setGptResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [uploadTargetSceneId, setUploadTargetSceneId] = useState("");
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [savingImagesLocally, setSavingImagesLocally] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setMessage({ kind: "error", text: "로그인이 필요합니다." });
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [projectRes, scriptRes, segmentsRes, settingsRes, scenesRes, sceneImagesRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_segments").select("section_title, text, audio_duration").eq("project_id", projectId).order("sort_order"),
        supabase.from("japan_longform_scene_settings").select("style_prompt, safety_prompt, target_scene_count").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_story_scenes").select("*").eq("project_id", projectId).order("sort_order"),
        supabase.from("japan_longform_scene_images").select("id, scene_id, sort_order, file_name, storage_path, url, created_at").eq("project_id", projectId).order("sort_order").order("created_at"),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "일본 롱폼 프로젝트");
      setScript(scriptRes.data?.verified_japanese || "");
      setVoiceSegments((segmentsRes.data || []) as VoiceSegment[]);
      if (settingsRes.data) {
        setStylePrompt(normalizeJapanStorySceneStylePrompt(settingsRes.data.style_prompt));
        setSafetyPrompt(settingsRes.data.safety_prompt || JAPAN_HORROR_SAFETY_PROMPT);
        setSceneCount(settingsRes.data.target_scene_count || 5);
      }
      setScenes(((scenesRes.data || []) as JapanStoryScene[]).map((scene) => ({
        ...scene,
        scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
      })));
      setSceneImages((sceneImagesRes.data || []) as SceneImage[]);
      const sceneSchemaReady = !settingsRes.error && !scenesRes.error && !sceneImagesRes.error;
      setSchemaReady(sceneSchemaReady);
      if (projectRes.error || scriptRes.error || segmentsRes.error) {
        setMessage({ kind: "error", text: "프로젝트 대본 또는 TTS 구간을 모두 불러오지 못했습니다." });
      } else if (!sceneSchemaReady) {
        setMessage({ kind: "error", text: "장면 일러스트 테이블이 아직 준비되지 않았습니다." });
      }
      try { setProjectFolder(await getProjectFolderHandle(projectId)); } catch { /* IndexedDB 미지원 */ }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const timedSegments = useMemo(() => {
    const source = voiceSegments.length
      ? voiceSegments
      : script.trim()
        ? [{ section_title: "최종 일본어 대본", text: script, audio_duration: null }]
        : [];
    return addTimings(source);
  }, [script, voiceSegments]);

  const analysisPrompt = useMemo(() => buildJapanStorySceneAnalysisPrompt({
    projectTitle,
    sceneCount,
    segments: timedSegments,
  }), [projectTitle, sceneCount, timedSegments]);
  const selectedUploadSceneId = scenes.some((scene) => scene.id === uploadTargetSceneId)
    ? uploadTargetSceneId
    : scenes.find((scene) => !sceneImages.some((image) => image.scene_id === scene.id))?.id || scenes[0]?.id || "";

  function updateScene(sceneId: string, values: Partial<JapanStoryScene>) {
    setScenes((current) => current.map((scene) => scene.id === sceneId ? { ...scene, ...values } : scene));
  }

  async function saveSettings() {
    if (!userId || !schemaReady) return;
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scene_settings").upsert({
      project_id: projectId,
      user_id: userId,
      style_prompt: stylePrompt.trim(),
      safety_prompt: safetyPrompt.trim(),
      target_scene_count: sceneCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    setSaving(false);
    setMessage(error
      ? { kind: "error", text: "장면 설정을 저장하지 못했습니다." }
      : { kind: "notice", text: "공통 화풍과 안전 기준을 저장했습니다." });
  }

  async function copyAnalysisPrompt(openChatGpt = false) {
    if (!timedSegments.length) return setMessage({ kind: "error", text: "최종 일본어 대본이 없습니다." });
    const chatWindow = openChatGpt ? window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer") : null;
    try {
      await navigator.clipboard.writeText(analysisPrompt);
      setMessage({ kind: "notice", text: openChatGpt ? "분석 요청문을 복사하고 ChatGPT를 열었습니다. 나온 JSON을 아래에 붙여넣으세요." : "장면 분석 요청문을 복사했습니다." });
    } catch {
      chatWindow?.close();
      setMessage({ kind: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  async function applyGptResult() {
    if (!userId || !schemaReady) return;
    try {
      const parsed = parseJapanStorySceneResult(gptResult);
      if (scenes.length && !window.confirm("현재 장면 목록을 GPT 분석 결과로 교체할까요?")) return;
      setSaving(true);
      const payload = parsed.map((scene, index) => ({
        ...scene,
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        sort_order: index,
      }));
      const { data, error } = await supabase.from("japan_longform_story_scenes").insert(payload).select("*").order("sort_order");
      if (error) throw error;
      const previousIds = scenes.map((scene) => scene.id);
      if (previousIds.length) {
        const deleteResult = await supabase.from("japan_longform_story_scenes").delete().in("id", previousIds);
        if (deleteResult.error) {
          await supabase.from("japan_longform_story_scenes").delete().in("id", payload.map((scene) => scene.id));
          throw deleteResult.error;
        }
      }
      await supabase.from("japan_longform_scene_settings").upsert({
        project_id: projectId,
        user_id: userId,
        style_prompt: stylePrompt.trim(),
        safety_prompt: safetyPrompt.trim(),
        target_scene_count: sceneCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
      setScenes((data || []) as JapanStoryScene[]);
      setMessage({ kind: "notice", text: `${payload.length}개 장면을 카드로 만들었습니다. 원하는 장면을 수정·삭제·삽입한 뒤 저장하세요.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "GPT 결과를 장면 카드로 변환하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function saveScenes() {
    if (!userId || !schemaReady || !scenes.length) return;
    setSaving(true);
    const payload = scenes.map((scene, index) => ({
      ...scene,
      project_id: projectId,
      user_id: userId,
      sort_order: index,
      scene_title: scene.scene_title.trim() || `장면 ${index + 1}`,
      scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase.from("japan_longform_story_scenes").upsert(payload).select("*").order("sort_order");
    setSaving(false);
    if (error) return setMessage({ kind: "error", text: "장면 목록을 저장하지 못했습니다." });
    setScenes((data || []) as JapanStoryScene[]);
    setMessage({ kind: "notice", text: "장면 순서와 수정 내용을 저장했습니다." });
  }

  function addScene(afterIndex: number) {
    const next = [...scenes];
    next.splice(afterIndex + 1, 0, newScene(projectId, userId, afterIndex + 1));
    setScenes(next.map((scene, index) => ({ ...scene, sort_order: index })));
  }

  async function deleteScene(scene: JapanStoryScene) {
    if (!window.confirm(`“${scene.scene_title}” 장면을 삭제할까요?`)) return;
    const attachedImages = sceneImages.filter((image) => image.scene_id === scene.id);
    const { error } = await supabase.from("japan_longform_story_scenes").delete().eq("id", scene.id);
    if (error) return setMessage({ kind: "error", text: "장면을 삭제하지 못했습니다." });
    const storagePaths = attachedImages.map((image) => image.storage_path).filter((path): path is string => Boolean(path));
    if (storagePaths.length) await supabase.storage.from(VISUAL_BUCKET).remove(storagePaths);
    setSceneImages((current) => current.filter((image) => image.scene_id !== scene.id));
    setScenes((current) => current.filter((item) => item.id !== scene.id).map((item, index) => ({ ...item, sort_order: index })));
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next.map((scene, sortOrder) => ({ ...scene, sort_order: sortOrder })));
  }

  async function copyFinalPrompt(scene: JapanStoryScene) {
    const characterLine = scene.characters.length ? `Characters: ${scene.characters.join(", ")}.` : "";
    const removeResolution = (value: string) => value
      .replace(/^\s*1920\s*(?:x|×|\*)\s*1080\s*pixels,\s*16:9\s*widescreen\s*composition\.\s*/i, "")
      .trim();
    const prompt = [
      JAPAN_STORY_SCENE_RESOLUTION,
      removeResolution(stylePrompt),
      characterLine,
      removeResolution(scene.scene_prompt),
      safetyPrompt.trim(),
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: `“${scene.scene_title}” 이미지 프롬프트를 복사했습니다.` });
    } catch {
      setMessage({ kind: "error", text: "프롬프트 복사에 실패했습니다." });
    }
  }

  async function connectProjectFolder() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return setMessage({ kind: "error", text: "폴더 연결은 Chrome 또는 Edge에서 사용할 수 있습니다." });
    try {
      const handle = await picker({ id: `japan-longform-${projectId}`, mode: "readwrite" });
      await saveProjectFolderHandle(projectId, handle);
      await handle.getDirectoryHandle("이미지", { create: true });
      setProjectFolder(handle);
      setMessage({ kind: "notice", text: `${handle.name} / 이미지 폴더를 연결했습니다. 이후 장면 이미지는 자동 저장됩니다.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage({ kind: "error", text: "프로젝트 폴더를 연결하지 못했습니다." });
    }
  }

  async function writeSceneImageLocally(
    folder: FileSystemDirectoryHandle,
    blob: Blob,
    scene: JapanStoryScene,
    imageNumber: number,
    extension: string,
  ) {
    const imageFolder = await folder.getDirectoryHandle("이미지", { create: true });
    const fileName = `${safeFileName(projectTitle)}_${scene.sort_order + 1}-${imageNumber}_${safeFileName(scene.scene_title)}.${extension}`;
    await writeBlobToFolder(imageFolder, fileName, blob);
  }

  async function saveAllSceneImagesLocally() {
    if (!projectFolder) return setMessage({ kind: "error", text: "프로젝트 폴더를 먼저 연결해주세요." });
    if (!sceneImages.length) return setMessage({ kind: "error", text: "저장할 장면 이미지가 없습니다." });
    setSavingImagesLocally(true);
    try {
      const permission = await (projectFolder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      let savedCount = 0;
      for (const scene of scenes) {
        const images = sceneImages.filter((image) => image.scene_id === scene.id).sort((a, b) => a.sort_order - b.sort_order);
        for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
          const response = await fetch(images[imageIndex].url);
          if (!response.ok) throw new Error(`${scene.sort_order + 1}-${imageIndex + 1} 이미지를 불러오지 못했습니다.`);
          await writeSceneImageLocally(
            projectFolder,
            await response.blob(),
            scene,
            imageIndex + 1,
            extensionFromStoredImage(images[imageIndex], response.headers.get("content-type") || ""),
          );
          savedCount += 1;
        }
      }
      setMessage({ kind: "notice", text: `${projectFolder.name} / 이미지 폴더에 장면 이미지 ${savedCount}장을 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "장면 이미지 전체 저장에 실패했습니다." });
    } finally {
      setSavingImagesLocally(false);
    }
  }

  async function uploadSceneImage(scene: JapanStoryScene, file: File, requestedSortOrder?: number): Promise<SceneImageUploadResult> {
    if (!userId || !schemaReady) return { saved: false, localSaved: false };
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "PNG, JPG 또는 WEBP 이미지를 올려주세요." });
      return { saved: false, localSaved: false };
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage({ kind: "error", text: "장면 이미지는 20MB 이하만 저장할 수 있습니다." });
      return { saved: false, localSaved: false };
    }
    let localWriteAllowed = false;
    if (projectFolder) {
      try {
        localWriteAllowed = await (projectFolder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" }) === "granted";
      } catch { /* 로컬 권한 실패 시 클라우드 저장만 계속한다. */ }
    }
    setUploadingSceneId(scene.id);
    setMessage(null);
    const extension = imageExtension(file);
    const storagePath = `${userId}/${projectId}/story-scenes/${scene.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const existingImages = sceneImages.filter((image) => image.scene_id === scene.id);
    const sortOrder = requestedSortOrder ?? (existingImages.length
      ? Math.max(...existingImages.map((image) => image.sort_order)) + 1
      : 0);
    try {
      const { error: sceneError } = await supabase.from("japan_longform_story_scenes").upsert({
        ...scene,
        project_id: projectId,
        user_id: userId,
        scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
        status: scene.status,
        updated_at: new Date().toISOString(),
      });
      if (sceneError) throw sceneError;
      const { error: uploadError } = await supabase.storage.from(VISUAL_BUCKET).upload(storagePath, file, {
        contentType: file.type || `image/${extension}`,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const imageUrl = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      const { data, error } = await supabase.from("japan_longform_scene_images").insert({
        scene_id: scene.id,
        project_id: projectId,
        user_id: userId,
        sort_order: sortOrder,
        file_name: file.name || `장면_${scene.sort_order + 1}_${sortOrder + 1}.${extension}`,
        storage_path: storagePath,
        url: imageUrl,
      }).select("id, scene_id, sort_order, file_name, storage_path, url, created_at").single();
      if (error) {
        await supabase.storage.from(VISUAL_BUCKET).remove([storagePath]);
        throw error;
      }
      const { data: coverImage } = await supabase.from("japan_longform_scene_images")
        .select("url, storage_path")
        .eq("scene_id", scene.id)
        .order("sort_order")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      await supabase.from("japan_longform_story_scenes").update({
        image_url: coverImage?.url || imageUrl,
        storage_path: coverImage?.storage_path || storagePath,
        status: "generated",
        updated_at: new Date().toISOString(),
      }).eq("id", scene.id);
      setSceneImages((current) => [...current, data as SceneImage].sort((a, b) => a.sort_order - b.sort_order));
      setScenes((current) => current.map((item) => item.id === scene.id ? {
        ...item,
        status: "generated",
        image_url: coverImage?.url || imageUrl,
        storage_path: coverImage?.storage_path || storagePath,
      } : item));
      let localSaved = false;
      if (projectFolder && localWriteAllowed) {
        try {
          await writeSceneImageLocally(projectFolder, file, scene, sortOrder + 1, extension);
          localSaved = true;
        } catch { /* 클라우드 저장은 유지하고 로컬 저장만 건너뛴다. */ }
      }
      setMessage({ kind: "notice", text: localSaved
        ? `“${scene.scene_title}” 이미지를 프로젝트와 로컬 이미지 폴더에 저장했습니다.`
        : `“${scene.scene_title}” 이미지를 프로젝트에 저장했습니다. 로컬 저장은 프로젝트 폴더를 연결해주세요.` });
      return { saved: true, localSaved };
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "장면 이미지를 저장하지 못했습니다." });
      return { saved: false, localSaved: false };
    } finally {
      setUploadingSceneId(null);
    }
  }

  function pasteGalleryImage(event: ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return setMessage({ kind: "error", text: "클립보드에 복사된 이미지가 없습니다." });
    const scene = scenes.find((item) => item.id === selectedUploadSceneId);
    if (!scene) return setMessage({ kind: "error", text: "이미지를 연결할 장면을 먼저 선택해주세요." });
    event.preventDefault();
    const images = sceneImages.filter((image) => image.scene_id === scene.id);
    const nextSortOrder = images.length ? Math.max(...images.map((image) => image.sort_order)) + 1 : 0;
    void uploadSceneImage(scene, file, nextSortOrder);
  }

  async function chooseSceneImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const startIndex = scenes.findIndex((scene) => scene.id === selectedUploadSceneId);
    if (startIndex < 0) return setMessage({ kind: "error", text: "이미지를 연결할 시작 장면을 선택해주세요." });
    const target = scenes[startIndex];
    const existingImages = sceneImages.filter((image) => image.scene_id === target.id);
    const firstSortOrder = existingImages.length ? Math.max(...existingImages.map((image) => image.sort_order)) + 1 : 0;
    let savedCount = 0;
    let localSavedCount = 0;
    for (let index = 0; index < files.length; index += 1) {
      const result = await uploadSceneImage(target, files[index], firstSortOrder + index);
      if (result.saved) savedCount += 1;
      if (result.localSaved) localSavedCount += 1;
    }
    setMessage(savedCount === files.length
      ? { kind: "notice", text: `${savedCount}개 이미지를 “${target.scene_title}”에 저장했습니다.${localSavedCount === savedCount ? " 로컬 이미지 폴더에도 저장했습니다." : " 로컬 저장은 프로젝트 폴더 연결 상태를 확인해주세요."}` }
      : { kind: "error", text: `${files.length}개 중 ${savedCount}개만 저장됐습니다. 실패한 장면을 확인해주세요.` });
  }

  async function removeSceneImage(scene: JapanStoryScene, image: SceneImage) {
    if (!window.confirm(`${scene.sort_order + 1}-${image.sort_order + 1} 이미지를 삭제할까요?`)) return;
    const { error } = await supabase.from("japan_longform_scene_images").delete().eq("id", image.id);
    if (error) return setMessage({ kind: "error", text: "장면 이미지 연결을 삭제하지 못했습니다." });
    if (image.storage_path) await supabase.storage.from(VISUAL_BUCKET).remove([image.storage_path]);
    const remaining = sceneImages
      .filter((item) => item.scene_id === scene.id && item.id !== image.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const nextCover = remaining[0] || null;
    await supabase.from("japan_longform_story_scenes").update({
      image_url: nextCover?.url || null,
      storage_path: nextCover?.storage_path || null,
      status: nextCover ? "generated" : "approved",
      updated_at: new Date().toISOString(),
    }).eq("id", scene.id);
    setSceneImages((current) => current.filter((item) => item.id !== image.id));
    updateScene(scene.id, {
      image_url: nextCover?.url || null,
      storage_path: nextCover?.storage_path || null,
      status: nextCover ? "generated" : "approved",
    });
    setMessage({ kind: "notice", text: "장면 이미지를 삭제했습니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><PanelsTopLeft className="text-sky-700" /> 주요 장면 일러스트</h1><p className="mt-2 text-sm text-muted-foreground">API 없이 분석 요청문을 ChatGPT에 붙여넣고, 나온 JSON을 편집 가능한 장면 카드로 바꿉니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {!schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Supabase에서 `20260723_longform_japan_story_scenes.sql`과 `20260724_longform_japan_scene_images.sql`을 순서대로 실행해주세요.</div>}

    <details className="group rounded-2xl border border-border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-6">
        <ShieldCheck size={19} className="text-sky-700" />
        <div className="min-w-0 flex-1"><h2 className="font-bold">작품 공통 기준</h2><p className="mt-1 text-xs text-muted-foreground">한 번 설정한 공통 화풍과 안전 기준을 확인하거나 수정합니다.</p></div>
        <span className="text-xs font-bold text-muted-foreground group-open:hidden">펼치기</span>
        <span className="hidden text-xs font-bold text-muted-foreground group-open:inline">접기</span>
      </summary>
      <div className="border-t border-border p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-2"><label className="text-sm font-bold">공통 이미지 스타일<textarea value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-border p-4 text-xs leading-6 outline-none focus:border-sky-600" /></label><label className="text-sm font-bold">YouTube 안전 연출 기준<textarea value={safetyPrompt} onChange={(event) => setSafetyPrompt(event.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-border p-4 text-xs leading-6 outline-none focus:border-sky-600" /></label></div>
        <button onClick={saveSettings} disabled={saving || !schemaReady} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 text-sm font-bold text-sky-700 disabled:opacity-40"><Save size={15} /> 설정 저장</button>
      </div>
    </details>

    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">수동 GPT 분석</span><h2 className="mt-3 text-xl font-bold">중요 장면 초안 만들기</h2><p className="mt-1 text-sm text-muted-foreground">최종 일본어 대본과 TTS 시간 정보를 분석 요청문에 포함합니다. OpenAI API 키는 사용하지 않습니다.</p></div><label className="flex items-center gap-2 text-sm font-bold">장면 수<select value={sceneCount} onChange={(event) => setSceneCount(Number(event.target.value))} className="h-10 rounded-xl border border-border bg-white px-3">{[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}장</option>)}</select></label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => copyAnalysisPrompt(false)} disabled={!timedSegments.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 text-sm font-bold text-violet-700 disabled:opacity-40"><Copy size={16} /> 분석 프롬프트만 복사</button><button onClick={() => copyAnalysisPrompt(true)} disabled={!timedSegments.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 text-sm font-bold text-white disabled:opacity-40"><ExternalLink size={16} /> 복사하고 ChatGPT 열기</button></div>
      <label className="mt-5 block text-sm font-bold">ChatGPT JSON 결과 붙여넣기<textarea value={gptResult} onChange={(event) => setGptResult(event.target.value)} placeholder='{"scenes":[{"scene_title":"..."}]}' className="mt-2 min-h-72 w-full resize-y rounded-xl border border-border bg-stone-50 p-4 font-mono text-xs leading-6 outline-none focus:border-violet-500" /></label>
      <button onClick={applyGptResult} disabled={saving || !schemaReady || !gptResult.trim()} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} 장면 카드로 적용</button>
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">장면 작업 목록</h2><p className="mt-1 text-xs text-muted-foreground">{scenes.length}개 · 직접 수정, 순서 변경, 사이 삽입이 가능합니다.</p></div><div className="flex gap-2"><button onClick={() => addScene(scenes.length - 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} /> 장면 추가</button><button onClick={saveScenes} disabled={saving || !schemaReady || !scenes.length} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 전체 저장</button></div></div>
      {scenes.length ? <div className="mt-5 space-y-3">{scenes.map((scene, index) => <div key={scene.id}>
        <article className={`rounded-2xl border p-4 sm:p-5 ${scene.safety_status === "safe" ? "border-border" : scene.safety_status === "review" ? "border-amber-300 bg-amber-50/30" : "border-red-300 bg-red-50/30"}`}>
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">{index + 1}</span><div className="min-w-0 flex-1 space-y-4">
            <label className="block text-xs font-bold text-muted-foreground">장면 제목<input value={scene.scene_title} onChange={(event) => updateScene(scene.id, { scene_title: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-bold text-foreground outline-none focus:border-sky-600" /></label>
            <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-muted-foreground">등장인물 · 쉼표로 구분<input value={scene.characters.join(", ")} onChange={(event) => updateScene(scene.id, { characters: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">장소<input value={scene.location} onChange={(event) => updateScene(scene.id, { location: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">장면 행동<textarea value={scene.scene_action} onChange={(event) => updateScene(scene.id, { scene_action: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">구도 · 카메라<textarea value={scene.camera_direction} onChange={(event) => updateScene(scene.id, { camera_direction: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground" /></label></div>
            <label className="block text-xs font-bold text-muted-foreground">프롬프트<textarea value={scene.scene_prompt} onChange={(event) => updateScene(scene.id, { scene_prompt: event.target.value })} className="mt-1.5 min-h-28 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground outline-none focus:border-sky-600" /></label>
            <button onClick={() => copyFinalPrompt(scene)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 text-sm font-bold text-sky-700"><Copy size={15} /> 최종 프롬프트 복사</button>
          </div><div className="flex shrink-0 flex-col gap-1"><button onClick={() => moveScene(index, -1)} disabled={index === 0} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowUp size={14} /></button><button onClick={() => moveScene(index, 1)} disabled={index === scenes.length - 1} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowDown size={14} /></button><button onClick={() => deleteScene(scene)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div>
        </article>
        <div className="flex items-center gap-2 py-2"><div className="h-px flex-1 bg-border" /><button onClick={() => addScene(index)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11px] font-bold text-muted-foreground"><Plus size={11} /> 여기에 장면 삽입</button><div className="h-px flex-1 bg-border" /></div>
      </div>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center"><PanelsTopLeft className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">ChatGPT 분석 결과를 적용하거나 장면을 직접 추가하세요.</p><button onClick={() => addScene(-1)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white"><Plus size={15} /> 첫 장면 추가</button></div>}
    </section>
    {scenes.length > 0 && <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
      <div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">이미지 보관함</span><h2 className="mt-3 flex items-center gap-2 text-xl font-bold"><ImageIcon size={20} className="text-violet-700" /> 생성 이미지 모음</h2><p className="mt-1 text-sm text-muted-foreground">장면을 선택하고 이미지를 계속 추가하세요. 1번 장면에 두 장을 올리면 1-1, 1-2로 함께 보관됩니다.</p></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
        <label className="text-xs font-bold text-muted-foreground">이미지를 추가할 장면<select value={selectedUploadSceneId} onChange={(event) => setUploadTargetSceneId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-foreground">{scenes.map((scene, index) => { const count = sceneImages.filter((image) => image.scene_id === scene.id).length; return <option key={scene.id} value={scene.id}>{index + 1}. {scene.scene_title}{count ? ` · ${count}장` : ""}</option>; })}</select></label>
        <div tabIndex={0} onPaste={pasteGalleryImage} className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 text-center outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-100 sm:flex-row sm:justify-between sm:text-left"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm">{uploadingSceneId ? <Loader2 size={18} className="animate-spin" /> : <ClipboardPaste size={18} />}</div><div><p className="text-sm font-bold">{uploadingSceneId ? "이미지 저장 중" : "여기를 클릭한 뒤 Ctrl+V"}</p><p className="mt-1 text-xs text-muted-foreground">클립보드 이미지는 선택한 장면 한 곳에 저장됩니다.</p></div></div><label className="mt-3 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-xs font-bold text-white sm:mt-0"><Upload size={14} /> 여러 파일 올리기<input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" disabled={Boolean(uploadingSceneId)} onChange={chooseSceneImages} /></label></div>
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-stone-50 p-4 sm:flex-row sm:items-center"><FolderOpen size={19} className="shrink-0 text-violet-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">내 컴퓨터 이미지 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 이미지에 새 장면 이미지 자동 저장` : "프로젝트 폴더를 연결하면 안에 이미지 폴더를 만들고 자동 저장합니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button><button onClick={saveAllSceneImagesLocally} disabled={!projectFolder || !sceneImages.length || savingImagesLocally} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white disabled:opacity-40">{savingImagesLocally ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 기존 이미지 전체 저장</button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{scenes.flatMap((scene, sceneIndex) => {
        const images = sceneImages.filter((image) => image.scene_id === scene.id).sort((a, b) => a.sort_order - b.sort_order);
        const selected = scene.id === selectedUploadSceneId;
        if (!images.length) return [<article key={`${scene.id}-empty`} onClick={() => setUploadTargetSceneId(scene.id)} className={`cursor-pointer overflow-hidden rounded-xl border bg-stone-50 transition ${selected ? "border-violet-600 ring-2 ring-violet-100" : "border-border hover:border-violet-300"}`}><div className="relative aspect-video bg-stone-100"><div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"><ImageIcon size={20} /><span className="mt-1 text-[10px]">이미지 없음</span></div>{uploadingSceneId === scene.id && <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><Loader2 size={20} className="animate-spin" /></div>}<span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">{sceneIndex + 1}</span></div><div className="p-2"><p className="truncate text-xs font-bold" title={scene.scene_title}>{scene.scene_title}</p><p className="mt-1 text-[10px] text-muted-foreground">선택 후 붙여넣기</p></div></article>];
        return images.map((image, imageIndex) => <article key={image.id} onClick={() => setUploadTargetSceneId(scene.id)} className={`cursor-pointer overflow-hidden rounded-xl border bg-stone-50 transition ${selected ? "border-violet-600 ring-2 ring-violet-100" : "border-border hover:border-violet-300"}`}><div className="relative aspect-video bg-stone-100"><NextImage src={image.url} alt={`${scene.scene_title} ${imageIndex + 1}번 이미지`} fill unoptimized sizes="240px" className="object-cover" />{uploadingSceneId === scene.id && <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><Loader2 size={20} className="animate-spin" /></div>}<span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{sceneIndex + 1}-{imageIndex + 1}</span></div><div className="p-2"><p className="truncate text-xs font-bold" title={scene.scene_title}>{scene.scene_title}</p><div className="mt-2 grid grid-cols-2 gap-1"><a href={image.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-white text-[10px] font-bold"><Download size={10} /> 원본</a><button onClick={(event) => { event.stopPropagation(); void removeSceneImage(scene, image); }} className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-red-200 bg-white text-[10px] font-bold text-red-600"><Trash2 size={10} /> 삭제</button></div></div></article>);
      })}</div>
    </section>}
    {scenes.length > 0 && <Link href={`/studio/longform-japan/projects/${projectId}/motion`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">루프 영상 단계로 <ArrowRight size={16} /></Link>}
  </div>;
}
