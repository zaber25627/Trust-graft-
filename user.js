'use strict';
/* End-user API (Telegram Mini App). Every financial decision is made here; the client is never trusted. */
module.exports=function(K){
const {store,E,L,now}=K,HR=36e5,DAY=864e5;
const ACTIVE=s=>s==='active';
async function pubCurrencies(cfg){const cur=(await K.currencies()).filter(c=>c.enabled&&c.walletEnabled!==false),methods=(await store.list('paymentMethods')).filter(m=>m.enabled).sort((a,b)=>(a.order||0)-(b.order||0));
 return cur.map(c=>{const D=L.pow(c.decimals),n=v=>(v||0)/D,mm=k=>methods.filter(m=>m.currency===c.code&&m.kind===k);
  const auto=cfg.deposit.autoEnabled?mm('crypto').map(m=>({id:m.id,name:m.name,address:m.address,memo:m.memo||'',instructions:m.instructions||''})):[],manual=cfg.deposit.manualEnabled?mm('manual').map(m=>({id:m.id,name:m.name,number:m.number||'',type:m.accountType||'',instructions:m.instructions||'',proofRequired:!!m.proofRequired})):[];
  return{code:c.code,name:c.name,symbol:c.symbol||c.code,decimals:c.decimals,enabled:true,notice:c.notice||'',
   deposit:{enabled:cfg.deposit.enabled&&c.depositEnabled!==false&&(auto.length||manual.length)>0,min:n(c.deposit&&c.deposit.min),max:n(c.deposit&&c.deposit.max),feePct:(c.deposit&&c.deposit.feePct)||0,feeFlat:n(c.deposit&&c.deposit.feeFlat),auto:auto.length?{networks:auto}:null,manual:manual.length?manual:null},
   withdraw:{enabled:cfg.withdraw.enabled&&c.withdrawEnabled!==false,min:n(c.withdraw&&c.withdraw.min),max:n(c.withdraw&&c.withdraw.max),feePct:(c.withdraw&&c.withdraw.feePct)||0,feeFlat:n(c.withdraw&&c.withdraw.feeFlat),options:mm('payout').map(m=>({id:m.id,name:m.name,pattern:m.addressPattern||'',label:m.fieldLabel||'',instructions:m.instructions||''}))}}})}
K.publicConfig=async()=>{const cfg=await K.cfg(),m=cfg.general.maintenance,t=now(),anns=(await store.list('announcements')).filter(a=>a.enabled&&(!a.startAt||a.startAt<=t)&&(!a.endAt||a.endAt>t)).sort((a,b)=>(b.priority||0)-(a.priority||0));
 return{app:Object.assign({},cfg.app,{maintenance:!!m.enabled,maintenanceMessage:m.message,maintenanceEta:m.eta,announcements:anns.map(a=>({id:a.id,title:a.title,text:a.text,image:a.image||'',page:a.page||''}))}),languages:cfg.languages,features:cfg.features,mining:{enabled:cfg.mining.enabled,notice:cfg.mining.notice,confirmClaim:cfg.mining.confirmClaim,rulesText:cfg.mining.rulesText},
  deposit:{notice:cfg.deposit.notice,instructions:cfg.deposit.instructions,requireProof:cfg.deposit.requireProof},withdraw:{notice:cfg.withdraw.notice,instructions:cfg.withdraw.instructions,eta:cfg.withdraw.eta},
  currencies:await pubCurrencies(cfg),referral:{enabled:cfg.referral.enabled,bonus:cfg.referral.bonus.enabled?{amount:cfg.referral.bonus.amount,currency:cfg.referral.bonus.currency}:null,commission:cfg.referral.commission.enabled?{type:cfg.referral.commission.type,value:cfg.referral.commission.value,currency:cfg.referral.commission.currency}:null,instructions:cfg.referral.instructions},
  leaderboard:{enabled:cfg.leaderboard.enabled,title:cfg.leaderboard.title,description:cfg.leaderboard.description,categories:cfg.leaderboard.categories},
  support:{enabled:cfg.support.enabled,categories:cfg.support.categories,hours:cfg.support.hours,instructions:cfg.support.instructions,notice:cfg.support.notice,contact:cfg.support.contact},faq:cfg.faq,legal:cfg.legal,home:cfg.home,general:{timezone:cfg.general.timezone,numberFormat:cfg.general.numberFormat}}};
const meView=u=>({id:'TM'+u.tgId,tgId:u.tgId,name:u.name,username:u.username||'',photo:u.photo||'',joinedAt:u.joinedAt,status:u.status,lang:u.lang||'en',notif:u.notif!==false,restrictions:Object.keys(u.restrictions||{}).filter(k=>K.restricted(u,k))});
async function gate(c,f,rk){const cfg=await K.cfg(),ft=cfg.features[f];if(f&&ft&&(!ft.enabled||ft.maintenance))E('feature_disabled',403,f);if(rk&&K.restricted(c.user,rk))E('restricted',403,rk);return cfg}
async function minerView(up){const t=up.terms,d=await K.dec(t.rewardCurrency),n=v=>L.toNum(v,d);let st=up.status;if(st==='active'&&up.expiresAt&&now()>=up.expiresAt)st='expired';
 return{id:up.id,plan:{id:up.planId,name:t.name,tier:t.tier,reward:n(t.reward),rewardCurrency:t.rewardCurrency,cycleHours:t.cycleMs/HR,cap:n(t.cap||0)},startedAt:up.startedAt,expiresAt:up.expiresAt||0,nextClaimAt:up.nextClaimAt,lastClaimAt:up.lastClaimAt||0,earned:n(up.earned),cycles:up.cycles,status:st}}
async function withIdem(c,fn){const key=c.idem?'u:'+c.uid+':'+c.idem:null;return store.tx(async t=>{if(key){const ex=await t.get('idem',key);if(ex)return ex.result}const r=await fn(t);if(key)t.set('idem',key,{result:r,ts:now()});return r})}
const termsOf=p=>({name:p.name,tier:p.tier,price:p.price,currency:p.currency,reward:p.reward,rewardCurrency:p.rewardCurrency,cycleMs:p.cycleHours*HR,cap:p.cap||0,durationMs:(p.durationDays||0)*DAY,version:p.version||1});
async function grantFree(c){const plans=(await store.list('plans')).filter(p=>p.tier==='free'&&p.status==='active'),mine=await store.list('userPlans',{eq:{uid:c.uid}});
 for(const p of plans){if(mine.some(x=>x.planId===p.id))continue;const ts=now(),tm=termsOf(p),upid=c.uid+'_'+p.id;try{await store.tx(async t=>{const ex=await t.get('userPlans',upid);if(ex)return;t.set('userPlans',upid,{uid:c.uid,planId:p.id,planVersion:p.version||1,terms:tm,startedAt:ts,expiresAt:tm.durationMs?ts+tm.durationMs:0,nextClaimAt:p.firstClaimImmediate?ts:ts+tm.cycleMs,lastClaimAt:0,earned:0,cycles:0,status:'active',ts})})}catch(e){}}}
async function ensureWallets(uid){} // wallets are created lazily on first ledger post
const R=[];const r=(m,p,o,h)=>R.push(Object.assign({m,p},o,{h}));
r('GET','/config',{public:true},async()=>K.publicConfig());
r('POST','/auth/telegram',{public:true},async c=>{const cfg=await K.cfg();if(cfg.general.maintenance.enabled)E('maintenance',503);
 const v=L.validateInitData(String(c.body.initData||''),K.env.BOT_TOKEN,Number(K.env.INITDATA_MAX_AGE||86400));if(!v)E('unauthorized',401);const tg=v.user,uid='tg_'+tg.id;let u=await store.get('users',uid),created=false;const name=[tg.first_name,tg.last_name].filter(Boolean).join(' ')||('User '+tg.id);
 if(u&&u.status==='suspended'&&K.restricted(u,'access')===false&&false){}
 if(!u){if(!cfg.general.registration.enabled)E('registration_closed',403);created=true;u={tgId:tg.id,username:tg.username||'',name,photo:tg.photo_url||'',joinedAt:now(),lastActive:now(),status:'active',restrictions:{},lang:tg.language_code==='bn'?'bn':'en',notif:true,refCode:K.refCode(),referredBy:'',notes:[],ts:now()};
  const sp=v.start_param||'';if(/^ref_[A-Z0-9]{4,12}$/.test(sp)&&cfg.referral.enabled){const refs=await store.list('users',{eq:{refCode:sp.slice(4)}});const ref=refs[0];if(ref&&ref.id!==uid){u.referredBy=ref.id}}
  await store.set('users',uid,u);
  if(u.referredBy){try{await store.tx(async t=>{const ex=await t.get('referrals',uid);if(!ex)t.set('referrals',uid,{referrer:u.referredBy,referred:uid,qualified:false,bonusStatus:'none',commissionStatus:'none',ts:now()})})}catch(e){}}}
 else{const patch={lastActive:now(),name,username:tg.username||'',photo:tg.photo_url||''};await store.update('users',uid,patch);Object.assign(u,patch)}
 u.id=uid;c.user=u;c.uid=uid;await grantFree(c);
 if(created){K.notify(uid,'welcome',{});if(u.referredBy){K.notify(u.referredBy,'referral_registration',{});K.hooks.referralEvent(uid,'registration')}}
 return{token:L.jwtSign({sub:uid,aud:'user'},K.env.JWT_SECRET,Number(K.env.USER_TOKEN_TTL||43200)),user:meView(u)}});
r('GET','/me',{allowSuspended:true},async c=>meView(c.user));
r('PATCH','/me',{},async c=>{const p={};if(c.body.lang==='bn'||c.body.lang==='en')p.lang=c.body.lang;if(typeof c.body.notif==='boolean')p.notif=c.body.notif;await store.update('users',c.uid,p);return meView(Object.assign(c.user,p))});
r('GET','/wallet',{gate:'wallet'},async c=>{await gate(c,'wallet');const ws=await store.list('wallets',{eq:{uid:c.uid}}),cur=(await K.currencies()).filter(x=>x.enabled&&x.walletEnabled!==false);
 return{wallets:cur.map(x=>{const w=ws.find(y=>y.currency===x.code)||{},n=v=>L.toNum(v||0,x.decimals);return{currency:x.code,available:n(w.available),locked:n(w.locked),deposited:n(w.deposited),withdrawn:n(w.withdrawn),mined:n(w.mined),referral:n(w.referral)}})}});
r('GET','/plans',{},async c=>{const cfg=await gate(c,'plans');const t=now(),mine=await store.list('userPlans',{eq:{uid:c.uid}}),age=(t-c.user.joinedAt)/DAY;
 const ps=(await store.list('plans')).filter(p=>p.status==='active'&&p.visible!==false&&(!p.availableFrom||p.availableFrom<=t)&&(!p.availableTo||p.availableTo>t)&&age>=((p.eligibility&&p.eligibility.minAccountAgeDays)||0)).sort((a,b)=>(a.order||0)-(b.order||0));
 const out=[];for(const p of ps){const dp=await K.dec(p.currency),dr=await K.dec(p.rewardCurrency),owned=mine.filter(x=>x.planId===p.id&&ACTIVE(x.status)&&(!x.expiresAt||x.expiresAt>t)).length;
  out.push({id:p.id,tier:p.tier,name:p.name,desc:p.desc,image:p.image||'',category:p.category||'',price:L.toNum(p.price,dp),fee:p.feePct||0,currency:p.currency,reward:L.toNum(p.reward,dr),rewardCurrency:p.rewardCurrency,cycleHours:p.cycleHours,durationDays:p.durationDays||0,cap:L.toNum(p.cap||0,dr),maxPerUser:p.maxPerUser||1,featured:!!p.featured,perks:p.perks||[],owned})}
 return{plans:out}});
r('POST','/plans/:id/purchase',{},async c=>{const cfg=await gate(c,'plans','purchase');const p=await store.get('plans',c.params.id),t0=now();
 if(!p||p.status!=='active'||p.visible===false||p.tier!=='paid'||p.price<=0||(p.availableFrom&&p.availableFrom>t0)||(p.availableTo&&p.availableTo<=t0))E('plan_unavailable',404);
 const mine=await store.list('userPlans',{eq:{uid:c.uid}});if(mine.filter(x=>x.planId===p.id&&ACTIVE(x.status)&&(!x.expiresAt||x.expiresAt>t0)).length>=(p.maxPerUser||1))E('limit_reached',409);
 if(mine.filter(x=>ACTIVE(x.status)&&(!x.expiresAt||x.expiresAt>t0)).length>=cfg.mining.maxActivePlans)E('limit_reached',409);
 const fee=L.pct(p.price,p.feePct||0),total=p.price+fee,upid=L.id('UP'),txid=L.id('T');
 const r=await withIdem(c,async t=>{const w=await K.readWallet(t,c.uid,p.currency);const ts=now(),tm=termsOf(p);
  const lid=K.post(t,w,{type:'plan_purchase',dAvail:-total,stat:{purchased:total},ref:upid,txId:txid,note:p.name.en});
  K.tx(t,{id:txid,uid:c.uid,type:'purchase',currency:p.currency,amount:-total,note:'Plan: '+p.name.en+(fee?' (fee incl.)':''),ref:upid,ledger:[lid]});
  const up={uid:c.uid,planId:p.id,planVersion:p.version||1,terms:tm,startedAt:ts,expiresAt:tm.durationMs?ts+tm.durationMs:0,nextClaimAt:p.firstClaimImmediate?ts:ts+tm.cycleMs,lastClaimAt:0,earned:0,cycles:0,status:'active',ts,txId:txid,paid:total};t.set('userPlans',upid,up);return Object.assign({id:upid},up)});
 K.notify(c.uid,'plan_activation',{plan:p.name.en});K.hooks.purchaseEvent(c.uid,p,total,r.id);
 return{miner:await minerView(r)}});
r('GET','/mining',{},async c=>{const cfg=await gate(c,'mining');await grantFree(c);const a=await store.list('userPlans',{eq:{uid:c.uid}});a.sort((x,y)=>y.ts-x.ts);return{miners:await Promise.all(a.map(minerView)),enabled:cfg.mining.enabled}});
r('POST','/mining/:id/claim',{},async c=>{const cfg=await gate(c,'mining','mining');if(!cfg.mining.enabled)E('feature_disabled',403,'mining');
 const txid=L.id('T'),clid=L.id('C');let planName='';
 const r=await withIdem(c,async t=>{const up=await t.get('userPlans',c.params.id);if(!up||up.uid!==c.uid)E('not_found',404);const ts=now();
  if(up.status!=='active'||(up.expiresAt&&ts>=up.expiresAt))E('miner_expired',409);if(ts<up.nextClaimAt)E('not_ready',409);
  const tm=up.terms;let rew=tm.reward;if(tm.cap>0)rew=Math.min(rew,tm.cap-up.earned);if(rew<=0)E('miner_expired',409);
  const w=await K.readWallet(t,c.uid,tm.rewardCurrency);planName=tm.name.en;
  const lid=K.post(t,w,{type:'mining_reward',dAvail:rew,stat:{mined:rew},ref:clid,txId:txid,note:tm.name.en});
  K.tx(t,{id:txid,uid:c.uid,type:'mining',currency:tm.rewardCurrency,amount:rew,note:tm.name.en,ref:clid,ledger:[lid]});
  t.set('miningClaims',clid,{uid:c.uid,userPlanId:up.id,planId:up.planId,amount:rew,currency:tm.rewardCurrency,cycleStart:up.lastClaimAt||up.startedAt,claimedAt:ts,status:'success',txId:txid,ts});
  const earned=up.earned+rew,done=tm.cap>0&&earned>=tm.cap;t.update('userPlans',up.id,{earned,cycles:up.cycles+1,lastClaimAt:ts,nextClaimAt:ts+tm.cycleMs,status:done?'completed':'active'});
  return{reward:rew,currency:tm.rewardCurrency,upId:up.id}});
 K.notify(c.uid,'claim_done',{amount:L.toNum(r.reward,await K.dec(r.currency)),currency:r.currency,plan:planName});
 const up=await store.get('userPlans',r.upId);return{reward:L.toNum(r.reward,await K.dec(r.currency)),currency:r.currency,miner:await minerView(up)}});
const proofExt={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
r('GET','/deposits',{},async c=>{await gate(c,'deposit');const a=await store.list('deposits',{eq:{uid:c.uid}});return{items:await Promise.all(a.map(async d=>({id:d.id,currency:d.currency,mode:d.mode,network:d.methodName||d.methodId,amount:await K.num(d.amount,d.currency),txid:d.txid,status:d.status,ts:d.ts,message:d.userMessage||''})))}});
r('POST','/deposits',{},async c=>{const cfg=await gate(c,'deposit','deposit'),b=c.body;if(!cfg.deposit.enabled)E('feature_disabled',403,'deposit');
 const cur=await K.currency(b.currency);if(!cur||!cur.enabled||cur.depositEnabled===false)E('currency_disabled',400);const mode=b.mode==='manual'?'manual':'auto';if(mode==='manual'?!cfg.deposit.manualEnabled:!cfg.deposit.autoEnabled)E('feature_disabled',403,'deposit');
 const m=await store.get('paymentMethods',String(b.network||''));if(!m||!m.enabled||m.currency!==cur.code||m.kind!==(mode==='manual'?'manual':'crypto'))E('validation',400);
 const amt=L.parseAmount(b.amount,cur.decimals);if(!amt)E('invalid_amount',400);const lim=cur.deposit||{};if(lim.min&&amt<lim.min)E('below_min',400);if(lim.max&&amt>lim.max)E('above_max',400);
 const tx=String(b.txid||'').trim();if(!/^[A-Za-z0-9_-]{6,128}$/.test(tx))E('invalid_txid',400);
 const need=cfg.deposit.requireProof||m.proofRequired;let proofPath='';
 if(b.proof){const mm=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.proof));if(!mm)E('invalid_proof',400);const buf=Buffer.from(mm[2],'base64');if(buf.length>1.6e6)E('invalid_proof',400);proofPath='proofs/'+c.uid+'/'+L.id('p')+'.'+proofExt[mm[1]];try{await store.putFile(proofPath,buf,mm[1])}catch(e){E('storage_unavailable',503)}}
 else if(need)E('proof_required',400);
 const fee=(lim.feeFlat||0)+L.pct(amt,lim.feePct||0),did=L.id('D'),txid=L.id('T');
 await withIdem(c,async t=>{const dk=cur.code+'_'+tx.toLowerCase();if(await t.get('depositKeys',dk))E('duplicate_txid',409);t.set('depositKeys',dk,{deposit:did,ts:now()});
  t.set('deposits',did,{uid:c.uid,currency:cur.code,mode,methodId:m.id,methodName:m.name,amount:amt,fee,txid:tx,proof:proofPath,status:'pending',ts:now(),txId:txid,history:[{status:'pending',ts:now(),by:'user'}],notes:[],userMessage:''});
  K.tx(t,{id:txid,uid:c.uid,type:'deposit',currency:cur.code,amount:amt,status:'pending',note:'Deposit via '+m.name,ref:did});return{id:did}});
 K.notify(c.uid,'deposit_submitted',{amount:L.toNum(amt,cur.decimals),currency:cur.code});return{deposit:{id:did,status:'pending'}}});
