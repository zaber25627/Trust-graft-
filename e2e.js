const crypto=require('crypto'),assert=require('assert');
const L=require('../src/lib');
const BOT='123456:TEST_BOT_TOKEN_FOR_TESTS_ONLY';
const env={STORE:'memory',JWT_SECRET:'x'.repeat(40),BOT_TOKEN:BOT,ADMIN_EMAIL:'admin@example.com',ADMIN_PASSWORD_HASH:L.hashPassword('correct-horse-battery'),TELEGRAM_SEND:'0',SCHEDULER:'0',CORS_ORIGINS:'*',RATE_LOGIN:'50'};
const {build}=require('../src/server');const app=build(env);
function initData(user,start){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user),query_id:'AAA'});if(start)p.set('start_param',start);const data=[...p.entries()].map(([k,v])=>k+'='+v).sort().join('\n');const sec=crypto.createHmac('sha256','WebAppData').update(BOT).digest();p.set('hash',crypto.createHmac('sha256',sec).update(data).digest('hex'));return p.toString()}
let base;const call=async(m,p,body,tok,idem)=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json();return{st:r.status,...j}};
const ok=async(...a)=>{const r=await call(...a);if(!r.ok)throw new Error(a[0]+' '+a[1]+' -> '+r.st+' '+r.code+' '+(r.message||''));return r.data};
const fail=async(code,...a)=>{const r=await call(...a);assert.strictEqual(r.code,code,a[0]+' '+a[1]+' expected '+code+' got '+r.code+' '+r.st);return r};
(async()=>{await new Promise(r=>app.server.listen(0,r));base='http://127.0.0.1:'+app.server.address().port;
 // security basics
 await fail('unauthorized','GET','/admin/dashboard');await fail('unauthorized','GET','/wallet');await fail('invalid_credentials','POST','/admin/auth/login',{email:'admin@example.com',password:'wrong'});await fail('unauthorized','POST','/auth/telegram',{initData:'hash=abc&user={}'});
 const A=(await ok('POST','/admin/auth/login',{email:'admin@example.com',password:'correct-horse-battery'})).token;
 await fail('unauthorized','GET','/admin/dashboard',null,'garbage');
 const adm=(m,p,b,i)=>ok(m,p,b,A,i);
 // setup: currency, methods, plans
 await adm('POST','/admin/currencies',{code:'USDT',name:'Tether',symbol:'$',decimals:2,deposit:{min:'5',max:'5000',feePct:1,feeFlat:'0'},withdraw:{min:'10',max:'2000',feePct:0,feeFlat:'1'}});
 await adm('POST','/admin/currencies',{code:'BDT',name:'Taka',decimals:0,deposit:{min:'200',max:'50000'},withdraw:{min:'500',max:'50000'}});
 await adm('POST','/admin/payment-methods',{id:'usdt_trc20',kind:'crypto',name:'TRC20',currency:'USDT',address:'TAddr',proofRequired:false});
 await adm('POST','/admin/payment-methods',{id:'bkash',kind:'manual',name:'bKash',currency:'BDT',number:'01700000000'});
 await adm('POST','/admin/payment-methods',{id:'usdt_out',kind:'payout',name:'TRC20 payout',currency:'USDT',addressPattern:'^T[A-Za-z0-9]{33}$'});
 await adm('POST','/admin/plans',{id:'free',name:{en:'Free Miner',bn:'ফ্রি'},tier:'free',reward:'0.05',rewardCurrency:'USDT',currency:'USDT',cycleHours:24,durationDays:0,maxPerUser:1,firstClaimImmediate:true});
 await adm('POST','/admin/plans',{id:'starter',name:{en:'Starter'},tier:'paid',price:'10',currency:'USDT',reward:'0.4',rewardCurrency:'USDT',cycleHours:24,durationDays:30,cap:'12',maxPerUser:2});
 await adm('PATCH','/admin/settings',{section:'referral',value:{bonus:{enabled:true,amount:0.2,currency:'USDT',qualifying:'first_purchase'},commission:{enabled:true,type:'percent',value:5,currency:'USDT'}}});
 await fail('validation','PATCH','/admin/settings',{section:'referral',value:{mode:'multi'}},A);
 // users
 const ua=await ok('POST','/auth/telegram',{initData:initData({id:1001,first_name:'Alice',username:'alice'})});const TA=ua.token;
 const cfgU=await ok('GET','/config');assert(cfgU.currencies.length===2&&cfgU.currencies.find(c=>c.code==='USDT').deposit.auto.networks.length===1);assert(!JSON.stringify(cfgU).includes('passwordHash'));
 const refCode=(await ok('GET','/referral',null,TA)).code;
 const TB=(await ok('POST','/auth/telegram',{initData:initData({id:1002,first_name:'Bob',username:'bob'},'ref_'+refCode)})).token;
 const u=(m,p,b,i)=>ok(m,p,b,TA,i),ub=(m,p,b,i)=>ok(m,p,b,TB,i);
 assert.strictEqual((await u('GET','/referral')).count,1);
 // claim (free plan immediate)
 let ms=(await u('GET','/mining')).miners;assert.strictEqual(ms.length,1);const mid=ms[0].id;
 const c1=await u('POST','/mining/'+mid+'/claim',{},'k-claim-1');assert.strictEqual(c1.reward,0.05);
 const c1b=await u('POST','/mining/'+mid+'/claim',{},'k-claim-1');assert.strictEqual(c1b.reward,0.05); // idempotent replay
 await fail('not_ready','POST','/mining/'+mid+'/claim',{},TA);
 let w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.available,0.05,'only one credit despite replay');
 // purchase with no funds
 await fail('insufficient_funds','POST','/plans/starter/purchase',{},TA);
 // deposit flow
 const d1=await u('POST','/deposits',{currency:'USDT',mode:'auto',network:'usdt_trc20',amount:'100',txid:'TX123456'});await fail('duplicate_txid','POST','/deposits',{currency:'USDT',mode:'auto',network:'usdt_trc20',amount:'50',txid:'tx123456'},TA);
 await fail('below_min','POST','/deposits',{currency:'USDT',mode:'auto',network:'usdt_trc20',amount:'1',txid:'TX999999'},TA);await fail('invalid_amount','POST','/deposits',{currency:'USDT',mode:'auto',network:'usdt_trc20',amount:'1.234',txid:'TX999998'},TA);
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.available,0.05,'pending deposit must not change balance');
 const did=d1.deposit.id;await adm('POST','/admin/deposits/'+did+'/approve',{message:'ok'});await fail('invalid_state','POST','/admin/deposits/'+did+'/approve',{},A);await fail('invalid_state','POST','/admin/deposits/'+did+'/reject',{},A);
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.available,99.05,'100 minus 1% fee plus 0.05');assert.strictEqual(w.deposited,99);
 // purchase by A, and B (referred) with deposit
 const p1=await u('POST','/plans/starter/purchase',{},'k-buy-1');await u('POST','/plans/starter/purchase',{},'k-buy-1');w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.available,89.05,'one purchase despite replay');

 await u('POST','/plans/starter/purchase',{});await fail('limit_reached','POST','/plans/starter/purchase',{},TA);
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.available,79.05);
 // referred user B buys => bonus + commission for A (exactly once)
 const dB=await ub('POST','/deposits',{currency:'USDT',mode:'auto',network:'usdt_trc20',amount:'100',txid:'BTX00001'});await adm('POST','/admin/deposits/'+dB.deposit.id+'/approve',{});
 await ub('POST','/plans/starter/purchase',{});await new Promise(r=>setTimeout(r,400));
 let ref=await u('GET','/referral');assert.strictEqual(ref.earnings[0].amount,0.7,'bonus 0.2 + commission 0.5');assert.strictEqual(ref.referrals[0].status,'active');
 await ub('POST','/plans/starter/purchase',{});await new Promise(r=>setTimeout(r,400));ref=await u('GET','/referral');assert.strictEqual(ref.earnings[0].amount,1.2,'second purchase: commission only');
 // plan versioning
 const pv=await adm('PATCH','/admin/plans/starter',{price:'20',reason:'price change'});assert.strictEqual(pv.version,2);assert(pv.termsChanged);
 const un=await adm('GET','/admin/plans/starter/users');assert(un.items.every(x=>x.version===1&&x.price===10),'old purchases keep original terms');
 assert.strictEqual((await u('GET','/plans')).plans.find(p=>p.id==='starter').price,20);
 // withdrawals: reserve / reject / approve / process / complete
 await fail('invalid_address','POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:'bad',amount:'50'},TA);await fail('insufficient_funds','POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:'T'+'a'.repeat(33),amount:'2000'},TA);
 const ADDR='T'+'a'.repeat(33);const w1=await u('POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:ADDR,amount:'50'},'k-wd-1');await u('POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:ADDR,amount:'50'},'k-wd-1');
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');const before=w.available+w.locked;assert.strictEqual(w.locked,50,'one reservation despite replay');
 await fail('reason_required','POST','/admin/withdrawals/'+w1.withdrawal.id+'/reject',{},A);
 await adm('POST','/admin/withdrawals/'+w1.withdrawal.id+'/reject',{message:'bad address'});await fail('invalid_state','POST','/admin/withdrawals/'+w1.withdrawal.id+'/approve',{},A);
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.locked,0);assert.strictEqual(w.available+w.locked,before,'reject releases reserved funds');
 const w2=await u('POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:ADDR,amount:'30'});const wid=w2.withdrawal.id;
 await fail('invalid_state','POST','/admin/withdrawals/'+wid+'/status',{status:'completed'},A).catch(()=>{});
 await adm('POST','/admin/withdrawals/'+wid+'/approve',{});await adm('POST','/admin/withdrawals/'+wid+'/status',{status:'processing'});await adm('POST','/admin/withdrawals/'+wid+'/status',{status:'completed',payoutRef:'0xabc'});
 await fail('invalid_state','POST','/admin/withdrawals/'+wid+'/reject',{message:'x'},A);await fail('invalid_state','POST','/admin/withdrawals/'+wid+'/status',{status:'completed'},A);
 w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(w.locked,0);assert.strictEqual(w.withdrawn,30);
 const hist=await u('GET','/history?limit=50');assert(hist.items.some(x=>x.type==='refund'&&x.amount===50));
 // admin adjustment
 await fail('reason_required','POST','/admin/wallets/adjustments',{tgId:1001,currency:'USDT',type:'credit',amount:'5',confirm:true},A);await fail('confirmation_required','POST','/admin/wallets/adjustments',{tgId:1001,currency:'USDT',type:'credit',amount:'5',reason:'test'},A);
 const bal0=w.available;const ad=await adm('POST','/admin/wallets/adjustments',{tgId:1001,currency:'USDT',type:'credit',amount:'5',reason:'goodwill',confirm:true},'adj-1');await adm('POST','/admin/wallets/adjustments',{tgId:1001,currency:'USDT',type:'credit',amount:'5',reason:'goodwill',confirm:true},'adj-1');
 assert.strictEqual(ad.after-ad.before,5);w=(await u('GET','/wallet')).wallets.find(x=>x.currency==='USDT');assert.strictEqual(Math.round((w.available-bal0)*100)/100,5,'adjustment applied once');
 await fail('insufficient_funds','POST','/admin/wallets/adjustments',{tgId:1001,currency:'USDT',type:'debit',amount:'99999',reason:'xxx',confirm:true},A);
 // ledger invariant: available == credits - debits for every wallet
 const wl=await adm('GET','/admin/wallets?limit=200');for(const x of wl.items)assert.strictEqual(Math.round((x.credits-x.debits-x.available)*100)/100,0,'ledger invariant '+x.id);
 assert.strictEqual(wl.totalWallets,wl.items.length);
 // restrictions / suspension / features / maintenance
 await adm('POST','/admin/users/tg_1001/restrictions',{key:'withdraw',reason:'review'});await fail('restricted','POST','/withdrawals',{currency:'USDT',network:'usdt_out',address:ADDR,amount:'20'},TA);await ok('DELETE','/admin/users/tg_1001/restrictions/withdraw',null,A);
 await adm('PATCH','/admin/users/tg_1001/status',{status:'suspended',reason:'fraud check'});await fail('suspended','GET','/wallet',null,TA);await adm('PATCH','/admin/users/tg_1001/status',{status:'active',reason:'cleared'});await u('GET','/wallet');
 await adm('PATCH','/admin/features',{features:{history:{enabled:false}}});await fail('feature_disabled','GET','/history',null,TA);await adm('PATCH','/admin/features',{features:{history:{enabled:true}}});await u('GET','/history');
 await adm('PATCH','/admin/settings',{section:'general',value:{maintenance:{enabled:true}}});await fail('maintenance','GET','/wallet',null,TA);assert.strictEqual((await ok('GET','/config')).app.maintenance,true);await adm('PATCH','/admin/settings',{section:'general',value:{maintenance:{enabled:false}}});
 // support, notifications
 const tk=await u('POST','/support/tickets',{category:'deposit',subject:'Help me',message:'Where is my deposit?'});await adm('PATCH','/admin/support/tickets/'+tk.ticket.id+'/status',{note:'internal only',priority:'high'});await adm('POST','/admin/support/tickets/'+tk.ticket.id+'/reply',{message:'Checking'});
 const tv=await u('GET','/support/tickets/'+tk.ticket.id);assert(!JSON.stringify(tv).includes('internal only'),'internal notes hidden');assert.strictEqual(tv.ticket.messages.length,2);
 await adm('PUT','/admin/notification-templates/announcement',{title:{en:'Hi {name}'},text:{en:'News: {message}'}});const sn=await adm('POST','/admin/notifications/send',{target:{type:'users',ids:['1001','@bob']},title:{en:'Hello'},text:{en:'Body'}});assert.strictEqual(sn.recipients,2);await fail('confirmation_required','POST','/admin/notifications/send',{target:{type:'all'},title:{en:'x'},text:{en:'y'}},A);
 const nt=await u('GET','/notifications');assert(nt.items.length>=4&&nt.unread>0);await u('POST','/notifications/read',{all:true});assert.strictEqual((await u('GET','/notifications')).unread,0);
 // leaderboard, dashboard, reports, audit
 const lb=await u('GET','/leaderboard');assert(lb.rows.length>=1&&lb.me.rank);
 const dash=await adm('GET','/admin/dashboard');assert.strictEqual(dash.stats.users,2);assert(dash.stats.depositsApproved>=2);assert(dash.financial.find(f=>f.currency==='USDT').deposits>0);
 const an=await adm('GET','/admin/dashboard/analytics?currency=USDT');assert(an.days.length>=28);
 const rp=await adm('GET','/admin/reports?type=deposits');assert(rp.rows.length>=2);await adm('GET','/admin/reports?type=currency');
 const au=await adm('GET','/admin/audit-logs?action=deposit.approve');assert(au.items.length>=2);const tl=await adm('GET','/admin/transactions?limit=100');const td=await adm('GET','/admin/transactions/'+tl.items.find(x=>x.type==='deposit').id);assert(td.ledger.length>=1);
 const ud=await adm('GET','/admin/users/tg_1001');assert(ud.wallets.length&&ud.plans.length&&ud.transactions.length);
 const sys=await adm('GET','/admin/system');assert(!JSON.stringify(sys).includes('TEST_BOT_TOKEN')&&sys.telegramBot.configured);
 // logout revokes
 await adm('POST','/admin/auth/logout',{});await fail('unauthorized','GET','/admin/dashboard',null,A);
 console.log('ALL BACKEND TESTS PASSED');app.close();process.exit(0);
})().catch(e=>{console.error('TEST FAILED',e);process.exit(1)});
