import { createClient } from '@/lib/supabase/server';
import { commentsCsv, type Collection } from '@/lib/comment-collector';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'허용되지 않은 요청입니다.'},{status:403});
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return Response.json({error:'로그인이 필요합니다.'},{status:401});
  try {
    const raw=await request.text();if(raw.length>15000000)throw Error('저장 용량을 초과했습니다.');
    const form=new URLSearchParams(raw),kind=form.get('kind');if(!['csv','json'].includes(kind||''))throw Error('파일 형식을 확인하세요.');
    const data:Collection=JSON.parse(form.get('payload')||'');
    if(!['youtube','instagram'].includes(data.platform)||!Array.isArray(data.comments)||data.comments.length>1000)throw Error('댓글 형식을 확인하세요.');
    for(const c of data.comments)if(!c||typeof c.text!=='string'||c.text.length>10000||typeof c.author!=='string'||typeof c.url!=='string'||typeof c.publishedAt!=='string'||(c.likes!==null&&(!Number.isFinite(c.likes)||c.likes<0)))throw Error('댓글 형식을 확인하세요.');
    const name=`comments-${data.platform}-${new Date().toISOString().slice(0,10)}.${kind}`;
    return new Response(kind==='csv'?commentsCsv(data.comments):JSON.stringify(data,null,2),{headers:{'Content-Type':kind==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch {return Response.json({error:'파일로 저장하지 못했습니다. 댓글을 다시 선택하세요.'},{status:400});}
}