r('GET','/withdrawals',{},async c=>{await gate(c,'withdraw');const a=await store.list('withdrawals',{eq:{uid:c.uid}});return{items:await Promise.all(a.map(async w=>({id:w.id,currency:w.currency,network:w.methodName||w.methodId,address:w.address,amount:await K.num(w.amount,w.currency),fee:await K.num(w.fee,w.currency),net:await K.num(w.net,w.currency),status:w.status,ts:w.ts,reason:w.userMessage||''})))}});
r('POST','/withdrawals',{},async c=>{const cfg=await gate(c,'withdraw','withdraw'),b=c.body,el=cfg.withdraw.eligibility||{};if(!cfg.withdraw.enabled)E('feature_disabled',403,'withdraw');
 if(el.minAccountAgeHours&&now()-c.user.joinedAt<el.minAccountAgeHours*HR)E('not_eligible',403);
 if(el.requirePaidPlan&&!(await store.list('userPlans',{eq:{uid:c.uid}})).some(x=>x.terms&&x.terms.tier==='paid'))E('not_eligible',403);
 const cur=await K.currency(b.currency);if(!cur||!cur.enabled||cur.withdrawEnabled===false)E('currency_disabled',400);
 const m=await store.get('paymentMethods',String(b.network||''));if(!m||!m.enabled||m.kind!=='payout'||m.currency!==cur.code)E('validation',400);
 const addr=String(b.address||'').trim();if(!addr||addr.length>200)E('invalid_address',400);if(m.addressPattern){let ok=false;try{ok=new RegExp(m.addressPattern).test(addr)}catch(e){ok=true}if(!ok)E('invalid_address',400)}
 const amt=L.parseAmount(b.amount,cur.decimals);if(!amt)E('invalid_amount',400);const lim=cur.withdraw||{};if(lim.min&&amt<lim.min)E('below_min',400);if(lim.max&&amt>lim.max)E('above_max',400);
 const fee=(lim.feeFlat||0)+L.pct(amt,lim.feePct||0),net=amt-fee;if(net<=0)E('below_min',400);const wid=L.id('W'),txid=L.id('T');
 await withIdem(c,async t=>{const w=await K.readWallet(t,c.uid,cur.code);const lid=K.post(t,w,{type:'withdraw_reserve',dAvail:-amt,dLocked:amt,ref:wid,txId:txid,note:'Withdrawal request'});
  t.set('withdrawals',wid,{uid:c.uid,currency:cur.code,methodId:m.id,methodName:m.name,address:addr,amount:amt,fee,net,status:'pending',ts:now(),txId:txid,history:[{status:'pending',ts:now(),by:'user'}],notes:[],userMessage:'',ledger:[lid]});
  K.tx(t,{id:txid,uid:c.uid,type:'withdraw',currency:cur.code,amount:-amt,status:'pending',note:'Withdrawal to '+m.name,ref:wid,ledger:[lid]});return{id:wid}});
 K.notify(c.uid,'withdraw_submitted',{amount:L.toNum(amt,cur.decimals),currency:cur.code});return{withdrawal:{id:wid,status:'pending'}}});
