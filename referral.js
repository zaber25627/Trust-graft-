'use strict';
/* Single-level referral rewards. Reward ids are deterministic and checked inside the transaction => no duplicate credits. */
module.exports=function(K){
const {store,L,now}=K;
async function pay(o){/* o:{rid,referrer,referred,type,currency,amount,note,event} */
 if(!(o.amount>0))return null;
 return store.tx(async t=>{const ex=await t.get('referralRewards',o.rid);if(ex)return null;const w=await K.readWallet(t,o.referrer,o.currency);
  let amt=o.amount;if(o.totalCap>0)amt=Math.min(amt,o.totalCap-(w.referral||0));if(amt<=0)return null;const txid=L.id('T');
  const lid=K.post(t,w,{type:o.type==='bonus'?'referral_bonus':'referral_commission',dAvail:amt,stat:{referral:amt},ref:o.rid,txId:txid,note:o.note});
  K.tx(t,{id:txid,uid:o.referrer,type:'referral',currency:o.currency,amount:amt,note:o.note,ref:o.rid,ledger:[lid]});
  t.set('referralRewards',o.rid,{referrer:o.referrer,referred:o.referred,type:o.type,currency:o.currency,amount:amt,related:o.related||'',txId:txid,status:'paid',ts:now()});return{amt,txid}})}
async function qualify(ref,event,cfg){
 if(ref.qualified&&ref.bonusStatus==='paid')return;const bn=cfg.referral.bonus;
 if((bn.qualifying||'first_purchase')===event&&!ref.qualified){await store.update('referrals',ref.referred,{qualified:true,qualifiedAt:now(),qualifiedBy:event})}
 if(bn.enabled&&bn.qualifying===event&&ref.bonusStatus!=='paid'&&bn.currency){const cur=await K.currency(bn.currency);if(cur){const amt=L.parseAmount(String(bn.amount),cur.decimals);
  const r=await pay({rid:'bonus_'+ref.referred,referrer:ref.referrer,referred:ref.referred,type:'bonus',currency:cur.code,amount:amt,note:'Referral bonus',event});
  if(r){await store.update('referrals',ref.referred,{bonusStatus:'paid'});K.notify(ref.referrer,'referral_bonus',{amount:L.toNum(r.amt,cur.decimals),currency:cur.code})}}}}
K.hooks={
 async referralEvent(uid,event){try{const cfg=await K.cfg();if(!cfg.referral.enabled)return;const ref=await store.get('referrals',uid);if(!ref||ref.referrer===uid)return;await qualify(ref,event,cfg)}catch(e){console.error('referral hook',e.message)}},
 async purchaseEvent(uid,plan,total,upid){try{const cfg=await K.cfg();if(!cfg.referral.enabled)return;const ref=await store.get('referrals',uid);if(!ref||ref.referrer===uid)return;
  const ru=await store.get('users',ref.referrer);if(!ru||ru.status!=='active'||K.restricted(ru,'referral'))return;await qualify(ref,'first_purchase',cfg);
  const cm=cfg.referral.commission;if(!cm.enabled)return;let cur,amt;
  if(cm.type==='percent'){cur=await K.currency(plan.currency);amt=cur?L.pct(plan.price,Number(cm.value)||0):0}
  else{cur=await K.currency(cm.currency);amt=cur?L.parseAmount(String(cm.value),cur.decimals):0}
  if(!cur||!(amt>0))return;const cap=cm.maxPerReward?L.parseAmount(String(cm.maxPerReward),cur.decimals):0;if(cap&&amt>cap)amt=cap;const tc=cm.totalCap?L.parseAmount(String(cm.totalCap),cur.decimals):0;
  const r=await pay({rid:'commission_'+upid,referrer:ref.referrer,referred:uid,type:'commission',currency:cur.code,amount:amt,totalCap:tc,note:'Referral commission',related:upid,event:'purchase'});
  if(r)K.notify(ref.referrer,'referral_commission',{amount:L.toNum(r.amt,cur.decimals),currency:cur.code})}catch(e){console.error('purchase hook',e.message)}},
 async depositEvent(uid){return K.hooks.referralEvent(uid,'first_deposit')}
};
};
