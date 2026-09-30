import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
export async function GET() {
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const {data,error}=await db.from('personal_planner').select('payload,revision').eq('user_id',user.id).maybeSingle();
 if(error)return reply({error:'서버 저장소가 준비되지 않았습니다. 데이터베이스 설정을 확인해주세요.'},503);
 return reply({userId:user.id,payload:data?.payload||null,revision:data?.revision||0});
}
export async function PUT(request: Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'허용되지 않은 요청입니다.'},403);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>3500000)return reply({error:'저장 용량이 너무 큽니다. 첨부 이미지를 줄여주세요.'},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'잘못된 데이터입니다.'},400);}
 const {payload,revision,userId}=body||{};
 if(userId!==user.id)return reply({error:'로그인 계정이 변경됐습니다. 서버 일정을 다시 불러와주세요.'},409);
 if(!Number.isInteger(revision)||revision<0||payload?.version!==1||!Array.isArray(payload.tasks)||!Array.isArray(payload.projects)||!Array.isArray(payload.phases)||!payload.settings)return reply({error:'일정 데이터가 올바르지 않습니다.'},400);
 const row={user_id:user.id,payload,revision:revision+1,updated_at:new Date().toISOString()};
 const result=revision===0?await db.from('personal_planner').insert(row).select('revision').single():await db.from('personal_planner').update(row).eq('user_id',user.id).eq('revision',revision).select('revision').maybeSingle();
 if(result.error?.code==='23505'||(!result.error&&!result.data))return reply({error:'다른 기기에서 일정이 변경됐습니다. 현재 내용을 백업한 후 서버 일정을 다시 불러오세요.'},409);
 if(result.error)return reply({error:'서버에 저장하지 못했습니다. 현재 내용을 백업하고 다시 시도해주세요.'},503);
 return reply({revision:result.data?.revision});
}
