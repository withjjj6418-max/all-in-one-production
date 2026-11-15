export function migrateHierarchy(data) {
  if(data.hierarchyVersion===1)return data;
  const works=[{id:'work-personal',name:'개인'}];
  const phases=data.phases.map(p=>({...p,workId:works[0].id}));
  let fallback='phase-always';while(phases.some(p=>p.id===fallback))fallback+='-default';phases.push({id:fallback,name:'상시',workId:works[0].id});
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

export function removePhase(data,id){
  if(!id||!data.phases.some(p=>p.id===id))return data;
  const projectIds=new Set(data.projects.filter(p=>p.phaseId===id).map(p=>p.id));
  return {...data,
    phases:data.phases.filter(p=>p.id!==id),
    projects:data.projects.map(p=>projectIds.has(p.id)?{...p,phaseId:''}:p),
    tasks:data.tasks.map(t=>t.phaseId===id||projectIds.has(t.projectId)?{...t,phaseId:''}:t),
  };
}

// Keep the stored phaseId field for backup compatibility; it now identifies a category.
export function categories(data){return [...data.phases,{id:'',name:'미분류',workId:''}];}
export function migrateCategories(data){
  if(data.categoryVersion===1)return data;
  const names=['가족해짜','동물지식','거제아씨야담','영어학습','동물해짜'];
  const phases=names.map((name,i)=>({id:`category-${i+1}`,name,workId:''}));
  const match=name=>{
    if(/코딩|개발|국뽕|국뻥/.test(name||''))return '';
    const normalized=(name||'').replace(/\s/g,'');
    if(/가족해짜|해짜가족/.test(normalized))return phases[0].id;
    if(/동물지식/.test(normalized))return phases[1].id;
    if(/야담|거제아씨/.test(normalized))return phases[2].id;
    if(/영어/.test(normalized))return phases[3].id;
    if(/동물해짜|해짜동물/.test(normalized))return phases[4].id;
    return null;
  };
  const projects=data.projects.map(p=>{
    const phase=data.phases.find(ph=>ph.id===p.phaseId),work=data.works.find(w=>w.id===phase?.workId);
    return {...p,phaseId:match(p.name)??match(work?.name)??match(phase?.name)??''};
  });
  return {...data,categoryVersion:1,legacyHierarchy:{works:data.works,phases:data.phases,projects:data.projects.map(({id,phaseId})=>({id,phaseId}))},
    works:[{id:'legacy-work',name:'개인'}],phases,projects,
    tasks:data.tasks.map(t=>({...t,phaseId:projects.find(p=>p.id===t.projectId)?.phaseId||''})),
  };
}

export function flattenProjects(data){
  if(data.taskLayoutVersion===1)return data;
  const byId=new Map(data.projects.map(p=>[p.id,p]));
  return {...data,taskLayoutVersion:1,legacyProjects:data.projects,projects:[],
    tasks:data.tasks.map(t=>({...t,projectId:'',phaseId:byId.get(t.projectId)?.phaseId??t.phaseId??'',color:t.color||byId.get(t.projectId)?.color||'#9684ff'})),
  };
}