r('GET','/history',{gate:'history'},async c=>{await gate(c,'history');const q=c.query;let a=await store.list('transactions',{eq:{uid:c.uid}});
 if(q.type&&q.type!=='all')a=a.filter(x=>x.type===q.type);if(q.currency&&q.currency!=='all')a=a.filter(x=>x.currency===q.currency);if(q.status&&q.status!=='all')a=a.filter(x=>x.status===q.status);
 const o=Math.max(0,+q.offset||0),l=Math.min(50,+q.limit||20);return{items:await Promise.all(a.slice(o,o+l).map(async x=>({id:x.id,type:x.type,currency:x.currency,amount:await K.num(x.amount,x.currency),status:x.status,ts:x.ts,note:x.note||''}))),total:a.length}});
r('GET','/referral',{},async c=>{const cfg=await gate(c,'referral');if(!cfg.referral.enabled)return{enabled:false};const refs=await store.list('referrals',{eq:{referrer:c.uid}}),ws=await store.list('wallets',{eq:{uid:c.uid}}),us=await Promise.all(refs.map(x=>store.get('users',x.referred)));
 const bn=cfg.referral.bonus,cm=cfg.referral.commission;return{enabled:true,code:c.user.refCode,commission:cm.enabled?{type:cm.type,value:cm.value,currency:cm.currency}:null,bonus:bn.enabled?{amount:bn.amount,currency:bn.currency}:null,instructions:cfg.referral.instructions,count:refs.length,
  earnings:await Promise.all(ws.filter(w=>w.referral>0).map(async w=>({currency:w.currency,amount:await K.num(w.referral,w.currency)}))),
  referrals:refs.map((x,i)=>({name:us[i]?(us[i].name||'').slice(0,1)+'***':'—',joinedAt:x.ts,status:x.qualified?'active':'pending'}))}});
