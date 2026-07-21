import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type GenerateBody = {
  projectId?: number;
  text?: string;
  voiceId?: string;
  voiceName?: string;
  sortOrder?: number;
  settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  };
};

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function formatTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function alignmentToSrt(alignment: Alignment) {
  const characters = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const cues: Array<{ text: string; start: number; end: number }> = [];
  let text = "";
  let start = 0;
  let end = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] || "";
    if (!text) start = Number(starts[index] || end);
    text += character;
    end = Number(ends[index] || starts[index] || end);
    if (/[。！？!?\n]/.test(character) || text.trim().length >= 28) {
      if (text.trim()) cues.push({ text: text.trim(), start, end });
      text = "";
    }
  }
  if (text.trim()) cues.push({ text: text.trim(), start, end });
  return cues.map((cue, index) => `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}`).join("\n\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as GenerateBody;
    const projectId = Number(body.projectId);
    const text = body.text?.trim() || "";
    const voiceId = body.voiceId?.trim() || "";
    const voiceName = body.voiceName?.trim() || "선택한 목소리";
    const sortOrder = Math.max(0, Math.round(Number(body.sortOrder) || 0));
    if (!Number.isInteger(projectId) || !voiceId || !text) {
      return NextResponse.json({ error: "프로젝트, 대본, 목소리가 필요합니다." }, { status: 400 });
    }
    if (text.length > 9000) {
      return NextResponse.json({ error: "한 구간은 9,000자 이하여야 합니다." }, { status: 413 });
    }

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY가 설정되지 않았습니다.", code: "KEY_MISSING" }, { status: 503 });

    const voiceSettings = {
      stability: clamp(body.settings?.stability, 0, 1, 0.5),
      similarity_boost: clamp(body.settings?.similarity_boost, 0, 1, 0.75),
      style: clamp(body.settings?.style, 0, 1, 0),
      use_speaker_boost: body.settings?.use_speaker_boost !== false,
      speed: clamp(body.settings?.speed, 0.7, 1.2, 1),
    };
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: voiceSettings }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      audio_base64?: string;
      alignment?: Alignment;
      normalized_alignment?: Alignment;
      detail?: { message?: string } | string;
    };
    if (!response.ok || !payload.audio_base64) {
      const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
      console.error("ElevenLabs generation failed:", response.status, detail);
      const message = response.status === 401
        ? "ElevenLabs API 키를 확인해주세요."
        : response.status === 402
          ? "ElevenLabs 사용 가능 크레딧이 부족합니다."
          : response.status === 429
            ? "ElevenLabs 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."
            : detail || "ElevenLabs 음성 생성에 실패했습니다.";
      return NextResponse.json({ error: message }, { status: [401, 402, 429].includes(response.status) ? response.status : 502 });
    }

    const alignment = payload.normalized_alignment || payload.alignment || {};
    const duration = Number(alignment.character_end_times_seconds?.at(-1) || 0);
    const storagePath = `${user.id}/${projectId}/segments/${Date.now()}_${String(sortOrder + 1).padStart(2, "0")}.mp3`;
    const audio = Buffer.from(payload.audio_base64, "base64");
    const { error: uploadError } = await supabase.storage.from("japan-longform-audio").upload(storagePath, audio, { contentType: "audio/mpeg", upsert: false });
    if (uploadError) {
      console.error("Japan longform audio upload failed:", uploadError);
      return NextResponse.json({ error: "생성된 음성을 저장하지 못했습니다. 오디오 저장소 마이그레이션을 확인해주세요." }, { status: 500 });
    }
    const { data: publicUrl } = supabase.storage.from("japan-longform-audio").getPublicUrl(storagePath);
    const subtitleSrt = alignmentToSrt(alignment);
    const { data: segment, error: insertError } = await supabase.from("japan_longform_voice_segments").insert({
      project_id: projectId,
      user_id: user.id,
      sort_order: sortOrder,
      text,
      audio_url: publicUrl.publicUrl,
      storage_path: storagePath,
      audio_duration: duration,
      alignment,
      subtitle_srt: subtitleSrt,
      status: "generated",
    }).select("id, sort_order, text, audio_url, storage_path, audio_duration, alignment, subtitle_srt, status").single();
    if (insertError) {
      await supabase.storage.from("japan-longform-audio").remove([storagePath]);
      console.error("Japan longform segment insert failed:", insertError);
      return NextResponse.json({ error: "생성 기록을 저장하지 못했습니다." }, { status: 500 });
    }

    await supabase.from("japan_longform_voice_settings").upsert({
      project_id: projectId,
      user_id: user.id,
      voice_id: voiceId,
      voice_name: voiceName,
      model_id: "eleven_multilingual_v2",
      voice_settings: voiceSettings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });

    return NextResponse.json({ segment });
  } catch (error) {
    console.error("ElevenLabs generation error:", error);
    return NextResponse.json({ error: "음성 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
