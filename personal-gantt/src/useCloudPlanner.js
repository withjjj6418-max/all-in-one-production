import {useEffect,useRef,useState} from 'react';
import {validateData} from './scheduler.js';
import {migrateHierarchy} from './hierarchy.js';
import {migrateRoutines} from './recurrence.js';
const normalize=d=>migrateHierarchy(migrateRoutines(validateData(d)));
export default function useCloudPlanner({enabled,setData,clearHistory}){
 const [state,setState]=useState(enabled?'loading':'local'),[error,setError]=useState('');
 const ref=useRef({revision:0,userId:null,busy:false,pending:null,state:enabled?'loading':'local'});
 const status=s=>{ref.current.state=s;setState(s);};
 const read=async()=>{const r=await fetch('/api/planner',{cache:'no-store',credentials:'same-origin',redirect:'error'});const body=await r.json();if(!r.ok)throw Error(body.error||'서버 연결을 확인해주세요.');return body;};
 const refresh=async()=>{
  if(ref.current.busy)return;ref.current.busy=true;status('loading');
  try{const body=await read();if(ref.current.pending)throw Error('저장하지 못한 변경이 있습니다. 백업 후 서버 일정을 불러와주세요.');
   ref.current.userId=body.userId;ref.current.revision=body.revision;
   const recovery=localStorage.getItem('planner-pending-'+body.userId);
   if(recovery){ref.current.pending=normalize(JSON.parse(recovery));setData(ref.current.pending);status('error');setError('이 기기에 저장하지 못한 변경이 있습니다. 백업 후 서버 일정을 불러와주세요.');return;}
   if(body.payload){setData(normalize(body.payload));clearHistory();status('ready');}else status('import');setError('');
  }catch(e){status('error');setError(e.message||'서버에 연결하지 못했습니다.');}finally{ref.current.busy=false;}
 };
 const save=async next=>{
  if(!enabled)return true;if(ref.current.busy||!['ready','import'].includes(ref.current.state))return false;
  try{normalize(next);}catch(e){setError(e.message);return false;}
  ref.current.busy=true;ref.current.pending=next;status('saving');
  try{localStorage.setItem('planner-pending-'+ref.current.userId,JSON.stringify(next));
   const r=await fetch('/api/planner',{method:'PUT',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:next,revision:ref.current.revision,userId:ref.current.userId})});const body=await r.json();if(!r.ok)throw Error(body.error||'저장하지 못했습니다.');
   ref.current.revision=body.revision;ref.current.pending=null;localStorage.removeItem('planner-pending-'+ref.current.userId);setError('');status('ready');return true;
  }catch(e){setData(next);setError(e.message||'서버에 저장하지 못했습니다. 현재 내용을 백업해주세요.');status('error');return false;}finally{ref.current.busy=false;}
 };
 const reload=()=>{if(ref.current.pending&&!window.confirm('현재 변경을 백업하셨나요? 서버 일정으로 다시 불러옵니다.'))return;ref.current.pending=null;if(ref.current.userId)localStorage.removeItem('planner-pending-'+ref.current.userId);status('loading');refresh();};
 useEffect(()=>{if(!enabled)return;refresh();const poll=()=>{if(ref.current.state==='ready'&&!document.querySelector('[role="dialog"]')&&document.visibilityState==='visible')refresh();};const interval=setInterval(poll,20000);window.addEventListener('focus',poll);return()=>{clearInterval(interval);window.removeEventListener('focus',poll);};},[]);
 return {state,error,save,reload,locked:enabled&&state!=='ready'};
}
