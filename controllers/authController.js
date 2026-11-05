const bcrypt = require('bcrypt');
const Auth = require('../models/authModel');
const { sign } = require('../utils/jwt');
const crypto = require('crypto');
const mailer = require('../utils/mailer');
exports.register = async (req,res) => {
 try {
  const {fullName,email,studentNumber,password}=req.body;
  if(!fullName?.trim()||!email?.trim()||!password) return res.status(400).json({error:'Full name, email and password are required.'});
  if(password.length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
  if(!studentNumber?.trim()) return res.status(400).json({error:'College/student ID is required.'});
  const user=await Auth.createStudent({fullName:fullName.trim(),email:email.trim(),studentNumber:studentNumber.trim(),password});
  try {
   const verificationToken=crypto.randomBytes(32).toString('hex');
   const tokenHash=crypto.createHash('sha256').update(verificationToken).digest('hex');
   await Auth.setVerificationToken(user.id,tokenHash,new Date(Date.now()+24*60*60*1000));
   await mailer.sendVerificationEmail(user.email,user.full_name,verificationToken);
   return res.status(201).json({message:'Account Created. Please check your email and verify your account before logging in.'});
  } catch(setupError) {
   console.error('Account created, but verification setup failed:',setupError.message);
   return res.status(201).json({message:'Account Created, but the verification email could not be sent. Go to the login page and use Resend Verification Email, or contact the portal administrator.'});
  }
 } catch(e) { if(e.code==='23505') return res.status(409).json({error:'Email or college ID is already registered.'}); console.error(e); res.status(500).json({error:'Could not create account.'}); }
};
exports.login = async (req,res) => {
 try {
  const {email,password,role}=req.body;
  if(!email||!password) return res.status(400).json({error:'Email/college ID and password are required.'});
  // Login accepts email or student number. The role is checked against the stored role, never trusted as authority.
  const user=await Auth.findByLogin(email.trim());
  if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Invalid login details.'});
  if(user.role==='student' && user.email_verified!==true) return res.status(403).json({error:'Please verify your email address before logging in. Check your inbox for the verification link.'});
  if(role && user.role!==role) return res.status(403).json({error:'This account is not registered for the selected role.'});
  const safe=Auth.publicUser(user); const token=sign({id:user.id,role:user.role,email:user.email,fullName:user.full_name});
  res.json({message:'Login successful.',token,user:safe});
 } catch(e) { console.error(e); res.status(500).json({error:'Could not log in.'}); }
};

exports.verifyEmail = async (req,res) => {
 try {
  const token=String(req.query.token||'');
  if(!token) return res.status(400).send('Verification link is invalid.');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const user=await Auth.verifyEmail(hash);
  if(!user) return res.status(400).send('This verification link is invalid or has expired. Please contact the portal administrator.');
  res.send('Your email has been verified successfully. You can now return to the Sherubtse Pass Portal and log in.');
 } catch(e) { console.error(e); res.status(500).send('Could not verify your email. Please try again later.'); }
};

exports.me = async (req,res) => { try { const user=await Auth.findPublicById(req.user.id); if(!user)return res.status(404).json({error:'Account not found.'}); res.json({user}); } catch(e) { console.error(e); res.status(500).json({error:'Could not load account.'}); } };

const profileCourses = [
  'BA Political Science and Sociology',
  'BSc Chemistry',
  'BSc Data Science',
  'BSc Life Sciences',
  'BSc Mathematics',
  'BSc Physics',
  'BSc Statistics',
  'DCPM',
  'DSDA',
  'EPS'
];
const profileYears = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
const profileHostels = [
  'Dekiling', 'Pemaling', 'Gakiling', 'Tshogyaling', 'Yeatsholing',
  'Gatsheling', 'DH I', 'DH II', 'DH VI', 'DH VII', 'DH VIII',
  'Minjurling', 'Thubtenling', 'Rabtenling', 'Yontenling', 'Norbuling',
  'DH III', 'DH IV', 'DH V', 'MPH'
];
const sectionedYears = {
  'BSc Life Sciences': ['Year 1', 'Year 2', 'Year 3'],
  DSDA: ['Year 1', 'Year 2', 'Year 3', 'Year 4']
};

function validateStudentProfile({ course, year, section = '', hostel } = {}) {
  const fields = [
    ['course', course, 'Course', profileCourses],
    ['year', year, 'Year', profileYears],
    ['hostel', hostel, 'Hostel', profileHostels]
  ];
  const values = {};

  for (const [field, value, label, options] of fields) {
    if (typeof value !== 'string' || !value.trim()) {
      return { error: `${label} is required.` };
    }

    if (!options.includes(value.trim())) {
      return { error: `Select a valid ${label.toLowerCase()}.` };
    }

    values[field] = value.trim();
  }

  if (section !== undefined && section !== null && typeof section !== 'string') {
    return { error: 'Select a valid section.' };
  }

  const sectionOptions = (sectionedYears[values.course] || []).includes(values.year)
    ? ['A', 'B']
    : [];
  const normalizedSection = typeof section === 'string' ? section.trim() : '';

  if (sectionOptions.length && !sectionOptions.includes(normalizedSection)) {
    return { error: 'Select a valid section for this course and year.' };
  }

  if (!sectionOptions.length && normalizedSection) {
    return { error: 'This course and year do not have a section in the timetable.' };
  }

  values.section = normalizedSection;
  return { values };
}

exports.updateProfile = async (req, res) => {
  try {
    const profile = validateStudentProfile(req.body);

    if (profile.error) {
      return res.status(400).json({ error: profile.error });
    }

    const user = await Auth.updateStudentProfile(req.user.id, profile.values);

    return res.json({
      message: 'Student profile updated successfully.',
      user: Auth.publicUser(user)
    });
  } catch (error) {
    console.error('Update student profile failed:', error);
    return res.status(500).json({
      error: 'Could not update student profile.'
    });
  }
};


exports.resendVerification = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    const user = await Auth.findUnverifiedStudent(email);

    // Use the same response whether the account exists or not.
    const message = 'If an unverified student account exists for this email, a new verification link will be sent.';

    if (!user) {
      return res.json({ message });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    await Auth.setVerificationToken(
      user.id,
      tokenHash,
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    try {
      await mailer.sendVerificationEmail(
        user.email,
        user.full_name,
        verificationToken
      );
    } catch (mailError) {
      console.error('Resend verification email failed:', mailError.message);

      return res.status(503).json({
        error: 'Could not send the verification email. Please try again later.'
      });
    }

    return res.json({ message });

  } catch (error) {
    console.error('Resend verification error:', error);

    return res.status(500).json({
      error: 'Could not process your request. Please try again later.'
    });
  }
};
