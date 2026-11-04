const db = require('../config/db');
const bcrypt = require('bcrypt');
exports.createStudent = async ({
 fullName,
 email,
 studentNumber,
 course,
 year,
 section,
 hostel,
 password
}) => db.tx(async t => {
 const hash = await bcrypt.hash(password, 12);
 const user = await t.one(`INSERT INTO users
 (full_name,email,student_number,course,study_year,section,hostel_name,password_hash,role,email_verified)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'student',FALSE)
 RETURNING id,full_name,email,student_number,course,study_year,section,hostel_name,role,attendance_percent,email_verified`,
 [fullName,email.toLowerCase(),studentNumber || null,course || null,year || null,section || null,hostel || null,hash]);
 await t.none('INSERT INTO leave_balance(student_id,total_days,used_days) VALUES($1,10,0)',[user.id]);
 return user;
});
exports.findByEmail = email => db.oneOrNone('SELECT * FROM users WHERE email=$1',[email.toLowerCase()]);
exports.setVerificationToken = (id, tokenHash, expiresAt) => db.none('UPDATE users SET verification_token_hash=$1,verification_token_expires_at=$2 WHERE id=$3',[tokenHash,expiresAt,id]);
exports.verifyEmail = async tokenHash => db.oneOrNone(`UPDATE users SET email_verified=TRUE,verification_token_hash=NULL,verification_token_expires_at=NULL WHERE verification_token_hash=$1 AND verification_token_expires_at>NOW() RETURNING id,email`,[tokenHash]);
exports.findByLogin = login => db.oneOrNone('SELECT * FROM users WHERE email=$1 OR LOWER(student_number)=LOWER($1) LIMIT 1',[login.trim().toLowerCase()]);
exports.findPublicById = async id => { const user=await db.oneOrNone('SELECT id,full_name,email,student_number,course,study_year,section,hostel_name,role,attendance_percent FROM users WHERE id=$1',[id]); return user; };
exports.publicUser = user => ({id:user.id,full_name:user.full_name,email:user.email,student_number:user.student_number,course:user.course,study_year:user.study_year,section:user.section,hostel_name:user.hostel_name,role:user.role,attendance_percent:user.attendance_percent});
exports.updateStudentProfile = async (id, { course, year, section, hostel }) =>
 db.one(
  `UPDATE users
   SET course=$1, study_year=$2, section=$3, hostel_name=$4
   WHERE id=$5 AND role='student'
   RETURNING id,full_name,email,student_number,course,study_year,section,hostel_name,role,attendance_percent`,
  [course,year,section || null,hostel,id]
 );

exports.findUnverifiedStudent = email =>
  db.oneOrNone(
    `SELECT id, full_name, email
     FROM users
     WHERE email=$1
     AND role='student'
     AND email_verified=FALSE`,
    [email.trim().toLowerCase()]
  );