r('GET','/leaderboard',{},async c=>{const cfg=await gate(c,'leaderboard');if(!cfg.leaderboard.enabled)E('feature_disabled',403,'leaderboard');return K.leaderboard(c.uid,c.query.category||cfg.leaderboard.categories[0])});
r('GET','/notifications',{},async c=>{await gate(c,'notifications');const a=await store.list('notifications',{eq:{uid:c.uid}});return{items:a.slice(0,100).map(n=>({id:n.id,title:n.title,text:n.text,ts:n.ts,read:!!n.read,category:n.category,emoji:n.emoji,page:n.page})),unread:a.filter(n=>!n.read).length}});
r('POST','/notifications/read',{},async c=>{const a=await store.list('notifications',{eq:{uid:c.uid}});const ids=Array.isArray(c.body.ids)?c.body.ids:[];let unread=0;for(const n of a){if(!n.read&&(c.body.all||ids.includes(n.id)))await store.update('notifications',n.id,{read:true});else if(!n.read)unread++}return{unread}});
r('GET','/support/tickets',{},async c=>{await gate(c,'support');const a=await store.list('tickets',{eq:{uid:c.uid}});return{items:a.map(t=>({id:t.id,subject:t.subject,category:t.category,status:t.status,updatedAt:t.updatedAt}))}});
r('POST','/support/tickets',{},async c=>{const cfg=await gate(c,'support');if(!cfg.support.enabled)E('feature_disabled',403,'support');const b=c.body,subj=String(b.subject||'').trim().slice(0,120),msg=String(b.message||'').trim().slice(0,2000);
 if(subj.length<3||msg.length<5||!cfg.support.categories.includes(b.category))E('validation',400);const open=(await store.list('tickets',{eq:{uid:c.uid}})).filter(x=>x.status!=='closed'&&x.status!=='resolved').length;if(open>=10)E('rate_limited',429);
 const tid=L.id('S'),ts=now();await withIdem(c,async t=>{t.set('tickets',tid,{uid:c.uid,subject:subj,category:b.category,status:'open',priority:'normal',messages:[{from:'user',text:msg,ts}],notes:[],history:[{status:'open',ts,by:'user'}],ts,updatedAt:ts,lastReply:ts});return{id:tid}});return{ticket:{id:tid}}});
