'use strict';
const crypto=require('crypto');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const b64u=b=>Buffer.from(b).toString('base64url');
/* ---------- JWT (HS256, built-in crypto only) ---------- */
function jwtSign(payload,secret,ttlSec){const now=Math.floor(Date.now()/1000),h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64u(JSON.stringify(Object.assign({},payload,{iat:now,exp:now+ttlSec})));
  return h+'.'+p+'.'+crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url')}
function jwtVerify(tok,secret){const parts=String(tok||'').split('.');if(parts.length!==3)return null;
  const exp=crypto.createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest();let got;try{got=Buffer.from(parts[2],'base64url')}catch(e){return null}
  if(got.length!==exp.length||!crypto.timingSafeEqual(got,exp))return null;let p;try{p=JSON.parse(Buffer.from(parts[1],'base64url').toString())}catch(e){return null}
  return p&&p.exp>Date.now()/1000?p:null}
/* ---------- password hashing (scrypt) ---------- */
function hashPassword(pw){const salt=crypto.randomBytes(16).toString('hex');return 'scrypt$'+salt+'$'+crypto.scryptSync(String(pw),salt,32).toString('hex')}
function verifyPassword(pw,stored){const p=String(stored||'').split('$');if(p.length!==3||p[0]!=='scrypt')return false;const a=crypto.scryptSync(String(pw),p[1],32),b=Buffer.from(p[2],'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}
/* ---------- Telegram initData validation ---------- */
function validateInitData(initData,botToken,maxAgeSec){if(!initData||!botToken)return null;const p=new URLSearchParams(initData),hash=p.get('hash');if(!hash)return null;p.delete('hash');
  const data=[...p.entries()].map(([k,v])=>k+'='+v).sort().join('\n'),secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest(),calc=crypto.createHmac('sha256',secret).update(data).digest('hex');
  const a=Buffer.from(calc),b=Buffer.from(hash);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  const ad=Number(p.get('auth_date'));if(!ad||Date.now()/1000-ad>(maxAgeSec||86400))return null;let user;try{user=JSON.parse(p.get('user'))}catch(e){return null}
  return user&&user.id?{user,start_param:p.get('start_param')||''}:null}
/* ---------- money: integer minor units only ---------- */
const pow=d=>Math.pow(10,d);
function parseAmount(v,d){const s=String(v==null?'':v).trim();if(!/^\d{1,12}(\.\d+)?$/.test(s))return null;const parts=s.split('.'),f=parts[1]||'';if(f.length>d)return null;
  const m=Number(parts[0])*pow(d)+Number((f+'0'.repeat(d)).slice(0,d)||0);return Number.isSafeInteger(m)&&m>0?m:null}
const toNum=(m,d)=>Math.round(m)/pow(d);
const pct=(m,p)=>Math.round(m*p/100);
const id=(p)=>p+crypto.randomBytes(8).toString('hex');
const safeEq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
function merge(a,b){if(Array.isArray(b)||b===null||typeof b!=='object')return b===undefined?a:b;const o=Object.assign({},a&&typeof a==='object'&&!Array.isArray(a)?a:{});for(const k of Object.keys(b))o[k]=merge(o[k],b[k]);return o}
/* ---------- stores ---------- */
class MemoryStore{
 constructor(){this.c=new Map();this.files=new Map();this.lock=Promise.resolve()}
 col(n){if(!this.c.has(n))this.c.set(n,new Map());return this.c.get(n)}
 async get(c,i){const d=this.col(c).get(i);return d?Object.assign(clone(d),{id:i}):null}
 async set(c,i,d){this.col(c).set(i,clone(d))}
 async update(c,i,p){const d=this.col(c).get(i);if(!d)throw new Error('not_found');Object.assign(d,clone(p))}
 async list(c,o){o=o||{};let a=[...this.col(c).entries()].map(([k,d])=>Object.assign(clone(d),{id:k}));if(o.eq)a=a.filter(x=>Object.keys(o.eq).every(k=>x[k]===o.eq[k]));a.sort((x,y)=>(y.ts||0)-(x.ts||0));return a.slice(0,o.limit||5000)}
 tx(fn){const run=async()=>{const w=[],self=this,t={get:(c,i)=>self.get(c,i),set:(c,i,d)=>{w.push(['set',c,i,d])},update:(c,i,p)=>{w.push(['upd',c,i,p])},create:async(c,i,d)=>{if(self.col(c).has(i)||w.some(x=>x[0]==='set'&&x[1]===c&&x[2]===i))throw Object.assign(new Error('exists'),{code:'exists'});w.push(['set',c,i,d])}};
   const r=await fn(t);for(const x of w){if(x[0]==='set')await self.set(x[1],x[2],x[3]);else await self.update(x[1],x[2],x[3])}return r};
  const p=this.lock.then(run);this.lock=p.catch(()=>{});return p}
 async putFile(path,buf,mime){this.files.set(path,'data:'+mime+';base64,'+buf.toString('base64'))}
 async fileUrl(path){return this.files.get(path)||null}
 async ping(){return true}
}
class FirestoreStore{
 constructor(admin,bucketName){this.admin=admin;this.db=admin.firestore();this.bucket=bucketName?admin.storage().bucket(bucketName):null}
 ref(c,i){return this.db.collection(c).doc(i)}
 async get(c,i){const s=await this.ref(c,i).get();return s.exists?Object.assign(s.data(),{id:i}):null}
 async set(c,i,d){await this.ref(c,i).set(d)}
 async update(c,i,p){await this.ref(c,i).update(p)}
 async list(c,o){o=o||{};let q=this.db.collection(c);if(o.eq){for(const k of Object.keys(o.eq))q=q.where(k,'==',o.eq[k])}else q=q.orderBy('ts','desc');
  const s=await q.limit(o.limit||5000).get();return s.docs.map(d=>Object.assign(d.data(),{id:d.id})).sort((x,y)=>(y.ts||0)-(x.ts||0))}
 tx(fn){const self=this;return this.db.runTransaction(async ft=>{const t={get:async(c,i)=>{const s=await ft.get(self.ref(c,i));return s.exists?Object.assign(s.data(),{id:i}):null},set:(c,i,d)=>{ft.set(self.ref(c,i),d)},update:(c,i,p)=>{ft.update(self.ref(c,i),p)},create:async(c,i,d)=>{try{ft.create(self.ref(c,i),d)}catch(e){throw Object.assign(new Error('exists'),{code:'exists'})}}};return fn(t)})}
 async putFile(path,buf,mime){if(!this.bucket)throw new Error('storage_not_configured');await this.bucket.file(path).save(buf,{contentType:mime,resumable:false})}
 async fileUrl(path){if(!this.bucket)return null;const [u]=await this.bucket.file(path).getSignedUrl({action:'read',expires:Date.now()+3600e3});return u}
 async ping(){await this.db.collection('config').doc('app').get();return true}
}
module.exports={clone,jwtSign,jwtVerify,hashPassword,verifyPassword,validateInitData,parseAmount,toNum,pct,pow,id,safeEq,merge,MemoryStore,FirestoreStore};
