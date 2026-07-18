"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, BookOpen, ChevronRight, ClipboardPaste, Copy, ExternalLink, FileClock, FilePenLine,
  Globe2, Loader2, Play, Plus, Save, Trash2, WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SourceKind = "youtube" | "web" | "screenshot" | "text";
type StorySource = {
  id: string;
  source_kind: SourceKind;
  title: string;
  source_url: string | null;
  content: string;
  created_at: string;
};
type Adaptation = {
  id: string;
  source_title: string;
  content: string;
  model: string;
  created_at: string;
};
type SourceDraft = { id?: string; source_kind: SourceKind; title: string; source_url: string; content: string };

const emptyDraft: SourceDraft = { source_kind: "text", title: "", source_url: "", content: "" };

const kindMeta: Record<SourceKind, { label: string; icon: typeof Globe2 }> = {
  youtube: { label: "유튜브", icon: Play },
  web: { label: "웹 사연", icon: Globe2 },
  screenshot: { label: "캡처 원문", icon: ClipboardPaste },
  text: { label: "직접 입력", icon: FilePenLine },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function StoryDevelopmentPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [sources, setSources] = useState<StorySource[]>([]);
  const [adaptations, setAdaptations] = useState<Adaptation[]>([]);
  const [draft, setDraft] = useState<SourceDraft>(emptyDraft);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [resultModel, setResultModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fetchingYoutube, setFetchingYoutube] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;

  useEffect(() => {
    let active = true;
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [projectRes, sourcesRes, adaptationsRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("story_sources").select("id, source_kind, title, source_url, content, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("story_adaptations").select("id, source_title, content, model, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
      ]);
      if (!active) return;

      setProjectTitle(projectRes.data?.title ?? "사연 프로젝트");
      if (sourcesRes.error || adaptationsRes.error) {
        const missingTable = [sourcesRes.error, adaptationsRes.error].some((item) => item?.code === "42P01" || item?.code === "PGRST205");
        if (missingTable) setSchemaReady(false);
        else setError("사연 제작 데이터를 불러오지 못했습니다.");
      } else {
        const loadedSources = (sourcesRes.data ?? []) as StorySource[];
        setSources(loadedSources);
        setAdaptations((adaptationsRes.data ?? []) as Adaptation[]);
        if (loadedSources[0]) setSelectedSourceId(loadedSources[0].id);
        if (adaptationsRes.data?.[0]) {
          setResult(adaptationsRes.data[0].content);
          setResultModel(adaptationsRes.data[0].model);
        }
      }
      setLoading(false);
    }
    loadData();
    return () => { active = false; };
  }, [projectId, supabase]);

  const clearMessages = () => { setNotice(null); setError(null); };

  const importYoutube = async () => {
    clearMessages();
    if (!draft.source_url.trim()) return setError("유튜브 URL을 먼저 입력해주세요.");
    setFetchingYoutube(true);
    try {
      const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(draft.source_url.trim())}`);
      const payload = await response.json() as { success?: boolean; error?: string; data?: { title?: string; transcript?: string | null } };
      if (!response.ok || !payload.success) throw new Error(payload.error || "유튜브 정보를 가져오지 못했습니다.");
      if (!payload.data?.transcript) throw new Error("가져올 수 있는 자막이 없습니다. 유튜브 서머리 대본을 직접 붙여넣어주세요.");
      setDraft((current) => ({ ...current, source_kind: "youtube", title: payload.data?.title || current.title, content: payload.data?.transcript || "" }));
      setNotice("유튜브 제목과 대본을 가져왔습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "유튜브 대본을 가져오지 못했습니다.");
    } finally {
      setFetchingYoutube(false);
    }
  };

  const extractScreenshots = async (files: FileList | null) => {
    clearMessages();
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.length > 10 || selected.some((file) => file.size > 5_000_000)) {
      setError("캡처는 최대 10장, 한 장당 5MB까지 사용할 수 있습니다.");
      return;
    }
    setExtracting(true);
    try {
      const images = await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
      })));
      const response = await fetch("/api/story/extract-text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, images }),
      });
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok || !payload.content) throw new Error(payload.error || "캡처에서 글자를 추출하지 못했습니다.");
      setDraft((current) => ({
        ...current,
        source_kind: "screenshot",
        title: current.title || "캡처 사연",
        content: current.content ? `${current.content}\n\n${payload.content}` : payload.content || "",
      }));
      setNotice(`${selected.length}장의 캡처에서 원문을 추출했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "캡처 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
    }
  };

  const saveSource = async () => {
    clearMessages();
    if (!userId || !draft.title.trim() || !draft.content.trim()) {
      setError("원문 제목과 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    const payload = {
      project_id: projectId,
      user_id: userId,
      source_kind: draft.source_kind,
      title: draft.title.trim(),
      source_url: draft.source_url.trim() || null,
      content: draft.content.trim(),
      updated_at: new Date().toISOString(),
    };
    const response = draft.id
      ? await supabase.from("story_sources").update(payload).eq("id", draft.id).select("id, source_kind, title, source_url, content, created_at").single()
      : await supabase.from("story_sources").insert(payload).select("id, source_kind, title, source_url, content, created_at").single();
    setSaving(false);
    if (response.error || !response.data) {
      setError("원문 저장에 실패했습니다.");
      return;
    }
    const saved = response.data as StorySource;
    setSources((current) => [saved, ...current.filter((source) => source.id !== saved.id)]);
    setSelectedSourceId(saved.id);
    setDraft(emptyDraft);
    setNotice("원문을 저장했습니다.");
  };

  const editSource = (source: StorySource) => {
    setDraft({ id: source.id, source_kind: source.source_kind, title: source.title, source_url: source.source_url ?? "", content: source.content });
    setSelectedSourceId(source.id);
    clearMessages();
  };

  const deleteSource = async (sourceId: string) => {
    if (!window.confirm("이 원문을 삭제할까요? 저장된 각색 버전은 유지됩니다.")) return;
    const { error: deleteError } = await supabase.from("story_sources").delete().eq("id", sourceId);
    if (deleteError) return setError("원문 삭제에 실패했습니다.");
    setSources((current) => current.filter((source) => source.id !== sourceId));
    if (selectedSourceId === sourceId) setSelectedSourceId(null);
    setNotice("원문을 삭제했습니다.");
  };

  const copyAndOpenClaude = async () => {
    clearMessages();
    if (!selectedSource) return setError("각색할 원문을 선택해주세요.");
    const claudeWindow = window.open("https://claude.ai/projects", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(selectedSource.content);
      setNotice("원문을 복사하고 Claude 프로젝트를 열었습니다. 프로젝트 대화창에 붙여넣어주세요.");
    } catch {
      claudeWindow?.close();
      setError("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  const saveManualAdaptation = async () => {
    clearMessages();
    if (!userId || !selectedSource) return setError("각색에 사용한 원문을 선택해주세요.");
    if (!result.trim()) return setError("Claude에서 복사한 각색 결과를 붙여넣어주세요.");
    setSaving(true);
    const { data: saved, error: saveError } = await supabase.from("story_adaptations").insert({
      project_id: projectId,
      source_id: selectedSource.id,
      user_id: userId,
      source_title: selectedSource.title,
      source_snapshot: selectedSource.content,
      instruction_snapshot: "Claude 프로젝트 내 지침 사용",
      content: result.trim(),
      model: "claude-manual",
    }).select("id, source_title, content, model, created_at").single();
    setSaving(false);
    if (saveError || !saved) return setError("각색 결과 저장에 실패했습니다.");
    setResult(saved.content);
    setResultModel("Claude 수동 작업");
    setAdaptations((current) => [saved as Adaptation, ...current]);
    setNotice("붙여넣은 각색 결과를 새 버전으로 저장했습니다.");
  };

  const sendToScript = async () => {
    clearMessages();
    if (!userId || !result.trim()) return setError("대본으로 보낼 각색 결과가 없습니다.");
    setSaving(true);
    const { data: existing } = await supabase.from("scripts").select("id").eq("project_id", projectId).maybeSingle();
    let scriptId: string | null = existing?.id ?? null;
    if (scriptId) {
      const { error: updateError } = await supabase.from("scripts").update({ content: result, title: projectTitle, user_id: userId }).eq("id", scriptId);
      if (updateError) { setSaving(false); return setError("기존 대본 업데이트에 실패했습니다."); }
    } else {
      const { data: created, error: insertError } = await supabase.from("scripts").insert({ project_id: projectId, user_id: userId, title: projectTitle, content: result }).select("id").single();
      if (insertError || !created) { setSaving(false); return setError("대본 생성에 실패했습니다."); }
      scriptId = created.id;
    }
    if (scriptId) await supabase.from("script_versions").insert({ script_id: scriptId, content: result, char_count: result.length });
    setSaving(false);
    setNotice("각색 결과를 대본 수정 화면으로 보냈습니다.");
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;

  if (!schemaReady) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">사연 제작 테이블 설정이 필요합니다</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Supabase SQL Editor에서 아래 마이그레이션을 순서대로 실행하면 원문 수집과 각색 기능을 사용할 수 있습니다.</p>
        <ol className="mt-5 space-y-2 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <li>1. 20260718_story_studio_foundation.sql</li>
          <li>2. 20260718_story_development.sql</li>
        </ol>
        <Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">원문 수집 · AI 각색</h1>
          <p className="mt-1 text-sm text-muted-foreground">{projectTitle}</p>
        </div>
        <Link href={`/scripts?project_id=${projectId}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold hover:border-brand-olive"><FilePenLine size={15} /> 대본 수정 열기</Link>
      </div>

      {(notice || error) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-bold">원문 추가</h2><p className="mt-1 text-xs text-muted-foreground">링크와 원문 내용을 함께 저장하세요.</p></div><Plus size={18} className="text-brand-olive" /></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              {(Object.keys(kindMeta) as SourceKind[]).map((kind) => { const Icon = kindMeta[kind].icon; return <button key={kind} onClick={() => setDraft((current) => ({ ...current, source_kind: kind }))} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold ${draft.source_kind === kind ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border text-muted-foreground"}`}><Icon size={13} />{kindMeta[kind].label}</button>; })}
            </div>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="원문 제목" className="mt-3 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-olive" />
            <input value={draft.source_url} onChange={(event) => setDraft((current) => ({ ...current, source_url: event.target.value }))} placeholder="출처 URL (선택)" className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-olive" />
            {draft.source_kind === "youtube" && <button onClick={importYoutube} disabled={fetchingYoutube} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 disabled:opacity-50">{fetchingYoutube ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}유튜브 제목·대본 가져오기</button>}
            {draft.source_kind === "screenshot" && <label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-brand-olive/30 bg-brand-cream px-3 py-2.5 text-xs font-bold text-brand-olive-dark"><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" disabled={extracting} onChange={(event) => { extractScreenshots(event.target.files); event.currentTarget.value = ""; }} />{extracting ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}{extracting ? "캡처 글자를 읽는 중..." : "캡처 이미지 선택 · 글자 추출"}</label>}
            <textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="유튜브 서머리 대본이나 캡처에서 추출한 글을 붙여넣으세요." className="mt-2 min-h-52 w-full resize-y rounded-lg border border-border p-3 text-sm leading-6 outline-none focus:border-brand-olive" />
            <div className="mt-3 flex gap-2">
              <button onClick={saveSource} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-olive px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{draft.id ? "원문 수정" : "원문 저장"}</button>
              {draft.id && <button onClick={() => setDraft(emptyDraft)} className="rounded-lg border border-border px-3 text-sm font-bold">취소</button>}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-1"><h2 className="font-bold">저장된 원문</h2><span className="text-xs font-bold text-muted-foreground">{sources.length}개</span></div>
            <div className="max-h-[460px] space-y-2 overflow-y-auto">
              {sources.length === 0 ? <p className="rounded-xl bg-muted/50 p-5 text-center text-sm text-muted-foreground">첫 원문을 저장해주세요.</p> : sources.map((source) => { const Icon = kindMeta[source.source_kind].icon; return (
                <div key={source.id} className={`rounded-xl border p-3 ${selectedSourceId === source.id ? "border-brand-olive bg-brand-cream/50" : "border-border"}`}>
                  <button onClick={() => setSelectedSourceId(source.id)} className="w-full text-left"><div className="flex items-center gap-2"><Icon size={14} className="text-brand-olive" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{source.title}</span><ChevronRight size={14} /></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.content}</p></button>
                  <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{formatDate(source.created_at)}</span><div className="flex gap-1"><button onClick={() => editSource(source)} className="rounded p-1.5 text-muted-foreground hover:bg-white hover:text-brand-olive"><FilePenLine size={13} /></button><button onClick={() => deleteSource(source.id)} className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button></div></div>
                </div>
              ); })}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><WandSparkles size={18} className="text-brand-olive" /><h2 className="font-bold">Claude 프로젝트로 보내기</h2></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">각색 지침은 Claude 프로젝트에 있는 내용을 그대로 사용합니다. 여기서는 선택한 원문만 복사합니다.</p>
            <div className="mt-4 rounded-xl bg-brand-cream p-4"><p className="text-xs font-bold text-brand-olive-dark">{selectedSource?.title || "원문을 선택해주세요"}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{selectedSource?.content || "왼쪽 저장된 원문 목록에서 각색할 원문을 선택하세요."}</p></div>
            <button onClick={copyAndOpenClaude} disabled={!selectedSource} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white shadow-sm hover:bg-brand-olive-dark disabled:cursor-not-allowed disabled:opacity-50"><Copy size={16} />원문 복사하고 Claude 열기<ExternalLink size={14} /></button>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><BookOpen size={18} className="text-brand-olive" /><h2 className="font-bold">Claude 각색 결과</h2></div><p className="mt-1 text-xs text-muted-foreground">{resultModel ? `${resultModel} · ${result.length.toLocaleString()}자` : "Claude에서 나온 글을 아래에 붙여넣으세요."}</p></div><button onClick={sendToScript} disabled={!result || saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-pink px-3 py-2 text-xs font-bold text-foreground disabled:opacity-50"><FilePenLine size={13} /> 대본 수정으로 보내기</button></div>
            <textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="Claude 프로젝트에서 각색한 결과를 여기에 붙여넣으세요." className="mt-4 min-h-[440px] w-full resize-y rounded-xl border border-border p-4 text-sm leading-7 outline-none focus:border-brand-olive" />
            <button onClick={saveManualAdaptation} disabled={!result.trim() || !selectedSource || saving} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-brand-olive bg-brand-cream text-sm font-bold text-brand-olive-dark disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}붙여넣은 결과를 버전으로 저장</button>
          </div>

          {adaptations.length > 0 && <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2 px-1"><FileClock size={16} className="text-brand-olive" /><h2 className="text-sm font-bold">각색 버전 기록</h2></div><div className="grid gap-2 sm:grid-cols-2">{adaptations.map((item) => <button key={item.id} onClick={() => { setResult(item.content); setResultModel(item.model); }} className="rounded-xl border border-border p-3 text-left hover:border-brand-olive"><p className="truncate text-xs font-bold">{item.source_title || "원문"}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(item.created_at)} · {item.content.length.toLocaleString()}자</p></button>)}</div></div>}
        </section>
      </div>
    </div>
  );
}
