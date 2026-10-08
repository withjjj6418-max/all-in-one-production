import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentSource, collectionRequest, mergeComments, commentsCsv, youtubeComments } from '../src/lib/comment-collector.ts';

test('exact platform hosts and post URLs only',()=>{
  assert.equal(commentSource('https://youtu.be/aqz-KE-bpKQ?t=2').id,'aqz-KE-bpKQ');
  assert.equal(commentSource('https://www.youtube.com/shorts/aqz-KE-bpKQ').id,'aqz-KE-bpKQ');
  assert.equal(commentSource('https://www.instagram.com/reel/ABC123/?igsh=abc').url,'https://www.instagram.com/p/ABC123/');
  for(const url of ['http://localhost/a','https://youtube.com.evil.com/watch?v=aqz-KE-bpKQ','https://www.instagram.com/account/','https://u:p@youtube.com/watch?v=aqz-KE-bpKQ'])assert.throws(()=>commentSource(url));
});
test('pagination, zero likes, original Unicode and source links are preserved',async()=>{
  let queried;
  const result=await youtubeComments(commentSource('https://youtu.be/aqz-KE-bpKQ'),'test-key','time','page2',async(url)=>{
    queried=new URL(url);return Response.json({nextPageToken:'page3',items:[{snippet:{topLevelComment:{id:'id&x',snippet:{authorDisplayName:'작성자',textOriginal:'안녕\n"hello"',likeCount:0,publishedAt:'2026-01-01T00:00:00Z'}}}}]});
  });
  assert.equal(queried.searchParams.get('pageToken'),'page2');assert.equal(queried.searchParams.get('order'),'time');assert.equal(result.comments[0].likes,0);assert.equal(result.comments[0].text,'안녕\n"hello"');assert.ok(result.comments[0].url.endsWith('lc=id%26x'));assert.equal(result.nextPageToken,'page3');assert.equal(result.partial,true);
  assert.equal(mergeComments(result.comments,[{...result.comments[0],likes:5}]).length,1);
});
test('upstream errors are actionable without credentials',async()=>{
  await assert.rejects(youtubeComments(commentSource('https://youtu.be/aqz-KE-bpKQ'),'secret','relevance','',async()=>Response.json({error:{errors:[{reason:'commentsDisabled'}],message:'secret'}},{status:403})),/비활성화/);
});
test('realistic long continuation tokens survive the request boundary',()=>{
  const token='A'.repeat(1076);
  assert.equal(collectionRequest(JSON.stringify({url:'https://youtu.be/aqz-KE-bpKQ',pageToken:token})).token,token);
  assert.throws(()=>collectionRequest(JSON.stringify({url:'https://youtu.be/aqz-KE-bpKQ',pageToken:'A'.repeat(16385)})));
});
test('CSV preserves multiline Unicode and neutralizes spreadsheet formulas',()=>{
  const csv=commentsCsv([{id:'1',author:'=1+2',text:'한글, "인용"\n두 줄',likes:null,publishedAt:'',url:'https://example.com'}]);
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes("\"'=1+2\""));assert.ok(csv.includes('"한글, ""인용""\n두 줄"'));
});
test('Instagram comments without IDs remain independently selectable',()=>{
  const rows=mergeComments([],['first','second','first'].map(text=>({id:'',author:'same',text,likes:null,publishedAt:'',url:'https://www.instagram.com/p/ABC/'})));
  assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.ok(rows.every(c=>c.id));
});
