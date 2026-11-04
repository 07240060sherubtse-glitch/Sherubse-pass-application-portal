
const router = require('express').Router();

const auth = require('../controllers/authController');
const leave = require('../controllers/leaveController');
const { authenticate, allowRoles } = require('../middleware/auth');

// Check that all route handlers exist before registering routes.
function checkHandler(name, handler) {
  if (typeof handler !== 'function') {
    throw new Error(
      `Route handler "${name}" is missing or is not a function. ` +
      `Check your controller exports.`
    );
  }

  return handler;
}

// Check middleware
checkHandler('authenticate', authenticate);
checkHandler('allowRoles', allowRoles);

// Health check
router.get('/health', async (req, res) => {
  try {
    const db = require('../config/db');
    await db.one('SELECT 1');

    res.json({
      status: 'ok',
      database: 'connected',
      application: 'Sherubtse Pass Application Portal'
    });
  } catch (error) {
    console.error('Health check failed:', error);

    res.status(503).json({
      status: 'error',
      database: 'disconnected'
    });
  }
});

// Authentication
router.post(
  '/auth/register',
  checkHandler('auth.register', auth.register)
);

router.post(
  '/auth/login',
  checkHandler('auth.login', auth.login)
);

router.get(
  '/auth/verify-email',
  checkHandler('auth.verifyEmail', auth.verifyEmail)
);

router.post(
  '/auth/resend-verification',
  checkHandler('auth.resendVerification', auth.resendVerification)
);

router.get(
  '/auth/me',
  authenticate,
  checkHandler('auth.me', auth.me)
);

router.patch(
  '/auth/profile',
  authenticate,
  allowRoles('student'),
  checkHandler('auth.updateProfile', auth.updateProfile)
);

// Leave requests
router.post(
  '/leave-requests',
  authenticate,
  allowRoles('student'),
  checkHandler('leave.create', leave.create)
);

router.get(
  '/leave-requests',
  authenticate,
  checkHandler('leave.list', leave.list)
);

router.get(
  '/leave-requests/:id',
  authenticate,
  checkHandler('leave.get', leave.get)
);

router.patch(
  '/leave-requests/:id',
  authenticate,
  allowRoles('student'),
  checkHandler('leave.update', leave.update)
);

router.post(
  '/leave-requests/:id/decision',
  authenticate,
  allowRoles('dsa', 'sso'),
  checkHandler('leave.decide', leave.decide)
);

router.post(
  '/leave-requests/:id/cancel',
  authenticate,
  allowRoles('student'),
  checkHandler('leave.cancel', leave.cancel)
);

// Leave balance
router.get(
  '/leave-balance',
  authenticate,
  allowRoles('student'),
  checkHandler('leave.balance', leave.balance)
);

router.get(
  '/students',
  authenticate,
  allowRoles('dsa', 'sso'),
  checkHandler('leave.students', leave.students)
);

router.get(
  '/students/:studentId/leave-balance',
  authenticate,
  allowRoles('dsa', 'sso'),
  checkHandler('leave.balance', leave.balance)
);

router.patch(
  '/students/:studentId',
  authenticate,
  allowRoles('dsa'),
  checkHandler('leave.updateStudent', leave.updateStudent)
);

// Public holiday management
router.get(
  '/holidays',
  authenticate,
  allowRoles('dsa', 'sso'),
  checkHandler('leave.holidays', leave.holidays)
);

router.post(
  '/holidays',
  authenticate,
  allowRoles('dsa'),
  checkHandler('leave.addHoliday', leave.addHoliday)
);

router.delete(
  '/holidays/:id',
  authenticate,
  allowRoles('dsa'),
  checkHandler('leave.deleteHoliday', leave.deleteHoliday)
);

module.exports = router;
