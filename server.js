'use strict';
const http=require('http'),crypto=require('crypto');
const L=require('./lib');
function build(env){
 let store;
 if(env.STORE==='memory')store=new L.MemoryStore();
 else{const admin=require('firebase-admin');const cred=env.FIREBASE_SERVICE_ACCOUNT?admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)):admin.credential.applicationDefault();admin.initializeApp({credential:cred,storageBucket:env.STORAGE_BUCKET||undefined});store=new L.FirestoreStore(admin,env.STORAGE_BUCKET)}
 if(!env.JWT_SECRET||String(env.JWT_SECRET).length<32)throw new Error('JWT_SECRET (min 32 chars) is required');
 const K=require('./core')(store,env);const userR=require('./user')(K);require('./referral')(K);const adminR=require('./admin')(K);
 const routes=[].concat(userR,adminR).map(x=>{const keys=[];const re=new RegExp('^'+x.p.replace(/:(\w+)/g,(m,k)=>{keys.push(k);return '([^/]+)'})+'/?$');return Object.assign({},x,{re,keys})});
 /* ----- rate limiting (in-memory, per instance) ----- */
 const hits=new Map();const limited=(k,max,win)=>{const t=Date.now(),a=(hits.get(k)||[]).filter(x=>t-x<win);a.push(t);hits.set(k,a);return a.length>max};
 setInterval(()=>{const t=Date.now();for(const [k,a] of hits)if(!a.length||t-a[a.length-1]>900000)hits.delete(k)},60000).unref();
 const origins=String(env.CORS_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const cors=(req,res)=>{const o=req.headers.origin;if(o&&(origins.includes('*')||origins.includes(o))){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,Idempotency-Key,X-Telegram-Init-Data');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Max-Age','600')}};
 const send=(res,st,body)=>{const s=JSON.stringify(body);res.writeHead(st,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(s)};
 const readBody=(req,max)=>new Promise((ok,no)=>{let n=0;const ch=[];req.on('data',d=>{n+=d.length;if(n>max){no(Object.assign(new Error('too_large'),{status:413,code:'too_large'}));req.destroy();return}ch.push(d)});req.on('end',()=>ok(Buffer.concat(ch)));req.on('error',no)});
 async function webhook(gw,raw,h){const m=await store.get('paymentMethods',gw);if(!m||m.kind!=='gateway')throw Object.assign(new Error('not_found'),{status:404,code:'not_found'});
  const secret=env['GATEWAY_'+gw.toUpperCase().replace(/[^A-Z0-9]/g,'_')+'_SECRET'];if(!secret)throw Object.assign(new Error('gateway_not_configured'),{status:503,code:'gateway_not_configured'});
  const calc=crypto.createHmac('sha256',secret).update(raw).digest('hex');if(!L.safeEq(calc,String(h['x-signature']||''))){await store.set('paymentEvents',L.id('PE'),{gateway:gw,status:'bad_signature',ts:Date.now()});throw Object.assign(new Error('bad_signature'),{status:401,code:'bad_signature'})}
  let p;try{p=JSON.parse(raw.toString())}catch(e){throw Object.assign(new Error('bad_json'),{status:400,code:'validation'})}const pid=gw+'_'+String(p.eventId||'').slice(0,100);if(!p.eventId)throw Object.assign(new Error('eventId'),{status:400,code:'validation'});
  if(await store.get('paymentEvents',pid))return{duplicate:true};
  const ev={gateway:gw,eventId:p.eventId,reference:p.reference,amount:p.amount,currency:p.currency,providerStatus:p.status,status:'verified',ts:Date.now()};
  if(p.status==='paid'){const deps=(await store.list('deposits',{eq:{txid:String(p.reference||'')}})).filter(d=>d.status==='pending'&&d.methodId===gw&&d.currency===p.currency);const d=deps[0],cur=await K.currency(p.currency);
   if(!d||!cur||L.parseAmount(p.amount,cur.decimals)!==d.amount){ev.status='unmatched'}else{await store.set('paymentEvents',pid,ev);try{await K.depDecide({params:{id:d.id},body:{message:'Auto-verified payment'},admin:{email:'gateway:'+gw}},true,'gateway:'+gw);ev.status='credited'}catch(e){ev.status='error'}}}
  else if(p.status==='failed')ev.status='failed';
  await store.set('paymentEvents',pid,ev);return{ok:true,status:ev.status}}
 const server=http.createServer(async(req,res)=>{const reqId=L.id('R');cors(req,res);
  try{if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
   const url=new URL(req.url,'http://x'),path=url.pathname.replace(/\/+$/,'')||'/',ip=String((env.TRUST_PROXY==='1'&&req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'');
   if(path==='/health')return send(res,200,{ok:true,time:Date.now()});
   if(limited('g:'+ip,Number(env.RATE_GLOBAL||240),60000))return send(res,429,{ok:false,code:'rate_limited'});
   const wm=/^\/webhooks\/([\w-]+)$/.exec(path);if(wm&&req.method==='POST'){const raw=await readBody(req,200000);return send(res,200,{ok:true,data:await webhook(wm[1],raw,req.headers)})}
   const route=routes.find(x=>x.m===req.method&&x.re.test(path));if(!route)return send(res,404,{ok:false,code:'not_found'});
   const mm=route.re.exec(path),params={};route.keys.forEach((k,i)=>params[k]=decodeURIComponent(mm[i+1]));
   let body={};if(req.method!=='GET'&&req.method!=='DELETE'){const buf=await readBody(req,Number(env.MAX_BODY||3000000));if(buf.length){try{body=JSON.parse(buf.toString())}catch(e){return send(res,400,{ok:false,code:'validation',message:'bad json'})}}}
   const c={body,query:Object.fromEntries(url.searchParams),params,ip,reqId,ua:req.headers['user-agent'],idem:String(req.headers['idempotency-key']||'').slice(0,80)||null};
   if(route.p==='/admin/auth/login'&&limited('l:'+ip,Number(env.RATE_LOGIN||8),600000))return send(res,429,{ok:false,code:'rate_limited'});
   if(route.p==='/auth/telegram'&&limited('t:'+ip,60,60000))return send(res,429,{ok:false,code:'rate_limited'});
   if(!route.public){const tok=String(req.headers.authorization||'').replace(/^Bearer /,''),p=L.jwtVerify(tok,env.JWT_SECRET);
    if(route.admin){if(!p||p.aud!=='admin'||!p.jti)return send(res,401,{ok:false,code:'unauthorized'});if(await store.get('revokedTokens',p.jti))return send(res,401,{ok:false,code:'unauthorized'});c.admin=p;if(req.method!=='GET'&&limited('a:'+p.jti,120,60000))return send(res,429,{ok:false,code:'rate_limited'})}
    else{if(!p||p.aud!=='user')return send(res,401,{ok:false,code:'unauthorized'});const u=await store.get('users',p.sub);if(!u)return send(res,401,{ok:false,code:'unauthorized'});
     const cfg=await K.cfg();if(cfg.general.maintenance.enabled)return send(res,503,{ok:false,code:'maintenance'});if(u.status==='suspended'&&!route.allowSuspended)return send(res,403,{ok:false,code:'suspended'});
     if(K.restricted(u,'access')&&!route.allowSuspended)return send(res,403,{ok:false,code:'suspended'});c.user=u;c.uid=u.id;if(req.method!=='GET'&&limited('u:'+u.id,Number(env.RATE_USER||60),60000))return send(res,429,{ok:false,code:'rate_limited'});
     if(!u.lastActive||Date.now()-u.lastActive>300000)store.update('users',u.id,{lastActive:Date.now()}).catch(()=>{})}}
   const data=await route.h(c);return send(res,200,{ok:true,data,serverTime:Date.now()})}
  catch(e){const st=e.status||500;if(st>=500)console.error('['+reqId+']',e.stack||e);return send(res,st,{ok:false,code:e.status?e.code:'server',message:e.status?e.message:'Internal error',reqId})}});
 /* scheduled notifications */
 const tick=async()=>{try{const due=(await store.list('scheduled',{limit:200})).filter(x=>x.status==='scheduled'&&x.at<=Date.now());for(const s of due){await store.update('scheduled',s.id,{status:'running'});try{const r=await K.runSend({target:s.target,tpl:s.tpl});await store.update('scheduled',s.id,{status:'sent',result:r,sentAt:Date.now()})}catch(e){await store.update('scheduled',s.id,{status:'failed',error:String(e.message).slice(0,200)})}}}catch(e){console.error('scheduler',e.message)}};
 const timer=env.SCHEDULER==='0'?null:setInterval(tick,30000);if(timer)timer.unref();
 return{server,store,K,tick,close:()=>{if(timer)clearInterval(timer);server.close()}}}
module.exports={build};
if(require.main===module){const app=build(process.env),port=Number(process.env.PORT||8080);app.server.listen(port,()=>console.log('Trusted Mining API listening on '+port+(process.env.STORE==='memory'?' [MEMORY STORE — development only]':'')))}
