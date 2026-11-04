const { verify } = require('../utils/jwt');
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required. Send Authorization: Bearer <token>.' });
  try { req.user = verify(token); next(); }
  catch (err) { return res.status(401).json({ error: err.message === 'Token expired' ? 'Token expired' : 'Invalid or expired token' }); }
}
function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action' });
}
module.exports = { authenticate, allowRoles };
