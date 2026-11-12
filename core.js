'use strict';
/* Shared kernel: config, currencies, ledger posting, notifications, audit. Pure logic over a `store` (see lib.js). */
const L=require('./lib');
const T2=(en,bn)=>({en,bn});
const feat=(title,order,extra)=>Object.assign({enabled:true,visible:true,nav:false,maintenance:false,title:T2(title,title),description:T2('',''),notice:T2('',''),icon:'',order},extra||{});
const DEFAULT_CFG={
 app:{name:'Trusted Mining',tagline:T2('',''),description:T2('',''),logo:'',botUsername:'',supportUrl:'',channelUrl:'',brandText:T2('',''),banner:'',theme:{accent:'#FF7A1A'}},
 general:{maintenance:{enabled:false,message:T2('',''),eta:''},timezone:'Asia/Dhaka',dateFormat:'DD MMM YYYY',numberFormat:'en-US',registration:{enabled:true},notices:[]},
 languages:{default:'en',enabled:['en','bn'],overrides:{en:{},bn:{}}},
 features:{home:feat('Home',1,{nav:true}),mining:feat('Mining',2,{nav:true}),plans:feat('Plans',3,{nav:true}),wallet:feat('Wallet',4,{nav:true}),deposit:feat('Deposit',5),withdraw:feat('Withdraw',6),referral:feat('Referral',7),history:feat('History',8),leaderboard:feat('Leaderboard',9),notifications:feat('Notifications',10),profile:feat('Profile',11,{nav:true}),support:feat('Support',12)},
 mining:{enabled:true,defaultCycleHours:24,maxActivePlans:50,confirmClaim:false,notice:T2('',''),rulesText:T2('','')},
 deposit:{enabled:true,manualEnabled:true,autoEnabled:true,requireProof:false,notice:T2('',''),instructions:T2('','')},
 withdraw:{enabled:true,notice:T2('',''),instructions:T2('',''),eta:T2('',''),eligibility:{minAccountAgeHours:0,requirePaidPlan:false}},
 referral:{enabled:true,mode:'single',codePrefix:'TM',bonus:{enabled:false,amount:0,currency:'',qualifying:'first_purchase'},commission:{enabled:false,type:'percent',value:0,currency:'',maxPerReward:0,totalCap:0},instructions:T2('','')},
 leaderboard:{enabled:true,title:T2('Leaderboard','লিডারবোর্ড'),description:T2('',''),categories:['miners','referrers','rewards'],metric:'cycles',limit:20,updateMinutes:5,displayName:'name',rewardsCurrency:''},
 support:{enabled:true,categories:['deposit','withdraw','mining','account','other'],instructions:T2('',''),notice:T2('',''),attachments:false,hours:'24/7',contact:{email:'',telegram:''}},
 faq:[],legal:{terms:{title:T2('Terms and Conditions','শর্তাবলি'),body:T2('','')},privacy:{title:T2('Privacy Policy','গোপনীয়তা নীতি'),body:T2('','')},risk:{title:T2('Risk Disclosure','ঝুঁকি প্রকাশ'),body:T2('','')},about:{title:T2('About','সম্পর্কে'),body:T2('','')}},
 home:{welcome:T2('',''),banners:[],sections:{balance:true,mining:true,quick:true,recent:true,announcements:true},quickActions:['plans','referral','leaderboard','history','support','wallet']}
};
const TEMPLATES={
 welcome:['account','Welcome!','স্বাগতম!','Welcome to Trusted Mining.','ট্রাস্টেড মাইনিং-এ স্বাগতম।'],
 account_update:['account','Account update','অ্যাকাউন্ট আপডেট','{message}','{message}'],
 plan_activation:['mining','Plan activated','প্ল্যান সক্রিয়','{plan} is now active.','{plan} এখন সক্রিয়।'],
 claim_available:['mining','Reward ready','রিওয়ার্ড প্রস্তুত','Your {plan} reward is ready to claim.','আপনার {plan}-এর রিওয়ার্ড ক্লেইমের জন্য প্রস্তুত।'],
 claim_done:['mining','Reward claimed','রিওয়ার্ড ক্লেইম হয়েছে','You claimed {amount} {currency}.','আপনি {amount} {currency} ক্লেইম করেছেন।'],
 deposit_submitted:['finance','Deposit submitted','ডিপোজিট জমা হয়েছে','Your deposit of {amount} {currency} is pending review.','আপনার {amount} {currency} ডিপোজিট রিভিউয়ের অপেক্ষায়।'],
 deposit_approved:['finance','Deposit approved','ডিপোজিট অনুমোদিত','{amount} {currency} was added to your wallet.','{amount} {currency} ওয়ালেটে যোগ হয়েছে।'],
 deposit_rejected:['finance','Deposit rejected','ডিপোজিট বাতিল','Your deposit was rejected. {reason}','আপনার ডিপোজিট বাতিল হয়েছে। {reason}'],
 withdraw_submitted:['finance','Withdrawal submitted','উইথড্র জমা হয়েছে','Your withdrawal of {amount} {currency} is pending review.','আপনার {amount} {currency} উইথড্র রিভিউয়ের অপেক্ষায়।'],
 withdraw_approved:['finance','Withdrawal approved','উইথড্র অনুমোদিত','Your withdrawal was approved.','আপনার উইথড্র অনুমোদিত হয়েছে।'],
 withdraw_processing:['finance','Withdrawal processing','উইথড্র প্রক্রিয়াধীন','Your withdrawal is being processed.','আপনার উইথড্র প্রক্রিয়াধীন।'],
 withdraw_completed:['finance','Withdrawal completed','উইথড্র সম্পন্ন','{amount} {currency} was sent.','{amount} {currency} পাঠানো হয়েছে।'],
 withdraw_rejected:['finance','Withdrawal rejected','উইথড্র বাতিল','Your withdrawal was rejected and the amount returned. {reason}','আপনার উইথড্র বাতিল হয়েছে ও অর্থ ফেরত এসেছে। {reason}'],
 referral_registration:['referral','New referral','নতুন রেফারেল','Someone joined with your link.','কেউ আপনার লিংক দিয়ে যোগ দিয়েছে।'],
 referral_bonus:['referral','Referral bonus','রেফারেল বোনাস','You received {amount} {currency}.','আপনি {amount} {currency} পেয়েছেন।'],
 referral_commission:['referral','Referral commission','রেফারেল কমিশন','You earned {amount} {currency} commission.','আপনি {amount} {currency} কমিশন পেয়েছেন।'],
 security_alert:['security','Security alert','নিরাপত্তা সতর্কতা','{message}','{message}'],
 announcement:['announcement','Announcement','ঘোষণা','{message}','{message}'],
 maintenance:['announcement','Maintenance notice','রক্ষণাবেক্ষণ নোটিশ','{message}','{message}']
};
const defaultTemplate=k=>{const d=TEMPLATES[k];return d?{key:k,category:d[0],title:T2(d[1],d[2]),text:T2(d[3],d[4]),emoji:'',page:'',enabled:true,language:'both',trigger:k,isDefault:true}:null};
const VARS=['name','amount','currency','plan','reason','id','message'];

