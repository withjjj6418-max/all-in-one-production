export function migrateHierarchy(data) {
  if(data.hierarchyVersion===1)return data;
  const works=[{id:'work-personal',name:'개인'}];
  const phases=data.phases.map(p=>({...p,workId:works[0].id,category:'차수'}));
  let fallback='phase-always';while(phases.some(p=>p.id===fallback))fallback+='-default';phases.push({id:fallback,name:'상시',category:'상시',workId:works[0].id});
  const projects=[],tasks=data.tasks.map(t=>({...t}));
  for(const project of data.projects){
    const own=tasks.filter(t=>t.projectId===project.id), byId=new Map(own.map(t=>[t.id,t]));
    const phaseFor=t=>{while(t.parentId&&byId.has(t.parentId))t=byId.get(t.parentId);return t.phaseId||fallback;};
    const ids=[...new Set(own.map(phaseFor))];if(!ids.length)ids.push(fallback);
    ids.forEach((phaseId,index)=>{const id=index?`${project.id}-phase-${phaseId}`:project.id;projects.push({...project,id,phaseId});for(const t of own)if(phaseFor(t)===phaseId){t.projectId=id;t.phaseId=phaseId;}});
  }
  return {...data,hierarchyVersion:1,works,phases,projects,tasks};
}
export function reorder(items,from,to,sameGroup=()=>true){
  const a=items.find(x=>x.id===from),b=items.find(x=>x.id===to);if(!a||!b||!sameGroup(a,b))return items;
  const targetIndex=items.findIndex(x=>x.id===to);const next=items.filter(x=>x.id!==from);next.splice(targetIndex,0,a);return next;
}
