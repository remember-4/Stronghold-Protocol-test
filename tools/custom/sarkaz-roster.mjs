import fs from 'node:fs';
import {composeUnitRecord} from '../../shared/standIn.js';
import {addChessToken} from './chess-token.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(`../../data/${n}.json`,import.meta.url)));
const write=(n,v)=>fs.writeFileSync(new URL(`../../data/${n}.json`,import.meta.url),JSON.stringify(v)+'\n');
const chess=read('chess'),backups=read('backups'),gars=read('garrisons'),bonds=read('bonds'),tokens=read('tokens');
backups.units.char_4102_threye=JSON.parse(fs.readFileSync(new URL('./threye-unit.json',import.meta.url)));
const mapping={红豆:['sarkazShip','indomShip'],凛视:['sarkazShip','elementShip'],菲莱:['sargonShip','elementShip'],赫德雷:['sarkazShip','steadShip'],可露希尔:['sarkazShip','visiShip'],华法琳:['sarkazShip','miraShip'],泥岩:['sarkazShip','soloShip'],史尔特尔:['sarkazShip','raidShip','arcaneShip'],妮芙:['sarkazShip','swiftShip','elementShip'],隐德来希:['sarkazShip','skillfulShip','indomShip'],提丰:['sarkazShip','preciShip','swiftShip'],维什戴尔:['sarkazShip'],魔王:['sarkazShip']};
for(const [cid,tier,price,skillIndex] of [['char_4088_hodrer',3,3,2],['char_4102_threye',2,3,1],['char_4228_closur',3,3,2],['char_2012_typhon',6,4,2],['char_1035_wisdel',6,4,1]]){
 const u=backups.units[cid],stem=`chess_char_${tier}_sarkaz_${cid.split('_').at(-1)}`;
 for(const gold of [false,true]){const id=stem+(gold?'_b':'_a'),modlevel=gold?(tier>=6?3:1):0,status=`2/${gold?60:1}/${gold?7:4}/${modlevel}`,form=u.forms[status],mod=form.modules?.[0]?.uniEquipId??null;
  const identity={...chess[`chess_char_${tier}_01_${gold?'b':'a'}`],chessId:id,baseId:stem+'_a',goldenId:stem+'_b',isGolden:gold,tier,price,sellPrice:gold?price*3:price,identifier:chess[id]?.identifier??Math.max(...Object.values(chess).map(x=>x.identifier||0))+1,isHidden:false,isDiy:false,visible:true,chessType:'PRESET',shopSortId:98,bonds:mapping[u.name],garrisonIds:[`garrison_sarkaz_${cid.split('_').at(-1)}${gold?'_b':'_a'}`],upgradeNum:gold?0:3,upgradeChessId:gold?null:stem+'_b',status:form.status,backup:{charId:cid,skillIndex,uniEquipId:mod,potRank:5,tmplId:null}};
  chess[id]=composeUnitRecord(identity,u,form,{skillIndex,moduleId:mod});
  for(const tk of form.tokens||[])addChessToken(tokens,backups.tokens,tk,chess[id],`${cid}@${status}`);
 }
}
for(const c of Object.values(chess))if(mapping[c.name]&&!c.isDiy)c.bonds=mapping[c.name];
// Promote the authored hidden tier-6 Nymph and tier-5 Civilight records; obsolete forms stay hidden for saved references.
for(const c of Object.values(chess)){
 if(c.name==='红豆'){c.isHidden=false;c.visible=true;}
 if(c.name==='妮芙'){c.isHidden=c.tier!==6;c.visible=c.tier===6;}
 if(c.name==='魔王'){c.isHidden=c.tier!==5;c.visible=c.tier===5;}
}
const gar=(id,desc,event,key,bb={},bbStr={})=>({garrisonId:id,desc,descRaw:desc,eventType:event,eventTypeDesc:event==='IN_BATTLE'?'持续叠加':'单次叠加',eventTypeIcon:'icon_bond',effectType:key,effectKey:key,battleRuneKey:event==='IN_BATTLE'?'env_gbuff_new_with_verify':null,charLevel:0,bb,bbStr,owners:[]});
for(const gold of [false,true]){const suf=gold?'_b':'_a',n=gold?2:1;
 const id='garrison_sarkaz_threye'+suf;gars[id]=gar(id,`<获得时>自身所属盟约层数+${3*n}（无需激活盟约）`,'SERVER_GAIN','SERVER_ADD_BOND_CHESS_ALL',{count:3*n});
 const cl='garrison_sarkaz_closur'+suf;gars[cl]=gar(cl,`<休整期结束时>本回合每花费3资金，使已激活的【远见】【萨卡兹】层数+${2*n}（各上限${8*n}）`+(gold?'；允许资金最低到-2；若休整期结束仍低于0，本次叠层失效，下回合偿还两倍欠款':''),'SERVER_PREP_FIN','CUSTOM_SARKAZ_CLOSURE',{layer:2*n,cap:8*n},{conditionkey:'character_target_inboard'});
 const ty='garrison_sarkaz_typhon'+suf;gars[ty]=gar(ty,`【萨卡兹】【迅捷】每叠加3层，本干员攻击力+${2*n}%`,'IN_BATTLE','act1autochess_gar_eff_attrByBond',{divide_num:3,atk:.02*n},{bond_id:'sarkazShip,swiftShip'});
 const wi='garrison_sarkaz_wisdel'+suf;gars[wi]=gar(wi,`<战斗中>每名【萨卡兹】盟约干员首次开启技能时，使已激活的【萨卡兹】层数+${2*n}`,'IN_BATTLE','custom_sarkaz_wisdel',{layer:2*n});
 const ph=gars['garrison_43'+suf];ph.bb.bond_add_count=6*n;ph.bb.bond_add_counts={sargonShip:6*n,elementShip:3*n};ph.bbStr.bond_id='sargonShip,elementShip';ph.desc=ph.descRaw=`<战斗中>开启技能时，使已激活的【萨尔贡】层数+${6*n}、【元素】层数+${3*n}`;
 const hd='garrison_sarkaz_hodrer'+suf;gars[hd]=gar(hd,`<战斗中>首次开启技能时，使已激活的【萨卡兹】【坚守】层数+${6*n}`,'IN_BATTLE','act1autochess_gar_event_useskill',{bond_add_count:6*n,first_skill_only:true},{bond_type:'bond_by_id',bond_id:'sarkazShip,steadShip',bond_add_type:'by_count'});
 const ny='garrison_56'+suf;gars[ny]=gar(ny,`<休整期结束时>整备区每有${gold?1:2}个干员，使已激活的【元素】【迅捷】层数+3`,'SERVER_PREP_FIN','CUSTOM_SARKAZ_NYMPH',{per:gold?1:2},{conditionkey:'character_target_inboard'});
 const en='garrison_10'+suf;gars[en]=gar(en,`<进入休整期时>使自身已激活盟约层数+${6*n}`,'SERVER_PREP_START','SERVER_ADD_BOND_CHESS_ALL',{count:6*n},{conditionkey:'character_target_inboard'});
 // A private grant avoids changing garrison_95 for other operators that happen to share it.
 const granted='garrison_sarkaz_warfarin_grant'+suf;gars[granted]=structuredClone(gars['garrison_95'+suf]);gars[granted].garrisonId=granted;gars[granted].bb.bond_add_count=n;gars[granted].bb.max_add_count_per_battle=10*n;gars[granted].desc=gars[granted].descRaw=`<战斗中>开启技能时，使自身所属已激活盟约层数+${n}（每场各至多${10*n}层）`;
 const wa=gars['garrison_72'+suf];wa.bbStr.give_garrison_id=granted;wa.desc=wa.descRaw=`<战斗开始时>身前一格干员获得特质“开启技能时使自身所属已激活盟约层数+${n}”（每场各至多${10*n}层）`;
 const su='garrison_sarkaz_surtr'+suf;gars[su]=gar(su,`<战斗中>每击倒1名敌人，使已激活的【萨卡兹】层数+${n}`,'IN_BATTLE','act1autochess_gar_event_selfkillenemy',{bond_add_count:n,check_cnt:1},{bond_type:'bond_by_id',bond_id:'sarkazShip',bond_add_type:'by_count'});
 for(const c of Object.values(chess))if(c.name==='史尔特尔'&&c.isGolden===gold&&!c.garrisonIds.includes(su))c.garrisonIds.push(su);
 const vi=gars['garrison_04'+suf];vi.bb.price=0;vi.desc=vi.descRaw='购买价格为1';
}
for(const c of Object.values(chess)){if(c.name==='红豆'){c.price=1;c.sellPrice=c.isGolden?3:1;}if(['妮芙','魔王'].includes(c.name))c.price=4;}
const desc='【萨卡兹】遗志传承\n【萨卡兹】干员每在场存活5秒或亲自击倒1名敌人，获得1层本场【遗志】；每层使攻击、防御提高{0:0.000%}，并固定提供1点法术抗性（法抗不翻倍）。被击倒时，全部遗志平均分配给其他存活的萨卡兹干员（保留小数）；复活或再部署保留自身遗志，每名干员至多持有30层遗志。\n<在场6名不同【萨卡兹】干员>部署和被击倒时，使所有存活的萨卡兹干员获得1层遗志；每次获得遗志，效果翻倍1秒，刷新持续时间但不叠加。\n满30层后再次获得遗志仍可刷新攻防翻倍；选择特雷西娅时，遗志无上限。';
bonds.sarkazShip={...structuredClone(bonds.sargonShip),bondId:'sarkazShip',name:'萨卡兹',identifier:bonds.sarkazShip?.identifier??Math.max(...Object.values(bonds).map(x=>x.identifier||0))+1,bondOrder:24,powerIdList:['sarkaz'],iconId:'icon_sarkazShip',desc,descRaw:desc,effectId:'bondeffect_sarkaz',effectName:'遗志传承',effectDesc:desc,effectDescRaw:desc,effectDescParams:[{index:0,format:'0.000%',base:'base_stat_pct',perStack:'stat_pct_per_layer'}],bb:{res_per_will:1,alive_seconds:5,base_stat_pct:.02,stat_pct_per_layer:.00015,double_seconds:1,max_will:30},bbStr:{},buffs:[],baseParams:[],perStackParams:[],spec:{source:'萨卡兹盟约干员(1).xlsx',will:'battle-only',inheritance:'equal fractional shares; same player'}};
for(const [bid,b] of Object.entries(bonds)){b.members=Object.values(chess).filter(c=>!c.isGolden&&!c.isDiy&&c.bonds.includes(bid)).map(c=>c.chessId).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));b.visibleMembers=b.members.filter(id=>chess[id].visible);}
for(const g of Object.values(gars))g.owners=Object.values(chess).filter(c=>c.garrisonIds.includes(g.garrisonId)).map(c=>c.chessId);
write('chess',chess);write('backups',backups);write('tokens',tokens);write('garrisons',gars);write('bonds',bonds);
