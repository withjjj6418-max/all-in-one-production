export const PROFILE_COLORS = ['#528b46','#4388be','#a95762','#8962b2','#b98242','#429b93'];
export function randomIdentity() {
  const pick = (n:number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const first=['구름','오늘','조용한','행복한','파란','작은','웃는','느긋한'];
  const last=['고양이','여행자','토끼','바람','별빛','감자','산책','하루'];
  return {nickname:`@${first[pick(first.length)]}${last[pick(last.length)]}${pick(900)+100}`,color:PROFILE_COLORS[pick(PROFILE_COLORS.length)]};
}
export function wrapComment(text:string,width:number,measure:(text:string)=>number) {
  const lines:string[]=[];let line='';
  for(const char of text.replaceAll('\r','')) {
    if(char==='\n'){lines.push(line);line='';continue;}
    if(line&&measure(line+char)>width-150){const split=line.lastIndexOf(' ');if(split>0){lines.push(line.slice(0,split+1));line=line.slice(split+1);}else{lines.push(line);line='';}}line+=char;
  }
  lines.push(line);return lines;
}
export function commentLayout(text:string,width:number,font:number,dialogueEnd:number,gap:number,measure:(text:string)=>number) {
  if(!text.trim())throw Error('댓글 문구를 입력하세요.');
  if(![width,font,dialogueEnd,gap].every(Number.isFinite)||width<480||width>1000||font<24||font>64||dialogueEnd<0||dialogueEnd>1800||gap<0||gap>200)throw Error('크기와 위치를 확인하세요.');
  const lines=wrapComment(text,width,measure),lineHeight=Math.ceil(font*1.4),height=110+lines.length*lineHeight;
  const x=Math.round((1080-width)/2),y=Math.round(dialogueEnd+gap);
  if(y+height>1920)throw Error('댓글이 화면 아래를 벗어납니다. 문구를 줄이거나 글자 크기·자막 끝 위치를 조절하세요.');
  return {width,height,x,y,lines,lineHeight};
}
export type CardStyle={nickname:string;color:string;text:string;translation:string;bilingual:boolean;likes:number|null;width:number;font:number;dialogueEnd:number;gap:number;opacity:number;blurName:boolean;blurProfile:boolean;fullFrame:boolean};
export function drawComment(canvas:HTMLCanvasElement,style:CardStyle) {
  if(!Number.isFinite(style.opacity)||style.opacity<10||style.opacity>100)throw Error('불투명도는 10~100%로 입력하세요.');
  const card=document.createElement('canvas');let ctx=card.getContext('2d')!;
  const fontFamily='"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.font=`${style.font}px ${fontFamily}`;
  if(style.bilingual&&!style.translation.trim())throw Error('한국어 번역을 생성하거나 직접 입력하세요.');
  const layout=commentLayout(style.bilingual?style.translation:style.text,style.width,style.font,style.dialogueEnd,style.gap,text=>ctx.measureText(text).width);
  const englishFont=Math.max(18,Math.round(style.font*0.67)),englishLineHeight=Math.ceil(englishFont*1.4);
  ctx.font=`${englishFont}px ${fontFamily}`;
  const englishLines=style.bilingual?wrapComment(style.text,style.width,text=>ctx.measureText(text).width):[];
  const extraHeight=englishLines.length?englishLines.length*englishLineHeight+12:0;layout.height+=extraHeight;
  if(layout.y+layout.height>1920)throw Error('영어와 한국어 댓글이 화면 아래를 벗어납니다. 문구·글자 크기·자막 끝 위치를 조절하세요.');
  card.width=layout.width;card.height=layout.height;ctx=card.getContext('2d')!;
  ctx.fillStyle='#101010';ctx.beginPath();ctx.roundRect(0,0,card.width,card.height,24);ctx.fill();
  // Blur only generated identity layers. Comment text and likes stay sharp.
  ctx.save();ctx.filter=style.blurProfile?'blur(12px)':'none';ctx.fillStyle=style.color;ctx.beginPath();ctx.arc(60,60,31,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.font=`30px ${fontFamily}`;ctx.textAlign='center';ctx.fillText(style.nickname.replace('@','').slice(0,1),60,71);ctx.restore();
  ctx.save();ctx.filter=style.blurName?'blur(7px)':'none';ctx.fillStyle='#ddd';ctx.font=`25px ${fontFamily}`;ctx.fillText(style.nickname,116,44,card.width-150);ctx.restore();
  ctx.fillStyle='#ffe45c';ctx.font=`${englishFont}px ${fontFamily}`;englishLines.forEach((line,i)=>ctx.fillText(line,116,76+i*englishLineHeight));
  ctx.fillStyle='#f4f4f4';ctx.font=`${style.font}px ${fontFamily}`;layout.lines.forEach((line,i)=>ctx.fillText(line,116,86+extraHeight+i*layout.lineHeight));
  ctx.strokeStyle='#aaa';ctx.lineWidth=2;ctx.save();ctx.translate(116,card.height-34);ctx.scale(1.1,1.1);
  ctx.stroke(new Path2D('M7 10v12H3V10h4Zm0 0 5-8c1-1 3 0 3 2v5h5c2 0 3 1 2 3l-2 8c0 1-1 2-3 2H7'));ctx.restore();
  ctx.fillStyle='#aaa';ctx.font=`23px ${fontFamily}`;ctx.fillText(style.likes===null?'좋아요 미표시':style.likes.toLocaleString('ko-KR'),154,card.height-13);
  canvas.width=style.fullFrame?1080:card.width;canvas.height=style.fullFrame?1920:card.height;
  const output=canvas.getContext('2d')!;output.clearRect(0,0,canvas.width,canvas.height);output.globalAlpha=style.opacity/100;output.drawImage(card,style.fullFrame?layout.x:0,style.fullFrame?layout.y:0);output.globalAlpha=1;
  return layout;
}
