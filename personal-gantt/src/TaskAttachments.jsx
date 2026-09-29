import React,{useState} from 'react';

export async function attachImages(files,taskId,setDraft,notify){
  try{
    const images=[];
    for(const file of files){
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('PNG, JPG, WEBP, GIF 이미지를 첨부해주세요.');
      if(file.size>15*1024*1024)throw Error('이미지 한 장은 15MB 이하로 첨부해주세요.');
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      images.push({id:crypto.randomUUID(),name:file.name||'붙여넣은 이미지',src:canvas.toDataURL('image/jpeg',.82)});
    }
    setDraft(prev=>{
      if(prev?.id!==taskId)return prev;
      return {...prev,images:[...(prev.images||[]),...images]};
    });
  }catch(err){notify(err.message||'이미지를 읽지 못했습니다.');}
}
export function pasteImages(e,id,setDraft,notify){
  const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));
  if(files.length){e.preventDefault();attachImages(files,id,setDraft,notify);}
}
export default function TaskAttachments({draft,setDraft,notify}){
  const [link,setLink]=useState('');
  const [view,setView]=useState(null);
  const addLink=()=>{
    try{const url=new URL(link.trim());if(!['https:','http:'].includes(url.protocol))throw Error();
      if(!(draft.links||[]).some(l=>l.url===url.href))setDraft(d=>({...d,links:[...(d.links||[]),{id:crypto.randomUUID(),url:url.href}]}));setLink('');
    }catch{notify('http:// 또는 https://로 시작하는 링크를 붙여넣어주세요.');}
  };
  return <div className="task-attachments"><label>링크</label><div className="link-input"><input aria-label="첨부할 링크" type="url" placeholder="https:// 링크 붙여넣기" value={link} onChange={e=>setLink(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addLink();}}}/><button type="button" onClick={addLink}>추가</button></div>
    {(draft.links||[]).map(l=><div className="attached-link" key={l.id}><a href={l.url} target="_blank" rel="noopener noreferrer">↗ {l.url}</a><button type="button" aria-label="링크 삭제" onClick={()=>setDraft(d=>({...d,links:d.links.filter(x=>x.id!==l.id)}))}>×</button></div>)}
    <label className="image-attach-label">이미지 첨부</label><div className="image-paste-zone" tabIndex={0} role="group" aria-label="이미지 붙여넣기 영역" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();attachImages(Array.from(e.dataTransfer.files),draft.id,setDraft,notify);}}>이미지를 복사한 뒤 여기에서 <b>Ctrl+V</b><small>파일을 끌어 놓거나 직접 선택할 수도 있어요</small><label className="image-file-button">이미지 선택<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={e=>{attachImages(Array.from(e.target.files),draft.id,setDraft,notify);e.target.value='';}}/></label></div>
    <div className="attached-images">{(draft.images||[]).map(img=><div key={img.id}><button type="button" className="image-thumb" aria-label={`${img.name} 크게 보기`} onClick={()=>setView(img)}><img src={img.src} alt={img.name}/></button><button className="image-remove" type="button" aria-label={`${img.name} 삭제`} onClick={()=>setDraft(d=>({...d,images:d.images.filter(x=>x.id!==img.id)}))}>×</button></div>)}</div><small className="attachment-hint">저장하기를 누르면 첨부도 함께 저장됩니다. 이미지는 최대 1600px로 압축되며 GIF는 정지 이미지로 저장됩니다.</small>
    {view&&<div className="image-lightbox" onClick={()=>setView(null)}><button type="button" aria-label="이미지 미리보기 닫기" onClick={()=>setView(null)}>×</button><img src={view.src} alt={view.name}/></div>}
  </div>;
}
