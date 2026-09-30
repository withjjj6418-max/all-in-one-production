import React from 'react';
import {descendants} from './taskGraph.js';
export default function TaskRelations({draft,setDraft,tasks}) {
  const children=descendants(tasks,draft.id);
  return <div className="task-relations"><label>상위 작업<select value={draft.parentId||''} onChange={e=>setDraft({...draft,parentId:e.target.value||null})}><option value="">없음</option>{tasks.filter(t=>t.projectId===draft.projectId&&!children.has(t.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    <label>선행 작업<select aria-label="선행 작업 추가" value="" onChange={e=>e.target.value&&setDraft({...draft,predecessors:[...(draft.predecessors||[]),e.target.value]})}><option value="">작업 선택</option>{tasks.filter(t=>t.id!==draft.id&&!(draft.predecessors||[]).includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    <div className="relation-list">{(draft.predecessors||[]).map(id=><div key={id}><span>{tasks.find(t=>t.id===id)?.title}</span><button type="button" aria-label="선행 연결 삭제" onClick={()=>setDraft({...draft,predecessors:draft.predecessors.filter(x=>x!==id)})}>×</button></div>)}</div>
    {tasks.some(t=>(t.predecessors||[]).includes(draft.id))&&<div className="relation-list"><span>후행 작업</span>{tasks.filter(t=>(t.predecessors||[]).includes(draft.id)).map(t=><div key={t.id}>{t.title}</div>)}</div>}
  </div>;
}
