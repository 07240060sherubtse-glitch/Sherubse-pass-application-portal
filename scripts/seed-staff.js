require('dotenv').config();
const bcrypt=require('bcrypt');
const pgp=require('pg-promise')();
const db=pgp({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME||'sherubtse_pass_portal',user:process.env.DB_USER||'postgres',password:process.env.DB_PASS,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false});
(async()=>{
 try{
  const accounts=[{role:'dsa',name:'Dean of Student Affairs',email:process.env.DSA_EMAIL,password:process.env.DSA_PASSWORD},{role:'sso',name:'Student Service Officer',email:process.env.SSO_EMAIL,password:process.env.SSO_PASSWORD}];
  for(const a of accounts){if(!a.email||!a.password){console.log(`Skipping ${a.role.toUpperCase()} seed: set ${a.role.toUpperCase()}_EMAIL and ${a.role.toUpperCase()}_PASSWORD in .env.`);continue;}if(a.password.length<12)throw new Error(`${a.role.toUpperCase()}_PASSWORD must be at least 12 characters.`);const hash=await bcrypt.hash(a.password,12);await db.none(`INSERT INTO users(full_name,email,password_hash,role,attendance_percent) VALUES($1,$2,$3,$4,100) ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role`,[a.name,a.email.toLowerCase(),hash,a.role]);console.log(`Configured ${a.role.toUpperCase()} account: ${a.email}`);}
 }catch(e){console.error('Could not seed staff accounts:',e.message);process.exitCode=1;}finally{await db.$pool.end();}
})();
