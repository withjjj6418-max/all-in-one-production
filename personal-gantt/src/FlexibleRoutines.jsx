import React,{useState} from 'react';
import {addDays,today} from './scheduler.js';
import {isDue,repeatLabel} from './recurrence.js';
import RoutineEditor from './RoutineEditor.jsx';
export default function FlexibleRoutines({data,commit}) {
 const [date,setDate]=useState(today()),[editor,setEditor]=useState(undefined),[onlyDue,setOnlyDue]=useState(false);
 const routines=data.routines||[],due=routines.filter(r=>isDue(r,date)),done=due.filter(r=>r.checks[date]);
 const save=r=>{commit({...data,routines:routines.some(x=>x.id===r.id)?routines.map(x=>x.id===r.id?r:x):[...routines,r]});setEditor(undefined);};
 return <section className="routine-panel unified-routines" aria-label="루틴 목록"><div className="routine-heading"><h2>루틴</h2><span className="routine-count">{done.length} / {due.length} 완료</span><button className="primary" onClick={()=>setEditor(null)}>＋ 루틴 추가</button></div><div className="routine-date"><button aria-label="이전 날짜" onClick={()=>setDate(addDays(date,-1))}>‹</button><input aria-label="루틴 날짜" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/><button aria-label="다음 날짜" onClick={()=>setDate(addDays(date,1))}>›</button><button onClick={()=>setDate(today())}>오늘</button><label className="routine-only-due"><input type="checkbox" checked={onlyDue} onChange={e=>setOnlyDue(e.target.checked)}/>예정만 보기</label></div>
 <div className="routine-items">{routines.filter(r=>!onlyDue||isDue(r,date)||r.checks[date]).map(r=><div className={`routine-item ${r.checks[date]?'checked':''}`} key={r.id}><input type="checkbox" aria-label={`${r.title} 완료`} disabled={!isDue(r,date)&&!r.checks[date]} checked={!!r.checks[date]} onChange={e=>{const checks={...r.checks};if(e.target.checked)checks[date]=true;else delete checks[date];save({...r,checks});}}/><button className="routine-name" onClick={()=>setEditor(r)}>{r.title}</button><span className="repeat-badge">{repeatLabel(r)}</span>{!isDue(r,date)&&<small className="muted">예정 없음</small>}<button className="routine-delete" aria-label={`${r.title} 삭제`} onClick={()=>commit({...data,routines:routines.filter(x=>x.id!==r.id)})}>×</button></div>)}</div>
 {!routines.length&&<div className="routine-empty">등록된 루틴이 없습니다.</div>}
 {editor!==undefined&&<RoutineEditor key={editor?.id||'new'} routine={editor} onSave={save} onClose={()=>setEditor(undefined)}/>}
 </section>;
}
