// Usage: node scripts/hash-password.js "your-strong-password"   -> prints ADMIN_PASSWORD_HASH value
const L=require('../src/lib');const p=process.argv[2];if(!p||p.length<10){console.error('Provide a password of at least 10 characters.');process.exit(1)}console.log(L.hashPassword(p));
