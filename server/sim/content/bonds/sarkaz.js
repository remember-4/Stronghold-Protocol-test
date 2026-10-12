// Battle-only Will. A queue handles crown feedback without recursion; only accepted stacks emit gain events.
import * as S from '../support/index.js';
export const SARKAZ='sarkazShip';
export function install(battle){
 const member=u=>S.isOp(u)&&u.side==='ally'&&S.isMember(battle,u,SARKAZ)&&S.bondActive(battle,u.ownerId,SARKAZ);
 const living=pid=>battle.allyUnits.filter(u=>u.ownerId===pid&&member(u)&&S.onField(u));
 const update=u=>{const m=u.mem,doubled=(m.sarkazDoubleUntil||0)>battle.time,pct=Math.min(30,m.sarkazWill||0)*(.02+.00015*S.bondLayers(battle,u.ownerId,SARKAZ))*(doubled?2:1);S.passiveBuff(battle,u,'bond:sarkaz:will',S.directMods({atk:pct,def:pct}));};
 const queue=[];let draining=false;
 const gain=(u,n,reason='bond')=>{
  if(!(n>0)||!member(u)||!S.onField(u))return;
  queue.push({u,n,reason});if(draining)return;draining=true;
  try{for(let i=0;i<queue.length;i++){const {u,n,reason}=queue[i];if(!member(u)||!S.onField(u))continue;const before=u.mem.sarkazWill||0,added=Math.max(0,Math.min(n,30-before));if(!(added>1e-9))continue;u.mem.sarkazWill=Math.min(30,before+added);if(S.bondTier(battle,u.ownerId,SARKAZ)>=2)u.mem.sarkazDoubleUntil=battle.time+1;update(u);battle.emit('sarkazWillGain',{unit:u,amount:added,reason});}}finally{queue.length=0;draining=false;}
 };
 battle.gainSarkazWill=gain;
 battle.on('tick',({dt})=>{for(const u of battle.allyUnits){if(!member(u)||!S.onField(u))continue;u.mem.sarkazAliveTime=(u.mem.sarkazAliveTime||0)+dt;while(u.mem.sarkazAliveTime>=5-1e-9){u.mem.sarkazAliveTime-=5;gain(u,1,'survival');}update(u);}});
 battle.on('kill',({killer,victim})=>{if(member(killer)&&S.onField(killer)&&victim?.side==='enemy')gain(killer,1,'kill');});
 battle.on('deploy',({unit:u})=>{if(!member(u))return;u.mem.sarkazAliveTime=0;if(S.bondTier(battle,u.ownerId,SARKAZ)>=2)for(const a of living(u.ownerId))gain(a,1,'deploy');});
 battle.on('death',({unit:u,reason})=>{if(reason!=='killed'||!member(u))return;const allies=living(u.ownerId).filter(a=>a!==u);if(S.bondTier(battle,u.ownerId,SARKAZ)>=2)for(const a of allies)gain(a,1,'death');const n=u.mem.sarkazWill||0;u.mem.sarkazWill=0;u.mem.sarkazAliveTime=0;u.mem.sarkazDoubleUntil=0;update(u);if(allies.length&&n>0)for(const a of allies)gain(a,n/allies.length,'inherit');},{priority:30});
}