module.exports=function makeKernel(store,env){
 const now=()=>Date.now();
 const E=(code,status,msg)=>{const e=new Error(msg||code);e.code=code;e.status=status||400;throw e};
 let cfgC=null,cfgAt=0,curC=null,curAt=0;
 const K={store,env,now,E,L,DEFAULT_CFG,TEMPLATES,defaultTemplate,VARS};
 K.cfg=async force=>{if(!force&&cfgC&&now()-cfgAt<4000)return cfgC;const d=await store.get('config','app')||{};delete d.id;cfgC=L.merge(DEFAULT_CFG,d);cfgAt=now();return cfgC};
 K.saveCfg=async(section,val)=>{const d=await store.get('config','app')||{};delete d.id;d[section]=val;await store.set('config','app',d);cfgC=null};
 K.currencies=async force=>{if(!force&&curC&&now()-curAt<4000)return curC;const a=await store.list('currencies');a.sort((x,y)=>(x.order||0)-(y.order||0));curC=a;curAt=now();return a};
 K.currency=async code=>(await K.currencies()).find(c=>c.code===code)||null;
 K.bust=()=>{cfgC=null;curC=null};
 K.dec=async code=>{const c=await K.currency(code);return c?c.decimals:2};
 K.num=async(m,code)=>L.toNum(m,await K.dec(code));
 /* ---------- ledger ---------- */
 K.wid=(uid,c)=>uid+'_'+c;
 K.readWallet=async(t,uid,c)=>(await t.get('wallets',K.wid(uid,c)))||{uid,currency:c,available:0,locked:0,deposited:0,withdrawn:0,mined:0,referral:0,purchased:0,credits:0,debits:0,ts:now()};
 /* post(): apply an immutable ledger entry + update the wallet document (must run inside store.tx, wallet read first) */
 K.post=(t,w,e)=>{const before=w.available;w.available+=e.dAvail||0;w.locked+=e.dLocked||0;
  if(w.available<0||w.locked<0||!Number.isSafeInteger(w.available)||!Number.isSafeInteger(w.locked))E('insufficient_funds',402);
  for(const k of Object.keys(e.stat||{}))w[k]=(w[k]||0)+e.stat[k];
  const credit=Math.max(0,e.dAvail||0),debit=Math.max(0,-(e.dAvail||0));w.credits+=credit;w.debits+=debit;w.id=undefined;delete w.id;
  const lid=L.id('L');t.set('wallets',K.wid(w.uid,w.currency),w);
  t.set('ledger',lid,{uid:w.uid,currency:w.currency,type:e.type,debit,credit,lockedDelta:e.dLocked||0,balanceBefore:before,balanceAfter:w.available,lockedAfter:w.locked,ref:e.ref||'',txId:e.txId||'',note:e.note||'',adminId:e.adminId||'',ts:now()});return lid};
 K.tx=(t,o)=>{const x=Object.assign({ts:now(),status:'completed',note:'',ref:''},o);t.set('transactions',o.id,x);return x};
 /* ---------- notifications ---------- */
 K.template=async key=>{const d=await store.get('notificationTemplates',key);return d||defaultTemplate(key)};
 const fill=(s,v)=>String(s||'').replace(/\{(\w+)\}/g,(m,n)=>VARS.includes(n)&&v&&v[n]!=null?String(v[n]):'');
 K.render=(tpl,v)=>({title:{en:fill(tpl.title.en,v),bn:fill(tpl.title.bn||tpl.title.en,v)},text:{en:fill(tpl.text.en,v),bn:fill(tpl.text.bn||tpl.text.en,v)}});
 K.tgSend=async(tgId,text)=>{if(!env.BOT_TOKEN||env.TELEGRAM_SEND==='0')return 'skipped';try{const r=await fetch('https://api.telegram.org/bot'+env.BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:tgId,text:text.slice(0,4000)})});return r.ok?'sent':'failed'}catch(e){return 'failed'}};
 K.notify=async(uid,key,vars,opt)=>{try{opt=opt||{};const tpl=opt.custom||await K.template(key);if(!tpl||tpl.enabled===false)return null;const u=await store.get('users',uid);if(!u)return null;
  const r=K.render(tpl,Object.assign({name:u.name},vars));const nid=L.id('N');
  const doc={uid,category:tpl.category||'account',title:r.title,text:r.text,emoji:tpl.emoji||'',page:tpl.page||'',event:key||'custom',read:false,ts:now(),delivery:'in-app',batch:opt.batch||''};
  if(u.notif!==false){const lang=u.lang==='bn'?'bn':'en';doc.delivery=await K.tgSend(u.tgId,(tpl.emoji?tpl.emoji+' ':'')+r.title[lang]+'\n'+r.text[lang])}
  await store.set('notifications',nid,doc);return nid}catch(e){console.error('notify failed',e.message);return null}};
 /* ---------- audit ---------- */
 K.audit=async(c,a)=>{const eid=L.id('A');await store.set('auditLogs',eid,{admin:(c&&c.admin&&c.admin.email)||a.admin||'system',action:a.action,target:a.target||'',prev:a.prev===undefined?null:a.prev,next:a.next===undefined?null:a.next,reason:a.reason||'',ts:now(),reqId:(c&&c.reqId)||'',ip:(c&&c.ip)||''});return eid};
 K.refCode=()=>{const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const b=require('crypto').randomBytes(6);for(let i=0;i<6;i++)s+=A[b[i]%A.length];return s};
 K.restricted=(u,k)=>{const r=u.restrictions&&u.restrictions[k];return !!(r&&(!r.expiresAt||r.expiresAt>now()))};
 K.slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40);
 return K};
