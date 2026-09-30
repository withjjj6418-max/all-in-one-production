import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export default function GanttRowMenu({name,onAdd,onCopy,onDelete,deleteDisabled=false}) {
  const [position,setPosition]=useState(null);
  const menu=useRef(null),trigger=useRef(null);
  useEffect(()=>{
    if(!position)return;
    const close=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))setPosition(null);};
    const key=e=>{if(e.key==='Escape'){setPosition(null);trigger.current?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    const scroll=()=>setPosition(null);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};
  },[position]);
  const run=fn=>{setPosition(null);fn();};
  return <><button type="button" ref={trigger} className="gantt-menu-trigger" aria-label={`${name} 메뉴`} aria-expanded={!!position} aria-haspopup="menu" onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPosition(position?null:{left:Math.max(8,Math.min(window.innerWidth-184,r.right-176)),top:Math.max(8,Math.min(window.innerHeight-146,r.bottom+4))});}}>☰</button>{position&&createPortal(<div ref={menu} className="gantt-row-menu" role="menu" style={position}><button role="menuitem" onClick={()=>run(onAdd)}>＋ 추가</button><button role="menuitem" onClick={()=>run(onCopy)}>▣ 복사</button><button role="menuitem" disabled={deleteDisabled} onClick={()=>run(onDelete)}>× 삭제</button></div>,document.body)}</>;
}
