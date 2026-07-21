import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ElevenLabsVoice = {
  voice_id?: string;
  name?: string;
  category?: string;
  description?: string | null;
  preview_url?: string | null;
  labels?: Record<string, string>;
  verified_languages?: Array<{ language?: string; locale?: string; accent?: string }>;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY가 설정되지 않았습니다.", code: "KEY_MISSING" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false", {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { voices?: ElevenLabsVoice[]; detail?: { message?: string } | string };
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
      console.error("ElevenLabs voices failed:", response.status, detail);
      return NextResponse.json(
        { error: response.status === 401 ? "ElevenLabs API 키를 확인해주세요." : detail || "ElevenLabs 목소리 목록을 가져오지 못했습니다." },
        { status: response.status === 401 || response.status === 429 ? response.status : 502 },
      );
    }

    const voices = (payload.voices || []).filter((voice) => voice.voice_id && voice.name).map((voice) => ({
      voice_id: voice.voice_id!,
      name: voice.name!,
      category: voice.category || "",
      description: voice.description || "",
      preview_url: voice.preview_url || "",
      labels: voice.labels || {},
      verified_languages: voice.verified_languages || [],
    }));
    return NextResponse.json({ voices });
  } catch (error) {
    console.error("ElevenLabs voices error:", error);
    return NextResponse.json({ error: "ElevenLabs 연결에 실패했습니다." }, { status: 502 });
  }
}
