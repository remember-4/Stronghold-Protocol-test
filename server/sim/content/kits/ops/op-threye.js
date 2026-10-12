// Official CN skill/talent data. The Sami IS-only talent does not activate in Stronghold.
import { talentBb, skillRec } from '../shared/tier1.js';
import { inElementBurst } from '../../../elementState.js';
import { hasHp } from '../../../damage.js';
export default {char_4102_threye:(bb,raw)=>{
 const s1=skillRec(raw,'skchr_threye_1')?.bb||{},s2=skillRec(raw,'skchr_threye_2')?.bb||{},t=talentBb(raw,1);
 const rider=({battle,unit,target},ratio)=>{if(hasHp(target))battle.dealDamage(unit,target,{type:'element',element:'apoptosis',amount:unit.s.atk*ratio,tags:['skill','threye:rider']});};
 return {skills:{skchr_threye_1:{kind:'instant',attack:{atkScale:s1.atk_scale,onHit:c=>rider(c,s1.ep_damage_ratio)}},skchr_threye_2:{kind:'duration',mods:{aspd:s2.attack_speed},targeting:{maxTargets:2},attack:{onHit:c=>rider(c,s2['attack@ep_damage_ratio'])}}},talents:[{install(b,u){b.addBuff(u,{key:'threye:hermit',mods:{atkPct:t.atk||0,aspd:t.attack_speed||0}});b.on('damaged',c=>{if(c.source===u&&c.dmg.isAttack&&c.target?.side==='enemy'&&t.sluggish>0&&inElementBurst(b,c.target,'apoptosis'))b.applyStatus(c.target,'sluggish',{duration:t.sluggish,source:u});},{owner:u});b.on('elementHit',c=>{if(c.source===u&&c.target?.side==='enemy'&&(c.target.isBoss||c.target.def.rank==='ELITE'||c.target.def.rank==='BOSS'))c.dmg.mul*=raw.trait?.bb?.ep_damage_scale||1;},{owner:u});}}]};
}};
