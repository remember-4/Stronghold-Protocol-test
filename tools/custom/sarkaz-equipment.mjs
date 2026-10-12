import fs from 'node:fs';
const items=JSON.parse(fs.readFileSync('data/items.json'));
for(const s of ['a','b']){const x=items['chess_item_4_06_e_'+s];x.giveBondId='sarkazShip';x.givePowerId='sarkaz';}
for(const gold of [false,true]){const id='chess_item_6_sarkaz_crown_e_'+(gold?'b':'a'),base='chess_item_6_sarkaz_crown_e_a',elite='chess_item_6_sarkaz_crown_e_b',pct=gold?.7:.45;
 const desc=`防御力+${gold?70:45}%；若携带者为【萨卡兹】盟约干员，每次获得遗志时回复4技力并获得0.5秒无敌（不受6人萨卡兹翻倍影响）。\n若同时装备休眠子裔，其他己方萨卡兹干员每累计实际获得4层遗志，自身获得1层遗志。`;
 items[id]={...structuredClone(items['chess_item_6_03_e_'+(gold?'b':'a')]),id,baseId:base,goldenId:elite,isGolden:gold,trapId:'custom_black_crown',iconId:'custom_black_crown',identifier:items[id]?.identifier??Math.max(...Object.values(items).map(x=>x.identifier||0))+1,name:'黑冠',effectId:'custom_black_crown_'+(gold?'b':'a'),effectName:'黑冠',requiresBondId:'sarkazShip',shopSortId:12,desc,descRaw:desc,buffs:[{key:'env_gbuff_new_with_verify',countType:'NONE',bb:{def:pct},bbStr:{key:'attr_common_global_buff'}}],params:{def:pct,sp:4,invulnerable_seconds:.5,other_will_per:4},upgradeChessId:gold?null:elite,family:'sarkaz_crown',implFormula:'Accepted Will gain: SP +4 and invulnerability 0.5s. Dormant offspring combo: other allied same-owner Sarkaz gain 4 accepted stacks in total => own gain 1.',flavor:'黑冠承载着遗志，而非遗忘。'};
}
fs.writeFileSync('data/items.json',JSON.stringify(items)+'\n');const a=JSON.parse(fs.readFileSync('data/assets.json'));a.items.custom_black_crown='/images/black-crown.png';fs.writeFileSync('data/assets.json',JSON.stringify(a)+'\n');
