import { assertMerchantTaskCoverage, type AgentRequirement } from './agent-task';
const request = 'Usa el video como portada completa de inicio';
const plan: AgentRequirement[] = [
 {id:'r1',description:'play',page:'index.html',check:'video',selector:'video',expected:'assets/test.mp4'},
 {id:'r2',description:'cover',page:'index.html',check:'layout',selector:'section',expected:'viewport-cover'},
 {id:'r3',description:'poster',page:'index.html',check:'image',selector:'section',expected:'assets/poster.jpg',profile:'reduced-motion'},
 {id:'r4',description:'pause',page:'index.html',check:'video-paused',selector:'video',expected:'assets/test.mp4',profile:'reduced-motion'},
];
it('requires every full-screen media outcome without allowing a visible-element substitute',()=>{
 expect(()=>assertMerchantTaskCoverage(plan,request)).not.toThrow();
 for(let i=0;i<plan.length;i++) expect(()=>assertMerchantTaskCoverage(plan.filter((_,index)=>index!==i),request)).toThrow('requiere');
 expect(()=>assertMerchantTaskCoverage([], 'Cambia el logo a verde')).not.toThrow();
});
