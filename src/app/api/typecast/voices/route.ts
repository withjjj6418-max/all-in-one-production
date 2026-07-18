import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const apiKey = process.env.TYPECAST_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "TYPECAST_API_KEY가 설정되지 않았습니다.", code: "KEY_MISSING" }, { status: 503 });

  try {
    const response = await fetch("https://api.typecast.ai/v2/voices?model=ssfm-v30", {
      headers: { "X-API-KEY": apiKey },
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      console.error("Typecast voices failed:", response.status);
      return NextResponse.json({ error: "Typecast 목소리 목록을 가져오지 못했습니다." }, { status: 502 });
    }
    return NextResponse.json({ voices: await response.json() });
  } catch (error) {
    console.error("Typecast voices error:", error);
    return NextResponse.json({ error: "Typecast 연결에 실패했습니다." }, { status: 502 });
  }
}
