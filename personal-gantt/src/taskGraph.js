export function descendants(tasks,id) {
  const ids=new Set([id]);
  let changed=true;
  while(changed){changed=false;for(const t of tasks)if(t.parentId&&ids.has(t.parentId)&&!ids.has(t.id)){ids.add(t.id);changed=true;}}
  return ids;
}
export function removeTasks(tasks,ids) {
  const removed=new Set(ids);
  return tasks.filter(t=>!removed.has(t.id)).map(t=>({...t,parentId:removed.has(t.parentId)?null:t.parentId,predecessors:(t.predecessors||[]).filter(id=>!removed.has(id))}));
}
export function validateRelations(tasks) {
  const byId=new Map(tasks.map(t=>[t.id,t]));
  for(const t of tasks){
    if(t.parentId&&(!byId.has(t.parentId)||byId.get(t.parentId).projectId!==t.projectId))throw Error('상위 작업은 같은 프로젝트에 있어야 합니다.');
    if(t.predecessors!==undefined&&(!Array.isArray(t.predecessors)||t.predecessors.some(id=>typeof id!=='string'||!byId.has(id))))throw Error('선행 작업 정보가 올바르지 않습니다.');
  }
  function cycles(neighbors,label){
    const visiting=new Set(),done=new Set();
    function visit(id){if(visiting.has(id))throw Error(label);if(done.has(id))return;visiting.add(id);for(const next of neighbors(byId.get(id)))visit(next);visiting.delete(id);done.add(id);}
    for(const t of tasks)visit(t.id);
  }
  cycles(t=>t.parentId?[t.parentId]:[],'상위·하위 작업을 순환 연결할 수 없습니다.');
  cycles(t=>t.predecessors||[],'선행·후행 작업을 순환 연결할 수 없습니다.');
}
export function connectTasks(tasks,from,to) {
  if(from===to)throw Error('자기 자신과 연결할 수 없습니다.');
  if(!tasks.some(t=>t.id===from)||!tasks.some(t=>t.id===to))throw Error('연결할 작업을 찾을 수 없습니다.');
  const next=tasks.map(t=>t.id===to?{...t,predecessors:[...new Set([...(t.predecessors||[]),from])]}:t);
  validateRelations(next);return next;
}
export function cloneTasks(tasks,ids,projectId) {
  const selected=tasks.filter(t=>ids.has(t.id));
  const mapping=new Map(selected.map(t=>[t.id,crypto.randomUUID()]));
  return selected.map(t=>({...structuredClone(t),id:mapping.get(t.id),title:t.title+' (복사)',status:'waiting',projectId:projectId||t.projectId,parentId:mapping.get(t.parentId)||(projectId?null:t.parentId),predecessors:(t.predecessors||[]).map(id=>mapping.get(id)||id)}));
}
export function treeRows(tasks,matches,collapsed) {
  const wanted=new Set(matches.map(t=>t.id)),byId=new Map(tasks.map(t=>[t.id,t]));
  for(const t of matches){let p=t.parentId;const seen=new Set();while(p&&byId.has(p)&&!seen.has(p)){seen.add(p);wanted.add(p);p=byId.get(p).parentId;}}
  const rows=[];
  function walk(parentId,depth){for(const t of tasks.filter(t=>(t.parentId||null)===parentId)){if(!wanted.has(t.id))continue;rows.push({task:t,depth,hasChildren:tasks.some(x=>x.parentId===t.id)});if(!collapsed[t.id])walk(t.id,depth+1);}}
  walk(null,0);return rows;
}