const tView=t=>({id:t.id,subject:t.subject,category:t.category,status:t.status,updatedAt:t.updatedAt,messages:t.messages.map(m=>({from:m.from==='user'?'me':'support',text:m.text,ts:m.ts}))});
r('GET','/support/tickets/:id',{},async c=>{await gate(c,'support');const t=await store.get('tickets',c.params.id);if(!t||t.uid!==c.uid)E('not_found',404);return{ticket:tView(t)}});
r('POST','/support/tickets/:id/messages',{},async c=>{await gate(c,'support');const t=await store.get('tickets',c.params.id);if(!t||t.uid!==c.uid)E('not_found',404);if(t.status==='closed')E('validation',409);const msg=String(c.body.message||'').trim().slice(0,2000);if(!msg)E('validation',400);if(t.messages.length>200)E('rate_limited',429);
 t.messages.push({from:'user',text:msg,ts:now()});const st=t.status==='resolved'||t.status==='waiting'?'open':t.status;await store.update('tickets',t.id,{messages:t.messages,updatedAt:now(),lastReply:now(),status:st});t.status=st;return{ticket:tView(t)}});
/* ---------- leaderboard (computed from trusted records, cached) ---------- */
const lbCache={};
K.leaderboard=async(uid,cat)=>{const cfg=await K.cfg(),lb=cfg.leaderboard;if(!lb.categories.includes(cat))cat=lb.categories[0];const key=cat,t=now();let e=lbCache[key];
 if(!e||t-e.at>lb.updateMinutes*60000){const agg={};let label='cycles',cur='';
  if(cat==='miners'){for(const x of await store.list('miningClaims',{limit:20000}))agg[x.uid]=(agg[x.uid]||0)+1}
  else if(cat==='referrers'){label='referrals';for(const x of await store.list('referrals',{limit:20000}))if(x.qualified)agg[x.referrer]=(agg[x.referrer]||0)+1}
  else{label='rewards';cur=lb.rewardsCurrency||((await K.currencies())[0]||{}).code||'';const d=await K.dec(cur);for(const x of await store.list('miningClaims',{limit:20000}))if(x.currency===cur)agg[x.uid]=(agg[x.uid]||0)+x.amount/L.pow(d)}
  const rows=Object.keys(agg).map(k=>({uid:k,value:agg[k]})).sort((a,b)=>b.value-a.value);e=lbCache[key]={at:t,rows,label,cur}}
 const lim=lb.limit||20,top=e.rows.slice(0,lim),mask=(u)=>{if(lb.displayName==='anonymous')return 'Miner #'+u.tgId.toString().slice(-4);if(lb.displayName==='username'&&u.username)return '@'+u.username;const n=(u.name||'Miner');return lb.displayName==='masked'?n.slice(0,2)+'***':n};
 const rows=[];for(let i=0;i<top.length;i++){const u=await store.get('users',top[i].uid);rows.push({rank:i+1,name:u?mask(u):'—',value:Math.round(top[i].value*1e8)/1e8,me:top[i].uid===uid})}
 const idx=e.rows.findIndex(x=>x.uid===uid);const me={rank:idx>=0?idx+1:null,value:idx>=0?Math.round(e.rows[idx].value*1e8)/1e8:0};
 return{rows,me,category:cat,categories:lb.categories,label:e.label,currency:e.cur,title:lb.title,description:lb.description,updatedAt:e.at}};
K.userRoutes=R;K.meView=meView;K.grantFree=grantFree;K.minerView=minerView;
return R};
