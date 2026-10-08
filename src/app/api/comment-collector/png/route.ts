import {createClient} from '@/lib/supabase/server';
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('허용되지 않은 요청',{status:403});
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return new Response('로그인이 필요합니다.',{status:401});
  try {
    const raw=await request.text();if(raw.length>12000000)throw Error();
    const png=new URLSearchParams(raw).get('png')||'';if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png))throw Error();
    const bytes=Buffer.from(png.slice(22),'base64');if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw Error();
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width<480||width>1080||height<100||height>1920)throw Error();
    return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="comment-overlay.png"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('PNG를 저장하지 못했습니다. 다시 시도하세요.',{status:400});}
}
