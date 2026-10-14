import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyBuffSettings, isEnemyBuffSettings, sameEnemyBuffSettings, VOTE_ROUNDS } from '../shared/enemyBuffs.js';
import { Match } from '../server/match/Match.js';
import { getData } from '../server/data.js';
import { selectedSkin, setSkin, syncSkinDeployment, skinStore } from '../public/js/skins.js';
const data = getData();
function match(settings) { return new Match({ seats:[{playerId:'p',name:'P',seat:0}],mode:'solo',difficulty:'normal',data,enemyBuffs:settings,send:()=>true,broadcast:()=>{},onEnd:()=>{} }); }
test('legacy settings retain original schedule; empty schedule is distinct and sorting is semantic',()=>{
 const s=enemyBuffSettings({});assert.equal(s.playerRounds.length,13);assert.deepEqual(s.enemyRounds,VOTE_ROUNDS);
 assert(Object.isFrozen(s.playerRounds));assert(sameEnemyBuffSettings({playerRounds:[3,1]},{playerRounds:[1,3]}));
 assert(!sameEnemyBuffSettings({},{playerRounds:[]}));
 for(const v of [[0],[16],[1,1],['1'],null])assert(!isEnemyBuffSettings({playerRounds:v}));
 assert(isEnemyBuffSettings({playerRounds:[],enemyRounds:[15]}));
});
test('all independent schedule combinations, custom odd rounds and enemy master off route correctly',()=>{
 for(const player of [false,true])for(const enemy of [false,true]){
  const m=match({playerRounds:player?[3]:[],enemyRounds:enemy?[3]:[]});
  try {assert.equal(m.augmentRound(3),player||enemy);assert.equal(m.enemyVoteRound(3),enemy);assert.equal(m.augmentRound(4),false);
   m.round=3;m.afterAugment=()=>{m.skipped=true;};m.enterAugment();
   if(player||enemy){assert.equal(m.aug.tier>0,player);assert.equal(!!m.aug.vote,enemy);assert.equal(Object.keys(m.aug.offers).length>0,player);}else assert(m.skipped);
  } finally {m.dispose();}
 }
 const m=match({on:false,playerRounds:[1],enemyRounds:[1]});try{assert(m.augmentRound(1));assert(!m.enemyVoteRound(1));}finally{m.dispose();}
});
test('optional final rounds offer picks and boss upgrades without affecting defaults',()=>{
 const m=match({playerRounds:[14,15],enemyRounds:[14,15]});try{for(const r of [14,15]){m.round=r;assert(m.augmentRound());m.enterAugment();assert.equal(m.aug.tier,3);assert(m.aug.offers.p.length);assert(m.aug.vote);}}finally{m.dispose();}
});
test('latest outfit fallback, explicit original selection and deployment preference migration',()=>{
 const previousStorage=globalThis.localStorage;const prefs=new Map();globalThis.localStorage={getItem:k=>prefs.get(k)??null,setItem:(k,v)=>prefs.set(k,v)};
 const outfit=(name)=>({name,avatar:'a',portrait:'p',spine:{front:{skel:'s'}}});const manifest={chars:{foo:{skins:{old:outfit('old'),latest:outfit('latest')}}}};
 skinStore.set({choices:{}});assert.equal(selectedSkin(manifest,'foo').id,'latest');
 assert(setSkin(manifest,'foo',''));assert.equal(selectedSkin(manifest,'foo'),null);
 assert(setSkin(manifest,'foo','old'));assert.equal(selectedSkin(manifest,'foo').id,'old');
 assert(syncSkinDeployment('test-build'));assert.equal(selectedSkin(manifest,'foo').id,'latest');
 setSkin(manifest,'foo','old');assert.equal(syncSkinDeployment('test-build'),false);assert.equal(selectedSkin(manifest,'foo').id,'old');
 assert(syncSkinDeployment('next-build'));assert.equal(selectedSkin(manifest,'foo').id,'latest');globalThis.localStorage=previousStorage;
});
test('Valarqvin descriptions have no unresolved numeric placeholders at each available form',()=>{
 const visit=(x)=>{if(!x||typeof x!=='object')return;if(x.skillId?.startsWith('skchr_threye_')){assert(!/\{[^}]+\}/.test(x.desc));assert(!/\{[^}]+\}/.test(x.descRaw));}for(const v of Object.values(x))visit(v);};visit(data.chess);visit(data.backups);
});

import { EnemyBuffEditor } from '../public/js/ui/enemyBuffSettings.js';
test('editor exposes independent controls for all 15 rounds and preserves settings on changes',()=>{
 let next;const root=EnemyBuffEditor({value:{on:false,playerRounds:[],enemyRounds:[3],weights:[1,2,3]},onChange:v=>{next=v;}});
 const inputs=[];function visit(node){if(Array.isArray(node)){node.forEach(visit);return;}if(!node||typeof node!=='object')return;if(node.type==='input'&&node.props.type==='checkbox')inputs.push(node);visit(node.props?.children);}visit(root);
 assert.equal(inputs.length,30);assert.equal(inputs[0].props.disabled,false);assert.equal(inputs[1].props.disabled,true);
 inputs[0].props.onChange({currentTarget:{checked:true}});assert.deepEqual(next.playerRounds,[1]);assert.deepEqual(next.enemyRounds,[3]);assert.deepEqual(next.weights,[1,0,1,1,2,1]);assert.equal(next.on,false);
});
