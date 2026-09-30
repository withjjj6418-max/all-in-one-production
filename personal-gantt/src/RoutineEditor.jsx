import React,{useState} from 'react';
import {ruleFor,validRule,todayDate} from './recurrence.js';
export default function RoutineEditor({routine,onSave,onClose}) {
  const [title,setTitle]=useState(routine?.title||'');
  const [rule,setRule]=useState(routine?ruleFor(routine):{type:'daily',start:todayDate()});
  const [error,setError]=useState('');
  return <div className="overlay" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label="루틴 설정" onClick={e=>e.stopPropagation()}><button className="close" aria-label="닫기" onClick={onClose}>×</button><form onSubmit={e=>{e.preventDefault();if(!title.trim()||!validRule(rule)){setError('이름과 반복 요일·주기를 확인해주세요.');return;}onSave({...routine,id:routine?.id||crypto.randomUUID(),kind:'scheduled',title:title.trim(),repeat:rule,checks:routine?.checks||{}});}}><h2>{routine?'루틴 수정':'루틴 추가'}</h2>
    <label>루틴 이름<input required autoFocus maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>반복 방식<select value={rule.type} onChange={e=>setRule({...rule,type:e.target.value,interval:rule.interval||7,weekdays:rule.weekdays||[1,2,3,4,5]})}><option value="daily">매일</option><option value="weekdays">요일 선택</option><option value="interval">주기 선택</option><option value="monthly">한 달마다</option></select></label>
    {rule.type==='weekdays'&&<div className="weekdays">{[1,2,3,4,5,6,0].map(d=><button type="button" key={d} aria-label={`${'일월화수목금토'[d]}요일`} aria-pressed={rule.weekdays.includes(d)} className={rule.weekdays.includes(d)?'chosen':''} onClick={()=>setRule({...rule,weekdays:rule.weekdays.includes(d)?rule.weekdays.filter(x=>x!==d):[...rule.weekdays,d]})}>{'일월화수목금토'[d]}</button>)}</div>}
    {rule.type==='interval'&&<><div className="routine-presets">{[1,4,7,10].map(n=><button type="button" key={n} onClick={()=>setRule({...rule,interval:n})}>{n===1?'매일':n===7?'1주일':`${n}일`}</button>)}</div><label>반복 간격 (일)<input required type="number" min="1" max="3650" step="1" value={rule.interval} onChange={e=>setRule({...rule,interval:Number(e.target.value)})}/></label></>}
    <label>시작일<input required type="date" value={rule.start} onChange={e=>setRule({...rule,start:e.target.value})}/></label>
    {rule.type==='monthly'&&<small className="muted">해당 날짜가 없는 달은 마지막 날에 표시합니다.</small>}{error&&<p role="alert" className="overdue">{error}</p>}
    <div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" className="primary">저장하기</button></div></form></section></div>;
}
