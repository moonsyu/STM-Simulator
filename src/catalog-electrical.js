// Additional catalog device branches use the same net solver as legacy parts.
export function catalogBranches(p,uf,branch,pressed){
 const pin=n=>`part:${p.id}:p${n}`,sensor=(s,g,min=2.7,max=5.5)=>({supply:uf.find(pin(s)),ground:uf.find(pin(g)),min,max});
 if(['catalog_can','catalog_i2s'].includes(p.type))branch(pin(1),pin(2),10000,{id:p.id});
 if(p.type==='catalog_i2s'){branch(pin(7),pin(1),1000000);branch(pin(7),pin(2),100000);}
 if(p.type==='catalog_singlewire'){branch(pin(1),pin(2),10000,{id:p.id});if(p.catalogVariant==='urm09-trig-3')branch(pin(3),pin(2),100000);if(p.catalogState.low)branch(pin(3),pin(2),30);if(p.catalogState.high)branch(pin(3),pin(2),40,{emf:3.3});}
 if(p.type==='catalog_tm1637'){branch(pin(1),pin(2),10000,{id:p.id});for(const n of [3,4])branch(pin(n),pin(1),10000);if(p.catalogState.ack)branch(pin(4),pin(2),20);}
 if(p.type==='catalog_encoder'){const q=p.catalogState.quad||[1,1];for(const [i,n]of [1,3].entries())if(!q[i])branch(pin(n),pin(2),1);if(p.switch)branch(pin(4),pin(5),1);}
 if(p.type==='catalog_stepper'){if(p.catalogVariant.includes('bipolar')){branch(pin(1),pin(2),68,{id:p.id});branch(pin(3),pin(4),68);}else for(let n=2;n<=5;n++)branch(pin(1),pin(n),50,{id:p.id});}
 if(p.type==='catalog_uln'){branch(pin(5),pin(6),10000,{id:p.id});for(let i=0;i<4;i++){branch(pin(i+1),pin(6),10000);branch(pin(i+8),pin(6),4,{sensor:sensor(i+1,6,2,5.5)});}}
 if(p.type==='catalog_digits')for(let d=0;d<4;d++)for(let seg=0;seg<8;seg++)branch(pin(seg+1),pin(d+9),12,{id:p.id,diode:true,led:true,vf:1.8,channel:d+':'+'abcdefg.'.charAt(seg)});
 if(p.catalogVariant==='servo-feedback-4')branch(pin(4),pin(2),100,{sensor:sensor(1,2,4.5,5.5),emf:(p.catalogState.angle??90)/180*3.3});
 if(p.catalogVariant==='motor-driver-hat')for(const n of [6,7,8,9])branch(pin(n),pin(2),.5,{sensor:sensor(5,2,6,12),emf:p.catalogState.outputs?.[n-6]??0});
}
