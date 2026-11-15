import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, addDays, validateData } from './scheduler.js';
import {isDue,migrateRoutines,repeatLabel,validRule} from './recurrence.js';
import {descendants,removeTasks,cloneTasks,connectTasks,validateRelations,treeRows} from './taskGraph.js';
test('task tree copy/delete, cycles, and dependency scheduling',()=>{
 const list=[task('parent'),task('child',{parentId:'parent'}),task('next',{predecessors:['child']})];
 assert.deepEqual([...descendants(list,'parent')],['parent','child']);
 const copies=cloneTasks(list,descendants(list,'parent'),'copy-project');assert.equal(copies[1].parentId,copies[0].id);
 assert.deepEqual(removeTasks(list,descendants(list,'parent'))[0].predecessors,[]);
 assert.throws(()=>validateRelations([task('a',{parentId:'b'}),task('b',{parentId:'a'})]));
 assert.throws(()=>connectTasks(connectTasks(list,'parent','next'),'next','parent'));
 assert.equal(treeRows(list,list,{parent:true}).some(r=>r.task.id==='child'),false);
 const planned=schedule([task('b',{predecessors:['a'],priority:3}),task('a',{hours:12,priority:1})],settings);
 assert.deepEqual(planned.map(t=>t.id),['a','b']);assert.equal(planned[1].start,'2026-09-30');
});
test('routine migration retains checks and is idempotent',()=>{const data={routines:[{id:'d',kind:'daily',checks:{'2026-09-29':true}},{id:'w',kind:'weekly',checks:{'2026-09-28':true}}]};const next=migrateRoutines(data);assert.equal(repeatLabel(next.routines[0]),'매일');assert.equal(repeatLabel(next.routines[1]),'1주일마다');assert.deepEqual(next.routines[0].checks,data.routines[0].checks);assert.deepEqual(migrateRoutines(next),next);assert.equal(isDue(next.routines[1],'2026-09-28'),true);assert.equal(isDue(next.routines[1],'2026-09-29'),false);});
test('routine intervals, weekdays, start date and monthly short months',()=>{const r=repeat=>({repeat});assert.equal(isDue(r({type:'interval',interval:10,start:'2026-09-30'}),'2026-10-10'),true);assert.equal(isDue(r({type:'interval',interval:4,start:'2026-09-30'}),'2026-10-03'),false);assert.equal(isDue(r({type:'weekdays',weekdays:[1,3],start:'2026-09-30'}),'2026-09-28'),false);assert.equal(isDue(r({type:'weekdays',weekdays:[1,3],start:'2026-09-30'}),'2026-10-05'),true);assert.equal(isDue(r({type:'monthly',start:'2026-01-31'}),'2026-02-28'),true);assert.equal(isDue(r({type:'monthly',start:'2026-01-31'}),'2026-03-31'),true);assert.equal(isDue(r({type:'monthly',start:'2026-01-31'}),'2028-02-29'),true);assert.equal(validRule({type:'weekdays',weekdays:[],start:'2026-09-30'}),false);});
const settings={start:'2026-09-28',deadline:'2026-10-02',hours:6,weekdays:[1,2,3,4,5]};
const task=(id,extra={})=>({id,title:id,projectId:'p',phaseId:'',status:'waiting',start:'2026-09-28',end:'2026-09-28',hours:6,priority:2,deadline:'',locked:false,...extra});
test('capacity is shared across tasks, skipping weekends',()=>{const r=schedule([task('a',{hours:8}),task('b',{hours:28})],settings);assert.equal(r[0].end,'2026-09-29');assert.equal(r[1].end,'2026-10-05');assert.equal(r[1].delay,3);const used={};r.flatMap(t=>t.allocations).forEach(a=>used[a.date]=(used[a.date]||0)+a.hours);assert.ok(Object.values(used).every(h=>h<=6));assert.equal(used['2026-10-03'],undefined);});
test('locked tasks and other projects reserve time; done tasks do not',()=>{const r=schedule([task('fixed',{locked:true}),task('other',{projectId:'q',start:'2026-09-29',end:'2026-09-29'}),task('done',{status:'done'}),task('new')],settings,'p');assert.equal(r.length,1);assert.equal(r[0].start,'2026-09-30');});
test('earliest due date then priority; earliest start respected',()=>{const r=schedule([task('low',{priority:1}),task('high',{priority:3}),task('due',{deadline:'2026-09-28'}),task('future',{start:'2026-10-08'})],settings);assert.deepEqual(r.map(t=>t.id),['due','high','future','low']);assert.equal(r[2].start,'2026-10-08');});
test('invalid working calendar rejected; quarter hours supported',()=>{assert.throws(()=>schedule([task('x')],{...settings,weekdays:[]}));const r=schedule([task('x',{hours:.25}),task('y',{hours:5.75})],settings);assert.equal(r[1].end,settings.start);});
test('month/year and leap date boundaries',()=>{assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2028-02-28',1),'2028-02-29');});
test('backup validation checks references and dates',()=>{const data={version:1,projects:[{id:'p',name:'Project'}],phases:[],tasks:[task('a')],settings};assert.equal(validateData(data),data);assert.throws(()=>validateData({...data,tasks:[task('a',{projectId:'missing'})]}));assert.throws(()=>validateData({...data,tasks:[task('a',{start:'2026-02-30'})]}));});
test('legacy backups remain compatible; routine history and matrix are validated',()=>{const data={version:1,projects:[{id:'p',name:'Project'}],phases:[],tasks:[],settings};assert.equal(validateData(data),data);const updated={...data,routines:[{id:'r',kind:'weekly',title:'Review',checks:{'2026-09-28':true}}],matrix:{q1:'Upload',q2:''}};assert.equal(validateData(updated),updated);assert.throws(()=>validateData({...updated,routines:[{...updated.routines[0],checks:{'2026-09-29':true}}]}));assert.throws(()=>validateData({...updated,matrix:{q1:42}}));});

import {migrateHierarchy,reorder,removePhase} from './hierarchy.js';
test('hierarchy migration preserves task dates and dependencies; sibling sorting',()=>{
 const source={phases:[{id:'ph',name:'2차'}],projects:[{id:'p',name:'프로젝트'}],tasks:[{id:'a',projectId:'p',phaseId:'ph',start:'2026-09-30',end:'2026-10-01',predecessors:[]},{id:'b',projectId:'p',phaseId:'',parentId:'a',start:'2026-10-01',end:'2026-10-01',predecessors:['a']},{id:'c',projectId:'p',phaseId:'',start:'2026-10-02',end:'2026-10-02'}]};
 const next=migrateHierarchy(source);assert.equal(next.projects.length,2);assert.equal(next.tasks[0].projectId,next.tasks[1].projectId);assert.notEqual(next.tasks[0].projectId,next.tasks[2].projectId);assert.deepEqual(next.tasks[1].predecessors,['a']);assert.equal(next.tasks[0].start,source.tasks[0].start);assert.deepEqual(migrateHierarchy(next),next);assert.equal(source.tasks[2].projectId,'p');assert.deepEqual(reorder([{id:'a'},{id:'b'}],'b','a').map(x=>x.id),['b','a']);
});

test('removing an occupied phase preserves projects, task trees, dates and dependencies',()=>{
 const data={version:1,hierarchyVersion:1,works:[{id:'w',name:'영상'}],phases:[{id:'v',name:'v26-10',workId:'w'},{id:'c',name:'c26-10',workId:'w'}],projects:[{id:'p',name:'영상',phaseId:'v'},{id:'q',name:'코딩',phaseId:'c'}],tasks:[task('a',{phaseId:'v'}),task('b',{phaseId:'v',parentId:'a',predecessors:['a']}),task('other',{projectId:'q',phaseId:'c'})],settings};
 const snapshot=structuredClone(data),next=removePhase(data,'v');
 assert.equal(validateData(next),next);
 assert.deepEqual(next.phases,[data.phases[1]]);
 assert.deepEqual(next.projects,[{...data.projects[0],phaseId:''},data.projects[1]]);
 assert.deepEqual(next.tasks,[{...data.tasks[0],phaseId:''},{...data.tasks[1],phaseId:''},data.tasks[2]]);
 assert.deepEqual(data,snapshot);
 assert.equal(removePhase(next,'missing'),next);
 assert.equal(validateData(removePhase(next,'c')).phases.length,0);
});
import {migrateCategories,categories} from './hierarchy.js';
test('category migration preserves tasks, routines and legacy associations, and is idempotent',()=>{
 const source={version:1,hierarchyVersion:1,works:[{id:'w',name:'가족해짜'},{id:'y',name:'야담'}],phases:[{id:'v',name:'v26-10',workId:'w'},{id:'c',name:'c26-10',workId:'w'},{id:'y',name:'26-10',workId:'y'}],projects:[{id:'p',name:'해짜가족한국',phaseId:'v'},{id:'code',name:'바이브코딩',phaseId:'c'},{id:'story',name:'야담제꼬',phaseId:'y'}],tasks:[task('parent',{phaseId:'v'}),task('child',{phaseId:'v',parentId:'parent',predecessors:['parent'],notes:'keep'})],routines:[{id:'r',title:'영어',kind:'daily',checks:{'2026-09-29':true}}],settings};
 const before=structuredClone(source),next=migrateCategories(source);
 assert.equal(validateData(next),next);
 assert.deepEqual(categories(next).map(c=>c.name),['가족해짜','동물지식','거제아씨야담','영어학습','동물해짜','미분류']);
 assert.deepEqual(next.projects.map(p=>p.phaseId),['category-1','','category-3']);
 assert.deepEqual(next.tasks,source.tasks.map(t=>({...t,phaseId:'category-1'})));
 assert.deepEqual(next.routines,source.routines);assert.deepEqual(source,before);
 assert.equal(migrateCategories(next),next);
 const added={...next,phases:[...next.phases,{id:'new',name:'새 분류',workId:''}]};
 assert.deepEqual(categories(migrateCategories(added)).slice(-2).map(c=>c.name),['새 분류','미분류']);
 const removed=removePhase(next,'category-1');assert.equal(validateData(removed),removed);assert.equal(removed.projects[0].phaseId,'');assert.equal(removed.tasks[0].phaseId,'');
});
