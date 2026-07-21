import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const AUDIO_BUCKET = "japan-longform-audio";

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type Segment = {
  sort_order: number;
  storage_path: string | null;
  audio_duration: number | null;
  alignment: Alignment;
};

function formatSrtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function buildCombinedSrt(segments: Segment[]) {
  let offset = 0;
  let cueNumber = 1;
  const blocks: string[] = [];
  for (const segment of segments) {
    const characters = segment.alignment?.characters || [];
    const starts = segment.alignment?.character_start_times_seconds || [];
    const ends = segment.alignment?.character_end_times_seconds || [];
    let cueText = "";
    let cueStart = 0;
    let cueEnd = 0;
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index] || "";
      if (!cueText) cueStart = Number(starts[index] || cueEnd);
      cueText += character;
      cueEnd = Number(ends[index] || starts[index] || cueEnd);
      if (/[。！？!?\n]/.test(character) || cueText.trim().length >= 28) {
        if (cueText.trim()) {
          blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${cueText.trim()}`);
          cueNumber += 1;
        }
        cueText = "";
      }
    }
    if (cueText.trim()) {
      blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${cueText.trim()}`);
      cueNumber += 1;
    }
    offset += Number(segment.audio_duration || ends.at(-1) || 0);
  }
  return blocks.join("\n\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });

    const { data, error: segmentError } = await supabase.from("japan_longform_voice_segments")
      .select("sort_order, storage_path, audio_duration, alignment")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("status", "generated")
      .order("sort_order");
    const segments = (data || []) as Segment[];
    if (segmentError || !segments.length) return NextResponse.json({ error: "통합할 구간 음성이 없습니다." }, { status: 400 });

    const audioBuffers: Buffer[] = [];
    for (const segment of segments) {
      if (!segment.storage_path) return NextResponse.json({ error: `${segment.sort_order + 1}번 구간 파일이 없습니다.` }, { status: 400 });
      const { data: audio, error } = await supabase.storage.from(AUDIO_BUCKET).download(segment.storage_path);
      if (error || !audio) {
        console.error("Japan longform final segment download failed:", error);
        return NextResponse.json({ error: `${segment.sort_order + 1}번 구간 음성을 불러오지 못했습니다.` }, { status: 500 });
      }
      audioBuffers.push(Buffer.from(await audio.arrayBuffer()));
    }

    const combinedAudio = Buffer.concat(audioBuffers);
    const combinedSrt = buildCombinedSrt(segments);
    const totalDuration = segments.reduce((sum, segment) => sum + Number(segment.audio_duration || 0), 0);
    const storagePath = `${user.id}/${projectId}/final/${Date.now()}_final.mp3`;
    const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, combinedAudio, { contentType: "audio/mpeg", upsert: false });
    if (uploadError) {
      console.error("Japan longform final upload failed:", uploadError);
      return NextResponse.json({ error: `최종 통합 음성을 저장하지 못했습니다. (${uploadError.message})` }, { status: 500 });
    }

    const { data: publicUrl } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath);
    const { data: run, error: runError } = await supabase.from("japan_longform_voice_runs").insert({
      project_id: projectId,
      user_id: user.id,
      segment_count: segments.length,
      total_duration: totalDuration,
      combined_audio_url: publicUrl.publicUrl,
      combined_storage_path: storagePath,
      combined_subtitle_srt: combinedSrt,
    }).select("id, segment_count, total_duration, combined_audio_url, combined_storage_path, combined_subtitle_srt, created_at").single();
    if (runError || !run) {
      await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
      console.error("Japan longform final run insert failed:", runError);
      return NextResponse.json({ error: `최종 TTS 기록을 저장하지 못했습니다.${runError?.message ? ` (${runError.message})` : ""}` }, { status: 500 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Japan longform finalization error:", error);
    return NextResponse.json({ error: "최종 통합 중 오류가 발생했습니다." }, { status: 500 });
  }
}
