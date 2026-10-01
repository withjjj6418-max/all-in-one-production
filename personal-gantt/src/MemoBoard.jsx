import React,{useEffect,useRef,useState} from 'react';
const colors=[['yellow','노랑'],['pink','분홍'],['blue','파랑'],['green','초록'],['purple','보라']];
function StickyNote({note,index,onSave,onDelete}){
 const [text,setText]=useState(note.text),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setText(note.text);},[note.text]);
 const save=()=>{if(text!==note.text)onSave({...note,text});};
 return <article className={`sticky-note sticky-${note.color}`} aria-label={`메모 ${index+1}`}><div className="sticky-top"><span>MEMO {String(index+1).padStart(2,'0')}</span><button aria-label={`메모 ${index+1} 삭제`} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(!text.trim()||window.confirm('이 메모를 삭제할까요?'))onDelete();}}>×</button></div><textarea aria-label={`메모 ${index+1} 내용`} placeholder="메모를 적어보세요…" value={text} onFocus={()=>focused.current=true} onChange={e=>setText(e.target.value)} onBlur={()=>{focused.current=false;save();}}/><div className="sticky-bottom"><div className="sticky-colors">{colors.map(([color,label])=><button key={color} className={`sticky-swatch sticky-${color}`} aria-label={`메모 ${index+1} ${label}`} aria-pressed={note.color===color} onMouseDown={e=>e.preventDefault()} onClick={()=>onSave({...note,text,color})}/>)}</div><button className="sticky-save" onMouseDown={e=>e.preventDefault()} onClick={save}>저장</button></div></article>;
}
export default function MemoBoard({data,commit}){
 const notes=data.notes||[];
 return <section className="memo-board" aria-label="메모보드"><div className="memo-heading"><h2>메모보드 <small>{notes.length}</small></h2><button onClick={()=>commit({...data,notes:[...notes,{id:crypto.randomUUID(),text:'',color:colors[notes.length%colors.length][0]}]})}>＋ 메모</button></div><div className="sticky-grid">{notes.map((note,index)=><StickyNote key={note.id} note={note} index={index} onSave={next=>commit({...data,notes:notes.map(n=>n.id===note.id?next:n)})} onDelete={()=>commit({...data,notes:notes.filter(n=>n.id!==note.id)})}/>)}</div></section>;
}
