import {validateRelations} from './taskGraph.js';
import {validRule} from './recurrence.js';
import { parseDate, formatDate, getDaysBetween } from './utils.js';
export const addDays = (date, n) => { const d = parseDate(date); d.setDate(d.getDate() + n); return formatDate(d); };
export const today = () => formatDate(new Date());
export const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parseDate(d)) && formatDate(parseDate(d)) === d;
export function schedule(tasks, settings, projectId = '') {
  const { start, deadline, hours, weekdays } = settings;
  if (!validDate(start) || !validDate(deadline) || start > deadline) throw Error('배치 시작일과 목표 마감일을 확인해주세요.');
  if (!(hours > 0 && hours <= 24) || !weekdays.length) throw Error('하루 작업 시간과 작업 요일을 지정해주세요.');
  const available = d => weekdays.includes(parseDate(d).getDay());
  const occupied = new Map();
  // Fixed tasks and other projects reserve capacity before scheduling the selected scope.
  tasks.filter(t => t.status !== 'done' && (t.locked || (projectId && t.projectId !== projectId))).forEach(t => {
    let remaining = Number(t.hours);
    for (let d = t.start; d <= t.end && remaining > 0; d = addDays(d, 1)) {
      if (!available(d)) continue;
      const used = Math.min(remaining, Number(hours));
      occupied.set(d, (occupied.get(d) || 0) + used); remaining -= used;
    }
  });
  const dueDate = t => t.deadline && t.deadline < deadline ? t.deadline : deadline;
  const candidates = tasks.filter(t => t.status !== 'done' && !t.locked && (!projectId || t.projectId === projectId))
    .sort((a,b) => dueDate(a).localeCompare(dueDate(b)) || b.priority - a.priority || a.start.localeCompare(b.start));
  validateRelations(tasks);
  const ordered=[],visited=new Set(),candidateIds=new Set(candidates.map(t=>t.id));
  const byId=new Map(tasks.map(t=>[t.id,t]));
  function visit(task){if(visited.has(task.id))return;visited.add(task.id);for(const id of task.predecessors||[])if(candidateIds.has(id))visit(byId.get(id));ordered.push(task);}
  candidates.forEach(visit);
  const scheduled=new Map();
  return ordered.map(task => {
    let remaining = Number(task.hours), first = '', last = '', allocations = [];
    if (!(remaining > 0 && remaining <= 10000)) throw Error('예상 시간은 0보다 크고 10,000 이하여야 합니다.');
    let d = task.start > start ? task.start : start;
    for(const id of task.predecessors||[]){const predecessor=scheduled.get(id)||byId.get(id);const earliest=addDays(predecessor.end,1);if(earliest>d)d=earliest;}
    for (let count = 0; remaining > 0.00001; count++, d = addDays(d, 1)) {
      if (count > 3650) throw Error('10년 안에 배치할 수 없습니다. 작업 가능 시간을 늘려주세요.');
      if (!available(d)) continue;
      const capacity = Math.max(0, Number(hours) - (occupied.get(d) || 0));
      const used = Math.min(capacity, remaining);
      if (used <= 0) continue;
      first ||= d; last = d; allocations.push({ date:d, hours:used });
      occupied.set(d, (occupied.get(d) || 0) + used); remaining -= used;
    }
    const due = task.deadline && task.deadline < deadline ? task.deadline : deadline;
    const result={ ...task, start:first, end:last, late: last > due, delay:Math.max(0,getDaysBetween(due,last)), allocations };
    scheduled.set(task.id,result);return result;
  });
}
export function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.phases)) throw Error('지원하지 않는 백업 파일입니다.');
  if(data.hierarchyVersion!==undefined){
    if(data.hierarchyVersion!==1||!Array.isArray(data.works)||!data.works.length)throw Error('업무 분류가 올바르지 않습니다.');
    const workIds=new Set();for(const w of data.works){if(typeof w.id!=='string'||!w.id||workIds.has(w.id)||typeof w.name!=='string'||!w.name.trim())throw Error('업무 분류가 올바르지 않습니다.');workIds.add(w.id);}
    if(data.phases.some(p=>!workIds.has(p.workId))||data.projects.some(p=>!data.phases.some(ph=>ph.id===p.phaseId)))throw Error('업무·차수·프로젝트 연결을 확인해주세요.');
  }
  const ids = new Set();
  for(const p of [...data.projects,...data.phases]) {
    if(typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim()) throw Error('프로젝트·차수 정보가 올바르지 않습니다.');
    ids.add(p.id);
  }
  for(const t of data.tasks) {
    if(t.links!==undefined && (!Array.isArray(t.links)||t.links.some(l=>typeof l.id!=='string'||typeof l.url!=='string'||!/^https?:\/\//i.test(l.url)))) throw Error('첨부 링크가 올바르지 않습니다.');
    if(t.images!==undefined && (!Array.isArray(t.images)||t.images.some(i=>typeof i.id!=='string'||typeof i.name!=='string'||typeof i.src!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(i.src)))) throw Error('첨부 이미지가 올바르지 않습니다.');
    if(typeof t.id !== 'string' || ids.has(t.id) || !t.title?.trim() || !['waiting','progress','done'].includes(t.status) || !validDate(t.start) || !validDate(t.end) || t.start > t.end || (t.deadline && !validDate(t.deadline)) || !(Number(t.hours)>0 && Number(t.hours)<=10000) || ![1,2,3].includes(Number(t.priority)) || !data.projects.some(p=>p.id===t.projectId) || (t.phaseId && !data.phases.some(p=>p.id===t.phaseId))) throw Error('작업 데이터가 올바르지 않습니다.');
    ids.add(t.id);
  }
  if(data.personalEvents!==undefined){
    if(!Array.isArray(data.personalEvents))throw Error('개인 일정 목록이 올바르지 않습니다.');
    for(const e of data.personalEvents){if(typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||!validDate(e.start)||!validDate(e.end)||e.start>e.end||typeof e.allDay!=='boolean'||!/^#[0-9a-f]{6}$/i.test(e.color)||typeof e.location!=='string'||typeof e.notes!=='string'||(!e.allDay&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.endTime)||(e.start===e.end&&e.startTime>e.endTime))))throw Error('개인 일정 정보가 올바르지 않습니다.');ids.add(e.id);}
  }
  const s = data.settings;
  if(!s || !validDate(s.start) || !validDate(s.deadline) || s.start>s.deadline || !(s.hours>0 && s.hours<=24) || !Array.isArray(s.weekdays) || !s.weekdays.length || s.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)) throw Error('작업 시간 설정이 올바르지 않습니다.');
  if(data.routines !== undefined) {
    if(!Array.isArray(data.routines)) throw Error('루틴 목록이 올바르지 않습니다.');
    for(const r of data.routines) {
      if(typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.title!=='string'||!r.title.trim()||!['daily','weekly','scheduled'].includes(r.kind)||!r.checks||typeof r.checks!=='object'||Array.isArray(r.checks)||Object.entries(r.checks).some(([date,checked])=>!validDate(date)||typeof checked!=='boolean'||(r.kind==='weekly'&&!r.repeat&&parseDate(date).getDay()!==1))) throw Error('루틴 기록이 올바르지 않습니다.');
      if((r.kind==='scheduled'||r.repeat!==undefined)&&!validRule(r.repeat))throw Error('루틴 반복 설정이 올바르지 않습니다.');
      ids.add(r.id);
    }
  }
  if(data.matrix !== undefined && (!data.matrix || typeof data.matrix!=='object' || Array.isArray(data.matrix) || Object.entries(data.matrix).some(([key,value])=>!['q1','q2','q3','q4'].includes(key)||typeof value!=='string'))) throw Error('우선순위 매트릭스가 올바르지 않습니다.');
  validateRelations(data.tasks);
  return data;
}
