import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateBody = {
  projectId?: number;
  text?: string;
  voiceId?: string;
  emotion?: string;
  tempo?: number;
  pitch?: number;
  audioFormat?: "mp3" | "wav";
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as GenerateBody;
    const projectId = Number(body.projectId);
    const text = body.text?.trim() ?? "";
    const voiceId = body.voiceId?.trim() ?? "";
    const emotion = body.emotion || "normal";
    const tempo = Math.min(2, Math.max(0.5, Number(body.tempo) || 1));
    const pitch = Math.min(12, Math.max(-12, Math.round(Number(body.pitch) || 0)));
    const audioFormat = body.audioFormat === "wav" ? "wav" : "mp3";

    if (!Number.isInteger(projectId) || !voiceId || !text) return NextResponse.json({ error: "프로젝트, 대본, 목소리가 필요합니다." }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: "Typecast 한 번 생성 한도는 2,000자입니다. 대본을 줄이거나 분할해주세요." }, { status: 413 });

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const apiKey = process.env.TYPECAST_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "TYPECAST_API_KEY가 설정되지 않았습니다.", code: "KEY_MISSING" }, { status: 503 });

    const response = await fetch("https://api.typecast.ai/v1/text-to-speech/with-timestamps?granularity=word", {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        voice_id: voiceId,
        text,
        model: "ssfm-v30",
        language: "kor",
        prompt: { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 1.0 },
        output: { volume: 100, audio_pitch: pitch, audio_tempo: tempo, audio_format: audioFormat },
      }),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error("Typecast generation failed:", response.status, payload);
      const status = response.status === 402 || response.status === 429 ? response.status : 502;
      return NextResponse.json({ error: response.status === 402 ? "Typecast 크레딧이 부족합니다." : response.status === 429 ? "Typecast 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." : "Typecast 음성 생성에 실패했습니다." }, { status });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Typecast generation error:", error);
    return NextResponse.json({ error: "음성 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
