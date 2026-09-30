import { parseDate, formatDate, getDaysBetween } from './utils.js';
export const todayDate=()=>formatDate(new Date());
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(parseDate(d))&&formatDate(parseDate(d))===d;
export function ruleFor(r) {
  if(r.repeat)return r.repeat;
  const earliest=Object.keys(r.checks||{}).filter(validDate).sort()[0];
  const start=earliest||todayDate();
  if(r.kind!=='weekly')return {type:'daily',start};
  const monday=parseDate(start);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  return {type:'interval',interval:7,start:formatDate(monday)};
}
export function validRule(rule) {
  return rule && validDate(rule.start) && ['daily','weekdays','interval','monthly'].includes(rule.type)
    && (rule.type!=='interval'||Number.isInteger(rule.interval)&&rule.interval>0&&rule.interval<=3650)
    && (rule.type!=='weekdays'||Array.isArray(rule.weekdays)&&rule.weekdays.length>0&&rule.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6));
}
export function isDue(r,date) {
  const rule=ruleFor(r);
  if(date<rule.start)return false;
  const d=parseDate(date),start=parseDate(rule.start);
  if(rule.type==='daily')return true;
  if(rule.type==='weekdays')return rule.weekdays.includes(d.getDay());
  if(rule.type==='interval')return getDaysBetween(rule.start,date)%rule.interval===0;
  const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  return d.getDate()===Math.min(start.getDate(),last);
}
export function repeatLabel(r) {
  const rule=ruleFor(r);
  if(rule.type==='daily')return '매일';
  if(rule.type==='monthly')return `매월 ${parseDate(rule.start).getDate()}일`;
  if(rule.type==='weekdays')return [...rule.weekdays].sort((a,b)=>(a||7)-(b||7)).map(d=>'일월화수목금토'[d]).join('·');
  return rule.interval===7?'1주일마다':`${rule.interval}일마다`;
}
export function migrateRoutines(data) {
  return {...data,routines:(data.routines||[]).map(r=>r.repeat?r:{...r,kind:'scheduled',repeat:ruleFor(r)})};
}
