import React, {useState} from 'react';
import GanttRowMenu from './GanttRowMenu.jsx';
import { addDays, today } from './scheduler.js';

export default function DailyRoutineGantt({ data, commit, range, days, zoom, query }) {
  const [collapsed,setCollapsed]=useState(false);
  const add=()=>{const title=window.prompt('데일리 루틴 이름');if(title?.trim()){commit({...data,routines:[...(data.routines||[]),{id:crypto.randomUUID(),kind:'daily',title:title.trim(),checks:{}}]});setCollapsed(false);}};
  const copy=items=>commit({...data,routines:[...(data.routines||[]),...items.map(r=>({...r,id:crypto.randomUUID(),title:r.title+' (복사)',checks:{}}))]});
  const remove=items=>commit({...data,routines:data.routines.filter(r=>!items.some(x=>x.id===r.id))});
  const routines = (data.routines || []).filter(r => r.kind === 'daily');
  const visible = routines.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
  const dates = Array.from({ length: days }, (_,i) => addDays(range,i));
  function toggle(routine, date) {
    const checks = { ...routine.checks };
    if (checks[date]) delete checks[date]; else checks[date] = true;
    commit({ ...data, routines: data.routines.map(r => r.id === routine.id ? { ...r, checks } : r) });
  }
  return <>
    <div className="gantt-project daily-project" aria-label="데일리루틴 프로젝트"><div className="gantt-label"><button className="gantt-collapse" aria-label={`데일리루틴 ${collapsed?'펼치기':'접기'}`} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'▶':'▼'}</button><i style={{background:'#d6b576'}}/><span className="gantt-row-name">데일리루틴</span><GanttRowMenu name="데일리루틴" onAdd={add} onCopy={()=>copy(routines)} onDelete={()=>{if(window.confirm('데일리 루틴 전체를 삭제할까요?'))remove(routines);}} deleteDisabled={!routines.length}/></div><div className="project-track"/></div>
    {!collapsed&&visible.map(r => <div className="gantt-row daily-routine-row" key={r.id}>
      <div className="gantt-label task-row-label"><span className="gantt-row-name">{r.title}</span><GanttRowMenu name={r.title} onAdd={add} onCopy={()=>copy([r])} onDelete={()=>remove([r])}/></div>
      <div className="daily-routine-track">{dates.map(date => <button
        type="button" key={date} style={{width:zoom}}
        className={`daily-routine-cell ${r.checks[date]?'complete':''} ${date===today()?'current-day':''}`}
        aria-label={`${r.title} ${date} 완료`} aria-pressed={!!r.checks[date]}
        title={`${r.title} · ${date} · ${r.checks[date]?'완료':'대기'}`}
        onClick={() => toggle(r,date)}
      ><span>{r.checks[date]?'✓':'○'}</span></button>)}</div>
    </div>)}
    {!collapsed&&!visible.length && <div className="gantt-row"><div className="gantt-label"><small>{routines.length?'검색 결과 없음':'루틴 보드에서 추가해주세요'}</small></div></div>}
  </>;
}
