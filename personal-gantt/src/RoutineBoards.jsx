import React, { useState } from 'react';
import { addDays, today } from './scheduler.js';
import { parseDate } from './utils.js';
import './routines.css';
import FlexibleRoutines from './FlexibleRoutines.jsx';

export const weekStart = date => addDays(date, -((parseDate(date).getDay() + 6) % 7));
const quadrants = [
  { id:'q1', title:'제1사분면', action:'즉시 실행', label:'긴급하고 중요한 일', placeholder:'오늘 꼭 끝내야 하는 일\n예: 오늘 마감인 영상 업로드' },
  { id:'q2', title:'제2사분면', action:'계획 수립', label:'긴급하지 않지만 중요한 일', placeholder:'시간을 확보해 꾸준히 할 일\n예: 자동화 구축, 새로운 기술 익히기' },
  { id:'q3', title:'제3사분면', action:'위임 또는 간소화', label:'긴급하지만 중요하지 않은 일', placeholder:'줄이거나 맡길 수 있는 일\n예: 반복되는 확인 요청, 단순 정리' },
  { id:'q4', title:'제4사분면', action:'제거 검토', label:'긴급하지도 중요하지도 않은 일', placeholder:'하지 않아도 괜찮은 일\n예: 목적 없이 피드 둘러보기' },
];

export default function RoutineBoards({data,commit}) {
  const [day,setDay]=useState(today()), [week,setWeek]=useState(today());
  return <section className="personal-planning" aria-label="개인 루틴과 우선순위">
    <div className="planning-title"><h2>나의 루틴 & 우선순위</h2></div>
    <FlexibleRoutines data={data} commit={commit}/>
    <section className="matrix-panel" aria-label="아이젠하워 우선순위 매트릭스"><div className="matrix-heading"><div><h2>ϟ 아이젠하워 우선순위 매트릭스</h2></div></div>
      <div className="matrix-grid"><div className="matrix-corner">중요도 ↘ 긴급도</div><div className="matrix-axis">🔥 긴급함</div><div className="matrix-axis">🌱 긴급하지 않음</div><div className="matrix-side important">★ <span>중요함</span></div><div className="matrix-side not-important">↗ <span>중요하지 않음</span></div>
      {quadrants.map((q,i)=><div key={q.id} className={`quadrant ${q.id}`} style={{gridColumn:2+i%2,gridRow:2+Math.floor(i/2)}}><h3><i/>{q.title}</h3><p>→ {q.action}</p><textarea aria-label={q.label} placeholder={q.placeholder} value={data.matrix?.[q.id]||''} onFocus={()=>commit(data)} onChange={e=>commit({...data,matrix:{...(data.matrix||{}),[q.id]:e.target.value}},false)} rows={4}/></div>)}</div>
    </section>
  </section>;
}
