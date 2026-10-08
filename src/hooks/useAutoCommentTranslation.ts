"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

export function useAutoCommentTranslation(text:string,translation:string,onTranslation:(value:string)=>void,enabled=true) {
  const latest=useRef({text,translation,onTranslation,enabled});
  const request=useRef<AbortController|null>(null),version=useRef(0);
  const [translating,setTranslating]=useState(false),[error,setError]=useState('');
  useEffect(()=>{latest.current={text,translation,onTranslation,enabled};},[text,translation,onTranslation,enabled]);
  const translate=useCallback(async()=>{
    request.current?.abort();const id=++version.current;
    const source=latest.current.text,previous=latest.current.translation;
    if(!source.trim())return;
    const controller=new AbortController();request.current=controller;setTranslating(true);setError('');
    try {
      const response=await fetch('/api/comment-collector/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'번역하지 못했습니다.');
      if(id!==version.current||latest.current.text!==source||latest.current.translation!==previous)return;
      latest.current.onTranslation(data.translation);
    }catch(e){if(id===version.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'번역하지 못했습니다.');}
    finally{if(id===version.current)setTranslating(false);}
  },[]);
  const cancel=useCallback(()=>{request.current?.abort();++version.current;},[]);
  useEffect(()=>{
    cancel();
    const timer=setTimeout(()=>{
      setTranslating(false);setError('');
      if(enabled&&/[A-Za-z]/.test(text)&&!latest.current.translation.trim())void translate();
    },600);
    return()=>{clearTimeout(timer);cancel();};
  },[text,enabled,translate,cancel]);
  return {translating,error,translate};
}
