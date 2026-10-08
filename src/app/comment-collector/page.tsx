"use client";
import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Search, LoaderCircle } from 'lucide-react';
import { commentSource, mergeComments, type Collection, type CommentRow } from '@/lib/comment-collector';
import { createClient } from '@/lib/supabase/client';
import CommentPngEditor from '@/components/CommentPngEditor';
import {useAutoCommentTranslation} from '@/hooks/useAutoCommentTranslation';

export default function CommentCollector() {
  const [url,setUrl]=useState(''), [order,setOrder]=useState<'relevance'|'time'>('relevance');
  const [result,setResult]=useState<Collection|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [query,setQuery]=useState(''), [chosen,setChosen]=useState<Set<string>>(new Set());
  const [cardId,setCardId]=useState('');
  const [inputMode,setInputMode]=useState<'url'|'manual'>('url');
  const [manualText,setManualText]=useState(''),[manualTranslation,setManualTranslation]=useState(''),[manualRows,setManualRows]=useState<CommentRow[]>([]);
  const manualAuto=useAutoCommentTranslation(manualText,manualTranslation,setManualTranslation,inputMode==='manual');
  const [history,setHistory]=useState<Collection[]>([]), [storageKey,setStorageKey]=useState('');
  useEffect(()=>{ let live=true; createClient().auth.getUser().then(({data})=>{
    if(!live||!data.user)return; const key=`comment-collector-v1:${data.user.id}`;setStorageKey(key);
    try {const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))setHistory(saved.filter(c=>Array.isArray(c.comments)&&typeof c.sourceUrl==='string').slice(0,5));} catch { /* Keep the collector usable when storage is unavailable. */ }
  });return()=>{live=false}; },[]);
  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();const rows=(result?.comments||[]).filter(c=>!q||(c.text+' '+c.author).toLocaleLowerCase().includes(q));
    return rows.toSorted((a,b)=>(b.likes??-1)-(a.likes??-1)).slice(0,20);
  },[result,query]);
  const cardComment=manualRows.find(c=>c.id===cardId)||visible.find(c=>c.id===cardId)||visible[0]||manualRows[0];
  const selected=(result?.comments||[]).filter(c=>chosen.has(c.id));
  function addManual() {
    const text=manualText.trim();if(!text)return;
    const row:CommentRow={id:`manual-${crypto.randomUUID()}`,author:'직접 입력',text,translationKo:manualTranslation.trim(),likes:null,publishedAt:'',url:''};
    setManualRows(rows=>[...rows,row]);setCardId(row.id);setManualText('');setManualTranslation('');setError('');
  }
  async function collect(more=false) {
    setError('');setNotice('');setBusy(true);
    try {
      const source=commentSource(more?result!.sourceUrl:url);
      const response=await fetch('/api/comment-collector',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:source.url,order:more?result!.order:order,pageToken:more?result?.nextPageToken:''})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'댓글을 읽지 못했습니다.');
      const next:Collection={...data,comments:mergeComments(more?result!.comments:[],data.comments)};
      setResult(next);if(!more){setChosen(new Set());setQuery('');setCardId('');}
      const saved=[next,...history.filter(c=>c.sourceUrl!==next.sourceUrl)].slice(0,5);setHistory(saved);
      if(storageKey){try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{setNotice('수집은 완료됐지만 이 브라우저에 기록을 저장하지 못했습니다. 파일로 저장하세요.');}}
    } catch(e) {setError(e instanceof Error?e.message:'수집에 실패했습니다. 기존 결과는 유지됩니다.');}
    finally {setBusy(false);}
  }
  function download(kind:'csv'|'json') {
    if(!result)return;const rows=selected.length?selected:visible;
    const form=document.createElement('form');form.method='POST';form.action='/api/comment-collector/export';form.hidden=true;
    for(const [name,value] of [['kind',kind],['payload',JSON.stringify({...result,comments:rows})]]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
    document.body.append(form);form.submit();form.remove();
    setNotice(`${rows.length}개 댓글의 ${kind.toUpperCase()} 다운로드를 요청했습니다.`);
  }
  async function copy() {
    try {await navigator.clipboard.writeText(selected.map(c=>`${c.author}\n${c.text}\n좋아요 ${c.likes??'미표시'} · ${c.url}`).join('\n\n'));setNotice(`${selected.length}개 댓글을 복사했습니다.`);}catch{setError('복사하지 못했습니다. CSV 또는 JSON 저장을 이용하세요.');}
  }
  const button='rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs hover:bg-brand-cream disabled:opacity-40';
  const controls=<div className="space-y-4">
    <section aria-label="댓글 수집" className="space-y-3 border-b border-border pb-4">
      <div className="flex rounded-xl bg-background p-1" role="group" aria-label="댓글 입력 방법">{(['url','manual'] as const).map(mode=><button key={mode} onClick={()=>setInputMode(mode)} aria-pressed={inputMode===mode} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${inputMode===mode?'bg-brand-olive text-white':'text-muted-foreground'}`}>{mode==='url'?'주소로 수집':'직접 입력'}</button>)}</div>
      {inputMode==='manual'?<form onSubmit={e=>{e.preventDefault();addManual();}} className="space-y-2">
        <label className="block text-xs font-medium">영어 원문 / 댓글 문구<textarea value={manualText} onChange={e=>{setManualText(e.target.value);setManualTranslation('');}} required maxLength={500} placeholder="댓글을 직접 입력하세요. 한글만 입력해도 됩니다." className="mt-1 h-20 w-full rounded-xl border border-border px-3 py-2 text-sm"/></label>
        <label className="block text-xs font-medium">한국어 번역 (선택)<textarea value={manualTranslation} onChange={e=>setManualTranslation(e.target.value)} maxLength={700} placeholder="영어 입력 시 자동으로 번역됩니다. 직접 수정도 가능합니다." className="mt-1 h-16 w-full rounded-xl border border-border px-3 py-2 text-sm"/></label>
        <p role="status" className="text-[11px] text-muted-foreground">{manualAuto.translating?'한국어로 번역 중…':'영어를 입력하면 한국어가 자동으로 채워집니다.'}</p>{manualAuto.error&&<p role="alert" className="text-xs text-rose-700">{manualAuto.error} <button type="button" className="underline" onClick={()=>void manualAuto.translate()}>다시 번역</button></p>}
        <button disabled={!manualText.trim()} className="w-full rounded-xl bg-brand-olive py-2.5 text-xs font-semibold text-white disabled:opacity-40">입력한 댓글 추가</button>
      </form>:<>
      <form onSubmit={e=>{e.preventDefault();void collect();}} className="flex gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">영상 주소</span><input value={url} onChange={e=>setUrl(e.target.value)} disabled={busy} type="url" required placeholder="인스타그램 · 유튜브 주소" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"/></label>
        <button disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-olive px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy?<LoaderCircle size={14} className="animate-spin"/>:<Search size={14}/>} {busy?'수집 중':'불러오기'}</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2"><label><span className="sr-only">유튜브 수집 순서</span><select value={order} onChange={e=>setOrder(e.target.value as 'relevance'|'time')} disabled={busy||/instagram\.com/i.test(url)} className="rounded-lg border border-border px-2 py-1.5 text-xs"><option value="relevance">유튜브 · 추천순 (관련도)</option><option value="time">유튜브 · 최신순</option></select></label><a href="http://127.0.0.1:8791/browser-connect" target="_blank" rel="noreferrer" className="text-xs text-brand-olive underline">크롬 연결 확인</a></div>
      <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">수집 안내 · 최근 기록</summary><p className="mt-2 leading-5">읽은 댓글 중 좋아요순 20개 표시. 추천순은 유튜브의 관련성 기준입니다. 인스타그램은 연결된 크롬을 사용합니다.</p>{result&&<p className="mt-2 leading-5">{result.note}</p>}<div className="mt-2 space-y-1">{history.map(h=><button disabled={busy} key={h.sourceUrl} onClick={()=>{setResult(h);setUrl(h.sourceUrl);setOrder(h.order);setChosen(new Set());setCardId('');setQuery('');setError('');}} className="block w-full truncate rounded-lg bg-background p-2 text-left">{h.platform==='youtube'?'YouTube':'Instagram'} · {h.comments.length}개 · {h.sourceUrl}</button>)}</div><p className="mt-2">최근 5개를 이 브라우저에 보관합니다.</p></details>
      </>}
      {error&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}{notice&&<p role="status" className="text-xs text-brand-olive">{notice}</p>}
    </section>
    {manualRows.length>0&&<section aria-label="직접 입력한 댓글" className="space-y-2 border-b border-border pb-4"><h3 className="text-sm font-semibold">직접 입력한 댓글 · {manualRows.length}</h3><div className="max-h-32 space-y-1.5 overflow-y-auto">{manualRows.map((c,i)=><button key={c.id} aria-pressed={cardComment?.id===c.id} onClick={()=>setCardId(c.id)} className={`block w-full rounded-xl border p-2.5 text-left text-xs ${cardComment?.id===c.id?'border-brand-olive bg-brand-cream':'border-border'}`}><span className="line-clamp-2">{i+1}. {c.text}</span></button>)}</div></section>}
    <section aria-label="좋아요순 댓글 선택" className="space-y-2 border-b border-border pb-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">좋아요순 댓글 <span className="text-brand-olive">{visible.length}</span></h3>{result&&<a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground underline">원본 보기</a>}</div>
      <input aria-label="댓글 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="댓글 또는 작성자 검색" className="w-full rounded-lg border border-border px-3 py-2 text-xs"/>
      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">{visible.map((c,i)=><article key={c.id} className={`flex gap-2 rounded-xl border p-2.5 ${cardComment?.id===c.id?'border-brand-olive bg-brand-cream':'border-border bg-background/40'}`}><input aria-label={`${c.author} 댓글 선택`} type="checkbox" className="mt-1 shrink-0" checked={chosen.has(c.id)} onChange={e=>setChosen(old=>{const n=new Set(old);if(e.target.checked)n.add(c.id);else n.delete(c.id);return n;})}/><button aria-label={`${i+1}번 댓글 PNG 만들기`} aria-pressed={cardComment?.id===c.id} className="min-w-0 flex-1 text-left" onClick={()=>setCardId(c.id)}><div className="flex justify-between gap-2 text-[11px]"><span className="truncate font-semibold">{i+1}. {c.author}</span><span className="shrink-0 text-brand-olive">♥ {c.likes===null?'미표시':c.likes.toLocaleString()}</span></div><p className="mt-1 line-clamp-2 break-words text-xs leading-5">{c.text}</p></button></article>)}</div>
      {!visible.length&&<p className="py-5 text-center text-xs text-muted-foreground">주소를 넣거나 최근 기록에서 댓글을 불러오세요.</p>}
      <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">댓글 복사 · CSV / JSON</summary><div className="mt-2 flex flex-wrap gap-2"><label className="flex items-center gap-1"><input type="checkbox" disabled={!visible.length} checked={visible.length>0&&visible.every(c=>chosen.has(c.id))} onChange={e=>setChosen(old=>{const n=new Set(old);visible.forEach(c=>e.target.checked?n.add(c.id):n.delete(c.id));return n;})}/>전체 선택</label><button className={button} disabled={!selected.length} onClick={()=>void copy()}>선택 {selected.length}개 복사</button><button className={button} disabled={!visible.length} onClick={()=>download('csv')}>CSV</button><button className={button} disabled={!visible.length} onClick={()=>download('json')}>JSON</button></div></details>
    </section>
  </div>;
  return <div className="mx-auto max-w-7xl space-y-4">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-brand-cream p-2.5 text-brand-olive"><MessageSquareText size={23}/></span><div><h2 className="text-xl font-semibold">댓글수집기</h2><p className="mt-0.5 text-xs text-muted-foreground">수집 또는 직접 입력 → 한국어 번역 → 영상용 PNG 저장</p></div></div>
    {cardComment?<CommentPngEditor key={cardComment.id} comment={cardComment} controls={controls}/>:<div className="grid items-start gap-5 md:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]"><div className="rounded-2xl border border-border bg-white p-4">{controls}</div><section className="rounded-2xl border border-border bg-white p-5 md:sticky md:top-5"><h3 className="text-sm font-semibold">미리보기</h3><div className="mt-4 flex min-h-80 items-center justify-center rounded-xl bg-[#101010] p-8 text-center text-sm text-white/60">댓글을 선택하면 여기에 PNG가 표시됩니다.</div></section></div>}
  </div>;
}
