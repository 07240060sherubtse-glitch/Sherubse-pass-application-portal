
const Leave = require('../models/leaveModel');
const db = require('../config/db');

// Central error handler
function fail(res, e) {
  if (e.status) {
    return res.status(e.status).json({
      error: e.message
    });
  }

  console.error('Leave controller error:', e);

  return res.status(500).json({
    error: 'Unexpected server error.'
  });
}

// ============================================
// CREATE LEAVE REQUEST
// ============================================
exports.create = async (req, res) => {
  try {
    const request = await Leave.createRequest(
      req.user.id,
      req.body
    );

    return res.status(201).json({
      message: 'Request submitted to SSO for review.',
      request
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// LIST LEAVE REQUESTS
// ============================================
exports.list = async (req, res) => {
  try {
    const requests = await Leave.listRequests(req.user);

    return res.json({ requests });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// GET SINGLE LEAVE REQUEST
// ============================================
exports.get = async (req, res) => {
  try {
    const request = await Leave.getRequest(req.params.id);

    if (!request) {
      return res.status(404).json({
        error: 'Leave request not found.'
      });
    }

    if (
      req.user.role === 'student' &&
      Number(request.student_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({
        error: 'You are not allowed to view this request.'
      });
    }

    const history = await Leave.getHistory(request.id);

    return res.json({
      request,
      history
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// UPDATE LEAVE REQUEST
// ============================================
exports.update = async (req, res) => {
  try {
    const request = await Leave.updateRequest(
      req.params.id,
      req.user.id,
      req.body
    );

    return res.json({
      message: 'Request updated successfully.',
      request
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// APPROVE OR REJECT LEAVE REQUEST
// ============================================
exports.decide = async (req, res) => {
  try {
    const { decision, comment, quotaOverrideReason } = req.body;

    if (!decision) {
      return res.status(400).json({
        error: 'A decision is required.'
      });
    }

    const request = await Leave.decide(
      req.params.id,
      req.user,
      decision,
      comment,
      quotaOverrideReason
    );

    return res.json({
      message: 'Decision recorded successfully.',
      request
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// CANCEL LEAVE REQUEST
// ============================================
exports.cancel = async (req, res) => {
  try {
    const request = await Leave.cancel(
      req.params.id,
      req.user,
      req.body.comment
    );

    return res.json({
      message: 'Leave request cancelled successfully.',
      request
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// GET LEAVE BALANCE
// ============================================
exports.balance = async (req, res) => {
  try {
    const studentId =
      req.user.role === 'student'
        ? req.user.id
        : Number(req.params.studentId);

    if (!studentId || !Number.isInteger(Number(studentId))) {
      return res.status(400).json({
        error: 'A valid student ID is required.'
      });
    }

    const balance = await Leave.getBalance(studentId);

    if (!balance) {
      return res.status(404).json({
        error: 'Leave balance not found.'
      });
    }

    return res.json({ balance });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// LIST STUDENTS
// ============================================
exports.students = async (req, res) => {
  try {
    const students = await Leave.listStudents();

    return res.json({ students });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// UPDATE STUDENT ATTENDANCE / LEAVE QUOTA
// ============================================
exports.updateStudent = async (req, res) => {
  try {
    const attendance =
      req.body.attendancePercent === undefined
        ? undefined
        : Number(req.body.attendancePercent);

    const total =
      req.body.totalDays === undefined
        ? undefined
        : Number(req.body.totalDays);

    if (
      attendance !== undefined &&
      (
        !Number.isFinite(attendance) ||
        attendance < 0 ||
        attendance > 100
      )
    ) {
      return res.status(400).json({
        error: 'Attendance must be between 0 and 100.'
      });
    }

    if (
      total !== undefined &&
      (!Number.isInteger(total) || total < 0)
    ) {
      return res.status(400).json({
        error: 'Total leave days must be a non-negative integer.'
      });
    }

    if (attendance === undefined && total === undefined) {
      return res.status(400).json({
        error: 'At least one student field must be provided.'
      });
    }

    const student = await Leave.updateStudentRecord(
      req.params.studentId,
      attendance,
      total
    );

    return res.json({
      message: 'Student record updated successfully.',
      student
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// LIST PUBLIC HOLIDAYS
// ============================================
exports.holidays = async (req, res) => {
  try {
    const holidays = await db.any(
      `SELECT id, holiday_date, holiday_name
       FROM holidays
       ORDER BY holiday_date ASC`
    );

    return res.json({ holidays });
  } catch (e) {
    return fail(res, e);
  }
};

// ============================================
// ADD PUBLIC HOLIDAY
// ============================================
exports.addHoliday = async (req, res) => {
  try {
    const { holidayDate, holidayName } = req.body;

    if (!holidayDate || !holidayName || !String(holidayName).trim()) {
      return res.status(400).json({
        error: 'Holiday date and holiday name are required.'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
      return res.status(400).json({
        error: 'Holiday date must use YYYY-MM-DD format.'
      });
    }

    const holiday = await db.one(
      `INSERT INTO holidays (holiday_date, holiday_name)
       VALUES ($1::date, $2)
       RETURNING id, holiday_date, holiday_name`,
      [holidayDate, String(holidayName).trim()]
    );

    return res.status(201).json({
      message: 'Public holiday added successfully.',
      holiday
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({
        error: 'A holiday already exists for this date.'
      });
    }

    return fail(res, e);
  }
};

// ============================================
// DELETE PUBLIC HOLIDAY
// ============================================
exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await db.oneOrNone(
      `DELETE FROM holidays
       WHERE id = $1
       RETURNING id, holiday_date, holiday_name`,
      [req.params.id]
    );

    if (!holiday) {
      return res.status(404).json({
        error: 'Public holiday not found.'
      });
    }

    return res.json({
      message: 'Public holiday deleted successfully.',
      holiday
    });
  } catch (e) {
    return fail(res, e);
  }
};
