import React, { useState } from 'react';
import { addDays, today } from './scheduler.js';
import { parseDate } from './utils.js';
import './routines.css';

export const weekStart = date => addDays(date, -((parseDate(date).getDay() + 6) % 7));
const quadrants = [
  { id:'q1', title:'제1사분면', action:'즉시 실행', label:'긴급하고 중요한 일', placeholder:'오늘 꼭 끝내야 하는 일\n예: 오늘 마감인 영상 업로드' },
  { id:'q2', title:'제2사분면', action:'계획 수립', label:'긴급하지 않지만 중요한 일', placeholder:'시간을 확보해 꾸준히 할 일\n예: 자동화 구축, 새로운 기술 익히기' },
  { id:'q3', title:'제3사분면', action:'위임 또는 간소화', label:'긴급하지만 중요하지 않은 일', placeholder:'줄이거나 맡길 수 있는 일\n예: 반복되는 확인 요청, 단순 정리' },
  { id:'q4', title:'제4사분면', action:'제거 검토', label:'긴급하지도 중요하지도 않은 일', placeholder:'하지 않아도 괜찮은 일\n예: 목적 없이 피드 둘러보기' },
];

function RoutineBoard({ kind, date, setDate, data, commit }) {
  const [title,setTitle]=useState('');
  const [editing,setEditing]=useState(null);
  const [editTitle,setEditTitle]=useState('');
  const daily=kind==='daily', name=daily?'데일리 루틴':'위클리 루틴';
  const period=daily?date:weekStart(date);
  const routines=(data.routines||[]).filter(r=>r.kind===kind);
  const count=routines.filter(r=>r.checks[period]).length;
  const update=(id,patch)=>commit({...data,routines:data.routines.map(r=>r.id===id?{...r,...patch}:r)});
  const saveEdit=()=>{if(editTitle.trim())update(editing,{title:editTitle.trim()});setEditing(null);};
  return <section className={`routine-panel ${kind}`} aria-label={`${name}보드`}>
    <div className="routine-heading"><div><span className="routine-icon">{daily?'☀':'▦'}</span><h2>{name}보드</h2></div><span className="routine-count">{count} / {routines.length} 완료</span></div>
    <p className="routine-subtitle">{daily?'매일 반복하는 작은 약속':'한 주 동안 챙길 중요한 습관'}</p>
    <div className="routine-date"><button aria-label={`${name} 이전 기간`} onClick={()=>setDate(addDays(date,daily?-1:-7))}>‹</button><label>{daily?<input aria-label="데일리 루틴 날짜" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/>:<><input aria-label="위클리 루틴 주간 선택" type="date" value={period} onChange={e=>e.target.value&&setDate(e.target.value)}/><span> ~ {addDays(period,6).slice(5).replace('-','.')} · 월–일</span></>}</label><button aria-label={`${name} 다음 기간`} onClick={()=>setDate(addDays(date,daily?1:7))}>›</button><button onClick={()=>setDate(today())}>{daily?'오늘':'이번 주'}</button></div>
    <div className="routine-progress" role="progressbar" aria-label={`${name} 완료율`} aria-valuenow={routines.length?Math.round(count/routines.length*100):0} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${routines.length?count/routines.length*100:0}%`}}/></div>
    <div className="routine-items">{routines.map(r=><div className={`routine-item ${r.checks[period]?'checked':''}`} key={r.id}>
      <input type="checkbox" aria-label={`${name} ${r.title} 완료`} checked={!!r.checks[period]} onChange={e=>{const checks={...r.checks};if(e.target.checked)checks[period]=true;else delete checks[period];update(r.id,{checks});}}/>
      {editing===r.id?<input className="routine-edit" aria-label="루틴 이름 수정" autoFocus maxLength={160} value={editTitle} onChange={e=>setEditTitle(e.target.value)} onBlur={saveEdit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setEditing(null);}}}/>:<button className="routine-name" title="클릭해서 이름 수정" onClick={()=>{setEditing(r.id);setEditTitle(r.title);}}>{r.title}</button>}
      <button className="routine-delete" aria-label={`${name} ${r.title} 삭제`} onClick={()=>commit({...data,routines:data.routines.filter(x=>x.id!==r.id)})}>×</button>
    </div>)}{!routines.length&&<div className="routine-empty">{daily?'매일 하고 싶은 일 하나부터 추가해보세요.':'이번 주, 꾸준히 이어갈 루틴을 추가해보세요.'}</div>}</div>
    <form className="routine-add" onSubmit={e=>{e.preventDefault();if(!title.trim())return;commit({...data,routines:[...(data.routines||[]),{id:crypto.randomUUID(),kind,title:title.trim(),checks:{}}]});setTitle('');}}><input aria-label={`${name} 추가`} placeholder={daily?'예: 아침 일정 정리':'예: 주간 콘텐츠 계획 세우기'} required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/><button aria-label={`${name} 추가하기`} type="submit">＋ 추가</button></form>
    <small className="routine-footnote">{daily?'완료 체크는 날짜별로 따로 기록됩니다.':'완료 체크는 월요일부터 일요일까지 주별로 기록됩니다.'} 루틴 목록은 반복됩니다.</small>
  </section>;
}

export default function RoutineBoards({data,commit}) {
  const [day,setDay]=useState(today()), [week,setWeek]=useState(today());
  return <section className="personal-planning" aria-label="개인 루틴과 우선순위">
    <div className="planning-title"><h2>나의 루틴 & 우선순위</h2><span>프로젝트와 관계없이 관리하는 개인 보드</span></div>
    <div className="routine-grid"><RoutineBoard kind="daily" date={day} setDate={setDay} data={data} commit={commit}/><RoutineBoard kind="weekly" date={week} setDate={setWeek} data={data} commit={commit}/></div>
    <section className="matrix-panel" aria-label="아이젠하워 우선순위 매트릭스"><div className="matrix-heading"><div><h2>ϟ 아이젠하워 우선순위 매트릭스</h2><p>루틴을 시작하기 전에 우선순위를 정하고, 집중할 일 1~2가지를 골라보세요.</p></div><span>직접 입력 · 자동 저장</span></div>
      <div className="matrix-grid"><div className="matrix-corner">중요도 ↘ 긴급도</div><div className="matrix-axis">🔥 긴급함</div><div className="matrix-axis">🌱 긴급하지 않음</div><div className="matrix-side important">★ <span>중요함</span></div><div className="matrix-side not-important">↗ <span>중요하지 않음</span></div>
      {quadrants.map((q,i)=><div key={q.id} className={`quadrant ${q.id}`} style={{gridColumn:2+i%2,gridRow:2+Math.floor(i/2)}}><h3><i/>{q.title}</h3><p>→ {q.action}</p><textarea aria-label={q.label} placeholder={q.placeholder} value={data.matrix?.[q.id]||''} onFocus={()=>commit(data)} onChange={e=>commit({...data,matrix:{...(data.matrix||{}),[q.id]:e.target.value}},false)} rows={4}/></div>)}</div>
      <small className="matrix-note">매트릭스는 자유롭게 작성하는 메모입니다. 작업 카드의 우선순위나 자동배치 설정에는 영향을 주지 않습니다.</small>
    </section>
  </section>;
}
