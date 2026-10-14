// Rebuild fixed-pool records from the project's existing official operator forms.
import fs from 'node:fs';
import { composeUnitRecord } from '../../shared/standIn.js';
import { addChessToken } from './chess-token.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(`../../data/${n}.json`,import.meta.url)));
const write=(n,v)=>fs.writeFileSync(new URL(`../../data/${n}.json`,import.meta.url),JSON.stringify(v)+'\n');
const chess=read('chess'), backups=read('backups'), tokens=read('tokens'), bonds=read('bonds'), gars=read('garrisons');
backups.units.char_4231_clemnt=JSON.parse(fs.readFileSync(new URL('./clemnt-unit.json',import.meta.url)));
const defs=[['chess_char_6_clemnt','char_4231_clemnt',6,null,'garrison_element_clemnt'],['chess_char_4_vvana','char_4098_vvana',4,'uniequip_002_vvana','garrison_element_vvana'],['chess_char_6_phatm2','char_1042_phatm2',6,'uniequip_002_phatm2','garrison_element_wine']];
for(const [stem,charId,tier,modId,gar] of defs){
 const u=backups.units[charId];if(!u)throw new Error(`Missing ${charId}`);
 for(const gold of [false,true]){
  const id=stem+(gold?'_b':'_a');const template=chess[`chess_char_${tier}_01_${gold?'b':'a'}`];
  const identity={...template,chessId:id,baseId:stem+'_a',goldenId:stem+'_b',isGolden:gold,tier,isHidden:false,isDiy:false,visible:true,chessType:'PRESET',shopSortId:99,
   identifier:chess[id]?.identifier??Math.max(...Object.values(chess).map(c=>c.identifier||0))+1,
   bonds:[charId==='char_4231_clemnt'?'egirShip':'victoriaShip','elementShip'],garrisonIds:[gar+(gold?'_b':'_a')],upgradeNum:gold?0:3,upgradeChessId:gold?null:stem+'_b',
   backup:{charId,tmplId:null,skillIndex:2,uniEquipId:modId,potRank:5}};
  let form=structuredClone(u.forms[gold?'2/60/7/3':'2/1/4/0']);
  // Explicit default burn module: stage 1 for the normal card, stage 3 for elite.
  if(!gold&&charId==='char_4098_vvana')form.modules=structuredClone(u.forms['2/60/7/1'].modules);
  identity.status={...form.status};if(!gold&&charId==='char_4098_vvana')identity.status.equipLevel=1;
  const selected=gold||charId==='char_4098_vvana'?modId:null;
  const rec=composeUnitRecord(identity,u,form,{skillIndex:2,moduleId:selected});if(!rec?.skill)throw new Error(`Missing skill ${id}`);
  if(!gold&&selected){rec.statsBase=form.stats;rec.traitBase=form.trait;rec.talentsBase=form.talents;rec.modules=form.modules.map(m=>({...m,isDefault:m.uniEquipId===selected}));}
  chess[id]=rec;
  const status=gold?'2/60/7/3':'2/1/4/0';
  for(const tk of form.tokens??[])addChessToken(tokens,backups.tokens,tk,rec,`${charId}@${status}`);
 }
 // Keep DIY behaviour/picks intact: this update only adds fixed cards.
}
const base=(id,desc,event,effect,bb,bbStr,owners)=>({garrisonId:id,desc,descRaw:desc,eventType:event,eventTypeDesc:event==='IN_BATTLE'?'持续叠加':'单次叠加',eventTypeIcon:'icon_bond',effectType:effect,effectKey:effect,battleRuneKey:event==='IN_BATTLE'?'custom_element':null,charLevel:0,bb,bbStr,owners});
for(const gold of [false,true]){
 const suf=gold?'_b':'_a';const n=gold?4:2,cap=gold?16:8;
 gars['garrison_element_vvana'+suf]=base('garrison_element_vvana'+suf,`<战斗中>攻击敌人时额外造成自身攻击力15%的灼燃损伤；敌人进入灼燃损伤爆发时，使已激活的【维多利亚】【元素】层数+${n}（每场各至多${cap}层）`,'IN_BATTLE','custom_element_vvana',{ep_damage_ratio:.15,bond_add_count:n,max_add_count_per_battle:cap},{bond_id:'victoriaShip,elementShip'},['chess_char_4_vvana'+suf]);
 gars['garrison_element_wine'+suf]=base('garrison_element_wine'+suf,`<战斗中>【元素】【维多利亚】各每叠加2层，自身攻击力+${gold?2:1}%；自身造成的所有生命伤害变为元素伤害（元素损伤积累不变）`,'IN_BATTLE','custom_element_wine',{atk_per_step:gold?.02:.01,divide_num:2},{bond_id:'elementShip,victoriaShip'},['chess_char_6_phatm2'+suf]);
 gars['garrison_element_clemnt'+suf]=base('garrison_element_clemnt'+suf,'<战斗中>场上任意【阿戈尔】盟约干员被击倒（包含被吞噬）时，【阿戈尔】【元素】层数+1','IN_BATTLE','custom_element_clemnt',{bond_add_count:1},{bond_id:'egirShip,elementShip'},['chess_char_6_clemnt'+suf]);
 const bl= gars['garrison_35'+suf];bl.bbStr.bond='yanShip,victoriaShip,elementShip';bl.desc=bl.descRaw=`<获得时>【炎】【维多利亚】【元素】层数+${gold?10:5}（无需激活盟约）`;
 const ny=gars['garrison_56'+suf];ny.bb.element_ratio=.5;ny.desc=ny.descRaw=`<休整期结束时>整备区每有1个干员，使已激活的【迅捷】层数+${gold?4:2}；通过本特质叠加【迅捷】时，额外叠加其一半的【元素】层数`;
 const ce=gars['garrison_90'+suf];ce.bb.extra_element_layers=2;ce.desc=ce.descRaw=ce.desc.replace(/；开启技能时额外.*$/,'')+'；开启技能时额外使【元素】层数+2，触发次数与原效果相同';
}
for(const [bid,rec] of Object.entries(bonds)){
 const ids=Object.values(chess).filter(c=>!c.isGolden&&!c.isDiy&&c.bonds.includes(bid)).map(c=>c.chessId).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));rec.members=ids;rec.visibleMembers=ids.filter(id=>chess[id].visible);
}
const e=bonds.elementShip;e.bb.base_damage_scale_show=.25;e.bb.damage_scale_per_stack=.005;e.buffs[0].bb={...e.bb};
for(const k of ['desc','descRaw'])e[k]=e[k].replace('提升10%','提升（25%＋0.5%×层数）');
e.spec.layerGain='妮芙：其特质迅捷加层的一半；烛煌获得时+5/10；塑心技能额外+2、次数与原特质一致；薇薇安娜爆发触发+2/4，各至多8/16。';
write('backups',backups);write('chess',chess);write('tokens',tokens);write('bonds',bonds);write('garrisons',gars);
