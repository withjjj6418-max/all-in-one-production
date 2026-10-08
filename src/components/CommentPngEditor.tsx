"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {drawComment,randomIdentity,type CardStyle} from '@/lib/comment-png';
import type {CommentRow} from '@/lib/comment-collector';

export default function CommentPngEditor({comment,controls}:{comment:CommentRow;controls?:ReactNode}) {
  const [style,setStyle]=useState<CardStyle>(()=>{
    const initial:CardStyle={...randomIdentity(),text:comment.text,translation:comment.translationKo||'',bilingual:!!comment.translationKo||/[A-Za-z]/.test(comment.text),likes:comment.likes,width:900,font:36,dialogueEnd:1380,gap:24,opacity:90,blurName:true,blurProfile:true,fullFrame:true};
    try{const saved=JSON.parse(localStorage.getItem('comment-overlay-layout-v1')||'{}');for(const key of ['width','font','dialogueEnd','gap','opacity'] as const)if(typeof saved[key]==='number'&&Number.isFinite(saved[key]))initial[key]=saved[key];}catch{/* Use defaults when browser storage is unavailable. */}
    return initial;
  });
  const canvas=useRef<HTMLCanvasElement>(null),previewCanvas=useRef<HTMLCanvasElement>(null),[previewMode,setPreviewMode]=useState<'card'|'position'>('card'),[error,setError]=useState(''),[ready,setReady]=useState(false),[translating,setTranslating]=useState(false),[translationError,setTranslationError]=useState('');
  const latestSource=useRef(style.text);useEffect(()=>{latestSource.current=style.text;},[style.text]);
  const patch=(data:Partial<CardStyle>)=>{setReady(false);const next={...style,...data};setStyle(next);try{localStorage.setItem('comment-overlay-layout-v1',JSON.stringify({width:next.width,font:next.font,dialogueEnd:next.dialogueEnd,gap:next.gap,opacity:next.opacity}));}catch{/* Export remains usable without storage. */}};
  useEffect(()=>{let live=true;document.fonts.ready.then(()=>{if(!live||!canvas.current)return;try{drawComment(canvas.current,style);if(previewCanvas.current)drawComment(previewCanvas.current,{...style,fullFrame:previewMode==='position'});setError('');setReady(true);}catch(e){setReady(false);canvas.current.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);if(previewCanvas.current)previewCanvas.current.getContext('2d')?.clearRect(0,0,previewCanvas.current.width,previewCanvas.current.height);setError(e instanceof Error?e.message:'미리보기를 만들지 못했습니다.');}});return()=>{live=false};},[style,previewMode]);
  async function translate() {
    const source=style.text;setTranslating(true);setTranslationError('');
    try{const response=await fetch('/api/comment-collector/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source})});const data=await response.json();if(!response.ok)throw Error(data.error);if(latestSource.current!==source){setTranslationError('원문이 바뀌었습니다. 다시 번역하세요.');return;}setReady(false);setStyle(old=>({...old,translation:data.translation}));}
    catch(e){setTranslationError(e instanceof Error?e.message:'번역하지 못했습니다.');}finally{setTranslating(false);}
  }
  function save() {
    if(!canvas.current||!ready)return;
    const form=document.createElement('form');form.method='POST';form.action='/api/comment-collector/png';form.hidden=true;
    const input=document.createElement('input');input.name='png';input.value=canvas.current.toDataURL('image/png');form.append(input);document.body.append(form);form.submit();form.remove();
  }
  const field='w-full rounded-xl border border-border bg-white px-3 py-2 text-sm';
  return <section className="grid items-start gap-5 md:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]" aria-label="댓글 PNG 만들기">
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        {controls}
        <h3 className="text-sm font-semibold">댓글 편집</h3>
        <label className="block text-xs">영어 원문 / PNG 문구<textarea className={`${field} mt-1 h-16`} value={style.text} disabled={translating} maxLength={4000} onChange={e=>patch({text:e.target.value,translation:''})}/></label>
        <label className="block text-xs">댓글 표시<select className={`${field} mt-1`} value={style.bilingual?'bilingual':'original'} onChange={e=>patch({bilingual:e.target.value==='bilingual'})}><option value="bilingual">영어 작게 노란색 + 한국어 크게 흰색</option><option value="original">원문만</option></select></label>
        {style.bilingual&&<div className="space-y-2"><button disabled={translating||!style.text.trim()} onClick={()=>void translate()} className="rounded-xl border border-border bg-white px-3 py-2 text-xs disabled:opacity-40">{translating?'번역 중…':'한국어 자동 번역'}</button><label className="block text-xs">한국어 번역<textarea className={`${field} mt-1 h-16`} value={style.translation} disabled={translating} maxLength={6000} onChange={e=>patch({translation:e.target.value})}/></label><p className="text-[11px] text-muted-foreground">번역은 확인 후 직접 다듬을 수 있습니다.</p>{translationError&&<p role="alert" className="text-xs text-rose-700">{translationError}</p>}</div>}
        <p className="text-[11px] text-muted-foreground">PNG 문구만 편집합니다. 수집한 원문은 보존됩니다.</p>
        <div className="flex gap-2"><label className="min-w-0 flex-1 text-xs">표시 닉네임<input className={`${field} mt-1`} maxLength={40} value={style.nickname} onChange={e=>patch({nickname:e.target.value})}/></label><button className="self-end rounded-xl border border-border bg-white px-3 py-2 text-xs" onClick={()=>patch(randomIdentity())}>닉네임·색상 랜덤</button></div>
        <details className="rounded-xl border border-border bg-background/50 p-3"><summary className="cursor-pointer text-xs font-medium">위치 · 크기 · 블러 설정 <span className="text-muted-foreground">/ 불투명도 {style.opacity}%</span></summary><div className="mt-3 grid grid-cols-2 gap-3">{([['대사 자막 끝 위치 (px)','dialogueEnd',0,1800],['자막 아래 간격 (px)','gap',0,200],['카드 너비 (px)','width',480,1000],['글자 크기 (px)','font',24,64],['불투명도 (%)','opacity',10,100]] as const).map(([label,key,min,max])=><label key={key} className="text-xs">{label}<input className={`${field} mt-1`} type="number" min={min} max={max} value={style[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}<label className="text-xs">프로필 색상<input aria-label="프로필 색상" type="color" className="mt-1 h-9 w-full rounded-xl" value={style.color} onChange={e=>patch({color:e.target.value})}/></label></div>
        <div className="flex flex-wrap gap-4 text-xs"><label><input type="checkbox" checked={style.blurName} onChange={e=>patch({blurName:e.target.checked})}/> 닉네임 블러</label><label><input type="checkbox" checked={style.blurProfile} onChange={e=>patch({blurProfile:e.target.checked})}/> 프로필 블러</label></div>
        <label className="mt-3 block text-xs">저장 방식<select className={`${field} mt-1`} value={style.fullFrame?'frame':'card'} onChange={e=>patch({fullFrame:e.target.value==='frame'})}><option value="frame">1080×1920 · 위치 포함 PNG</option><option value="card">댓글 카드만 PNG · 편집기에서 위치 조절</option></select></label>
        <p className="text-xs leading-5 text-muted-foreground">위치는 1080×1920 기준입니다. 위치 포함 PNG를 영상과 같은 크기로 올리면 지정한 자리에 표시됩니다. 자막 안내선은 PNG에 저장되지 않습니다.</p></details>
        {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button disabled={!ready} onClick={save} className="rounded-xl bg-brand-olive px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">PNG 저장</button>
      </div>
      <section aria-label="PNG 미리보기" className="overflow-hidden rounded-2xl border border-border bg-white md:sticky md:top-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">미리보기</h3><div className="flex gap-1 rounded-lg bg-background p-1">{([['card','카드 크게'],['position','영상 위치']] as const).map(([mode,label])=><button key={mode} aria-pressed={previewMode===mode} onClick={()=>setPreviewMode(mode)} className={`rounded-md px-2.5 py-1.5 text-xs ${previewMode===mode?'bg-brand-olive text-white':'text-muted-foreground'}`}>{label}</button>)}</div></div>
        <div className="flex min-h-72 items-center justify-center bg-[#101010] p-5" style={{minHeight:previewMode==='position'?undefined:300}}>
          <div className="relative max-w-full" style={previewMode==='position'?{width:'min(100%, 300px)',backgroundColor:'#333',backgroundImage:'repeating-conic-gradient(#444 0% 25%,#333 0% 50%)',backgroundSize:'20px 20px'}:{width:'100%'}}>
            <canvas ref={previewCanvas} aria-label="투명 댓글 PNG 미리보기" className="block h-auto w-full"/>
            {previewMode==='position'&&<div className="pointer-events-none absolute left-0 right-0 border-b border-dashed border-amber-300" style={{top:`${style.dialogueEnd/1920*100}%`}}><span className="absolute bottom-1 left-2 bg-black/70 px-1 text-[10px] text-amber-200">대사 자막 끝 · 안내선</span></div>}
            {!ready&&<p className="py-8 text-center text-xs leading-6 text-white/60">{error||'미리보기를 준비하고 있습니다.'}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3"><p className="text-[11px] text-muted-foreground">{style.fullFrame?'1080×1920 · 위치 포함 PNG':'카드만 PNG'} · 불투명도 {style.opacity}%</p><button disabled={!ready} onClick={save} className="rounded-lg bg-brand-olive px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">PNG 저장</button></div>
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">대사 자막 바로 아래에 배치됩니다. 미리보기 전환은 저장 방식에 영향을 주지 않습니다.</p>
      </section>
      <canvas ref={canvas} hidden aria-hidden="true"/>
  </section>;
}
