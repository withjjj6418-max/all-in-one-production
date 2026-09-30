import React from 'react';
import { addDays, today } from './scheduler.js';

export default function DailyRoutineGantt({ data, commit, range, days, zoom, query }) {
  const routines = (data.routines || []).filter(r => r.kind === 'daily');
  const visible = routines.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
  const dates = Array.from({ length: days }, (_,i) => addDays(range,i));
  function toggle(routine, date) {
    const checks = { ...routine.checks };
    if (checks[date]) delete checks[date]; else checks[date] = true;
    commit({ ...data, routines: data.routines.map(r => r.id === routine.id ? { ...r, checks } : r) });
  }
  return <>
    <div className="gantt-project daily-project" aria-label="데일리루틴 프로젝트"><div className="gantt-label"><i style={{background:'#d6b576'}}/>데일리루틴</div></div>
    {visible.map(r => <div className="gantt-row daily-routine-row" key={r.id}>
      <div className="gantt-label"><span>{r.title}</span></div>
      <div className="daily-routine-track">{dates.map(date => <button
        type="button" key={date} style={{width:zoom}}
        className={`daily-routine-cell ${r.checks[date]?'complete':''} ${date===today()?'current-day':''}`}
        aria-label={`${r.title} ${date} 완료`} aria-pressed={!!r.checks[date]}
        title={`${r.title} · ${date} · ${r.checks[date]?'완료':'대기'}`}
        onClick={() => toggle(r,date)}
      ><span>{r.checks[date]?'✓':'○'}</span></button>)}</div>
    </div>)}
    {!visible.length && <div className="gantt-row"><div className="gantt-label"><small>{routines.length?'검색 결과 없음':'루틴 보드에서 추가해주세요'}</small></div></div>}
  </>;
}
