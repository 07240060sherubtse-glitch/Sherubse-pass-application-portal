const db = require('../config/db');

function bad(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw bad('Dates must use YYYY-MM-DD format.');
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw bad('A valid date is required.');
  }

  return date;
}

function validateRequestData(data) {
  if (
    !data ||
    typeof data.leaveType !== 'string' ||
    !data.leaveType.trim() ||
    data.leaveType.trim().length > 40
  ) {
    throw bad('A valid leave type is required.');
  }

  const startDate = parseDate(data.startDate);
  const endDate = parseDate(data.endDate);

  if (endDate < startDate) {
    throw bad('The end date must be on or after the start date.');
  }

  if (
    typeof data.reason !== 'string' ||
    !data.reason.trim() ||
    data.reason.trim().length > 1500
  ) {
    throw bad('A reason of 1–1500 characters is required.');
  }
}

function daysBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (end < start) {
    throw bad('The end date must be on or after the start date.');
  }

  return Math.floor((end - start) / 86400000) + 1;
}

async function calculateWorkingDays(startDate, endDate, executor = db) {
  const holidays = await executor.any(
    `SELECT holiday_date
     FROM holidays
     WHERE holiday_date BETWEEN $1::date AND $2::date`,
    [startDate, endDate]
  );
  const holidayDates = new Set(
    holidays.map(holiday => String(holiday.holiday_date).slice(0, 10))
  );
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  let workingDays = 0;

  for (let day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    const date = day.toISOString().slice(0, 10);

    if (weekday !== 0 && weekday !== 6 && !holidayDates.has(date)) {
      workingDays += 1;
    }
  }

  return workingDays;
}

function requestSelect() {
  return `SELECT lr.*,
                 u.full_name AS student_name,
                 u.student_number,
                 u.course,
                 u.study_year,
                 u.section,
                 u.hostel_name,
                 u.email AS student_email,
                 u.attendance_percent
          FROM leave_requests lr
          JOIN users u ON u.id = lr.student_id`;
}

exports.daysBetween = daysBetween;

exports.createRequest = async (studentId, data) => {
  validateRequestData(data);

  return db.tx(async t => {
    const student = await t.oneOrNone(
      `SELECT id, course, study_year, section, hostel_name
       FROM users
       WHERE id=$1 AND role='student'
       FOR UPDATE`,
      [studentId]
    );

    if (!student) {
      throw bad('Student account not found.', 404);
    }

    const course = /data science and data analytics/i.test(student.course || '')
      ? 'DSDA'
      : student.course;
    const year = String(student.study_year || '').match(/^Year ([1-4])(?: [AB])?$/)?.[0].slice(0, 6);
    const sectionRequired = (
      course === 'BSc Life Sciences' &&
      ['Year 1', 'Year 2', 'Year 3'].includes(year)
    ) || (
      course === 'DSDA' &&
      ['Year 1', 'Year 2', 'Year 3', 'Year 4'].includes(year)
    );

    if (
      !student.course ||
      !student.study_year ||
      !student.hostel_name ||
      (sectionRequired && !student.section)
    ) {
      throw bad(
        'Complete your student profile (course, year, section if applicable, and hostel) before applying for leave.'
      );
    }

    const { leaveType, startDate, endDate, reason } = data;
    const overlap = await t.oneOrNone(
      `SELECT id
       FROM leave_requests
       WHERE student_id=$1
         AND status IN ('pending_dsa','pending_sso','approved')
         AND start_date <= $3::date
         AND end_date >= $2::date`,
      [studentId, startDate, endDate]
    );

    if (overlap) {
      throw bad(
        `These dates overlap with active request #${overlap.id}.`,
        409
      );
    }

    const balance = await t.oneOrNone(
      `SELECT total_days, used_days, pending_days
       FROM leave_balance
       WHERE student_id=$1
       FOR UPDATE`,
      [studentId]
    );

    if (!balance) {
      throw bad(
        'Leave balance has not been configured. Contact Student Services.',
        409
      );
    }

    const requested = await calculateWorkingDays(startDate, endDate, t);

    if (requested <= 0) {
      throw bad('The selected dates contain no working days.');
    }

    const remaining =
      Number(balance.total_days) -
      Number(balance.used_days) -
      Number(balance.pending_days || 0);

    const quotaExceeded = requested > remaining;

    if (
      quotaExceeded &&
      leaveType.trim().toLowerCase() !== 'emergency'
    ) {
      throw bad(
        `Not enough leave balance. Available: ${Math.max(
          remaining,
          0
        )} working day(s).`
      );
    }

    await t.none(
      `UPDATE leave_balance
       SET pending_days = COALESCE(pending_days, 0) + $1,
           updated_at = NOW()
       WHERE student_id = $2`,
      [requested, studentId]
    );

    return t.one(
      `INSERT INTO leave_requests
         (student_id, leave_type, start_date, end_date, reason, status,
          leave_days, quota_exceeded)
       VALUES ($1, $2, $3, $4, $5, 'pending_sso', $6, $7)
       RETURNING *`,
      [
        studentId,
        leaveType.trim(),
        startDate,
        endDate,
        reason.trim(),
        requested,
        quotaExceeded
      ]
    );
  });
};

exports.listRequests = user => {
  const query = requestSelect();

  if (user.role === 'student') {
    return db.any(
      `${query}
       WHERE lr.student_id=$1
       ORDER BY lr.created_at DESC, lr.id DESC`,
      [user.id]
    );
  }

  return db.any(
    `${query}
     ORDER BY
       CASE WHEN LOWER(lr.leave_type)='emergency' THEN 0 ELSE 1 END,
       CASE WHEN LOWER(lr.leave_type)='emergency'
         THEN lr.created_at END ASC,
       CASE WHEN LOWER(lr.leave_type)<>'emergency'
         THEN lr.created_at END DESC,
       lr.id DESC`
  );
};

exports.getRequest = id =>
  db.oneOrNone(
    `${requestSelect()}
     WHERE lr.id=$1`,
    [id]
  );

exports.getHistory = requestId =>
  db.any(
    `SELECT a.id, a.request_id, a.reviewer_id, a.reviewer_role,
            a.decision, a.comment, a.decided_at,
            u.full_name AS reviewer_name
     FROM approvals a
     JOIN users u ON u.id = a.reviewer_id
     WHERE a.request_id=$1
     ORDER BY a.decided_at ASC, a.id ASC`,
    [requestId]
  );

exports.updateRequest = async (id, studentId, data) => {
  validateRequestData(data);

  return db.tx(async t => {
    const request = await t.oneOrNone(
      `SELECT *
       FROM leave_requests
       WHERE id=$1
       FOR UPDATE`,
      [id]
    );

    if (!request) {
      throw bad('Leave request not found.', 404);
    }

    if (Number(request.student_id) !== Number(studentId)) {
      throw bad('You are not allowed to update this request.', 403);
    }

    if (request.status !== 'pending_sso') {
      throw bad('Only requests awaiting SSO review can be edited.', 409);
    }

    const { leaveType, startDate, endDate, reason } = data;
    const overlap = await t.oneOrNone(
      `SELECT id
       FROM leave_requests
       WHERE student_id=$1
         AND id<>$2
         AND status IN ('pending_dsa','pending_sso','approved')
         AND start_date <= $4::date
         AND end_date >= $3::date`,
      [studentId, id, startDate, endDate]
    );

    if (overlap) {
      throw bad(
        `These dates overlap with active request #${overlap.id}.`,
        409
      );
    }

    const balance = await t.oneOrNone(
      `SELECT total_days, used_days, pending_days
       FROM leave_balance
       WHERE student_id=$1
       FOR UPDATE`,
      [studentId]
    );

    if (!balance) {
      throw bad('Leave balance has not been configured.', 409);
    }

    const requested = await calculateWorkingDays(startDate, endDate, t);

    if (requested <= 0) {
      throw bad('The selected dates contain no working days.');
    }

    const pendingDays =
      Number(balance.pending_days || 0) -
      Number(request.leave_days || 0) +
      requested;
    const availableBeforeRequest =
      Number(balance.total_days) -
      Number(balance.used_days) -
      (Number(balance.pending_days || 0) -
        Number(request.leave_days || 0));
    const quotaExceeded = requested > availableBeforeRequest;

    if (
      quotaExceeded &&
      leaveType.trim().toLowerCase() !== 'emergency'
    ) {
      throw bad(
        `Not enough leave balance. Available: ${Math.max(
          availableBeforeRequest,
          0
        )} working day(s).`
      );
    }

    await t.none(
      `UPDATE leave_balance
       SET pending_days=$1, updated_at=NOW()
       WHERE student_id=$2`,
      [pendingDays, studentId]
    );

    return t.one(
      `UPDATE leave_requests
       SET leave_type=$1, start_date=$2, end_date=$3, reason=$4,
           leave_days=$5, quota_exceeded=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [
        leaveType.trim(),
        startDate,
        endDate,
        reason.trim(),
        requested,
        quotaExceeded,
        id
      ]
    );
  });
};

exports.decide = async (
  id,
  user,
  decision,
  comment,
  quotaOverrideReason
) => {
  if (!['approved', 'rejected'].includes(decision)) {
    throw bad('Decision must be approved or rejected.');
  }

  if (decision === 'rejected' && !String(comment || '').trim()) {
    throw bad('A comment is required when rejecting a request.');
  }

  return db.tx(async t => {
    const request = await t.oneOrNone(
      `SELECT *
       FROM leave_requests
       WHERE id=$1
       FOR UPDATE`,
      [id]
    );

    if (!request) {
      throw bad('Leave request not found.', 404);
    }

    const expectedRole =
      request.status === 'pending_sso'
        ? 'sso'
        : request.status === 'pending_dsa'
          ? 'dsa'
          : null;

    if (!expectedRole) {
      throw bad('This request is no longer awaiting a decision.', 409);
    }

    if (user.role !== expectedRole) {
      throw bad('You are not allowed to decide this request at this stage.', 403);
    }

    let balance;
    if (expectedRole === 'dsa') {
      balance = await t.oneOrNone(
        `SELECT total_days, used_days, pending_days
         FROM leave_balance
         WHERE student_id=$1
         FOR UPDATE`,
        [request.student_id]
      );

      if (!balance) {
        throw bad('Leave balance reservation is inconsistent.', 409);
      }
    }

    let auditComment = String(comment || '').trim() || null;

    if (
      decision === 'approved' &&
      expectedRole === 'dsa' &&
      (
        request.quota_exceeded ||
        Number(balance.used_days) + Number(balance.pending_days) >
          Number(balance.total_days)
      )
    ) {
      if (String(request.leave_type).toLowerCase() !== 'emergency') {
        throw bad('Only emergency requests can exceed the leave quota.', 409);
      }

      const overrideReason = String(quotaOverrideReason || '').trim();

      if (!overrideReason) {
        throw bad(
          'A DSA override reason is required to approve an emergency request over quota.'
        );
      }

      auditComment = [
        auditComment,
        `Quota override reason: ${overrideReason}`
      ].filter(Boolean).join('\n');
    }

    let status = decision;
    if (decision === 'approved' && expectedRole === 'sso') {
      status = 'pending_dsa';
    }

    await t.none(
      `UPDATE leave_requests
       SET status=$1, updated_at=NOW()
       WHERE id=$2`,
      [status, id]
    );

    if (decision === 'rejected' || expectedRole === 'dsa') {
      if (!balance) {
        balance = await t.oneOrNone(
          `SELECT total_days, used_days, pending_days
           FROM leave_balance
           WHERE student_id=$1
           FOR UPDATE`,
          [request.student_id]
        );
      }

      if (!balance || Number(balance.pending_days) < Number(request.leave_days)) {
        throw bad('Leave balance reservation is inconsistent.', 409);
      }

      const pendingDays =
        Number(balance.pending_days) - Number(request.leave_days);
      const usedDays =
        Number(balance.used_days) +
        (decision === 'approved' ? Number(request.leave_days) : 0);

      await t.none(
        `UPDATE leave_balance
         SET pending_days=$1, used_days=$2, updated_at=NOW()
         WHERE student_id=$3`,
        [pendingDays, usedDays, request.student_id]
      );
    }

    await t.none(
      `INSERT INTO approvals
         (request_id, reviewer_id, reviewer_role, decision, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        user.id,
        user.role,
        decision,
        auditComment
      ]
    );

    return t.one('SELECT * FROM leave_requests WHERE id=$1', [id]);
  });
};

exports.cancel = async (id, user, comment) =>
  db.tx(async t => {
    const request = await t.oneOrNone(
      `SELECT lr.*
       FROM leave_requests lr
       WHERE lr.id=$1
       FOR UPDATE`,
      [id]
    );

    if (!request) {
      throw bad('Leave request not found.', 404);
    }

    if (!['pending_sso', 'pending_dsa'].includes(request.status)) {
      throw bad('Only pending requests can be cancelled.', 409);
    }

    if (
      user.role !== 'student' ||
      Number(request.student_id) !== Number(user.id)
    ) {
      throw bad('You are not allowed to cancel this request.', 403);
    }

    const balance = await t.oneOrNone(
      `SELECT pending_days
       FROM leave_balance
       WHERE student_id=$1
       FOR UPDATE`,
      [request.student_id]
    );

    if (!balance || Number(balance.pending_days) < Number(request.leave_days)) {
      throw bad('Leave balance reservation is inconsistent.', 409);
    }

    await t.none(
      `UPDATE leave_balance
       SET pending_days=pending_days-$1, updated_at=NOW()
       WHERE student_id=$2`,
      [request.leave_days, request.student_id]
    );

    await t.none(
      `UPDATE leave_requests
       SET status='cancelled', updated_at=NOW()
       WHERE id=$1`,
      [id]
    );

    await t.none(
      `INSERT INTO approvals
         (request_id, reviewer_id, reviewer_role, decision, comment)
       VALUES ($1, $2, $3, 'cancelled', $4)`,
      [id, user.id, user.role, String(comment || '').trim() || null]
    );

    return t.one('SELECT * FROM leave_requests WHERE id=$1', [id]);
  });

exports.getBalance = studentId =>
  db.oneOrNone(
    `SELECT *,
            GREATEST(total_days - used_days - pending_days, 0) AS remaining_days,
            GREATEST(used_days + pending_days - total_days, 0) AS over_quota_days
     FROM leave_balance
     WHERE student_id=$1`,
    [studentId]
  );

exports.listStudents = () =>
  db.any(
    `SELECT u.id, u.full_name, u.email, u.student_number,
            u.course, u.study_year, u.section, u.hostel_name,
            u.attendance_percent, lb.total_days, lb.used_days,
            lb.pending_days,
            GREATEST(lb.total_days - lb.used_days - lb.pending_days, 0) AS remaining_days,
            GREATEST(lb.used_days + lb.pending_days - lb.total_days, 0) AS over_quota_days
     FROM users u
     LEFT JOIN leave_balance lb ON lb.student_id=u.id
     WHERE u.role='student'
     ORDER BY u.full_name ASC, u.id ASC`
  );

exports.updateStudentRecord = async (studentId, attendance, totalDays) =>
  db.tx(async t => {
    const student = await t.oneOrNone(
      `SELECT id, full_name, email, student_number, attendance_percent
       FROM users
       WHERE id=$1 AND role='student'
       FOR UPDATE`,
      [studentId]
    );

    if (!student) {
      throw bad('Student account not found.', 404);
    }

    if (attendance !== undefined) {
      await t.none(
        `UPDATE users SET attendance_percent=$1 WHERE id=$2`,
        [attendance, studentId]
      );
    }

    if (totalDays !== undefined) {
      const balance = await t.oneOrNone(
        `SELECT used_days, pending_days
         FROM leave_balance
         WHERE student_id=$1
         FOR UPDATE`,
        [studentId]
      );

      if (!balance) {
        throw bad('Leave balance has not been configured.', 409);
      }

      if (
        totalDays <
        Number(balance.used_days) + Number(balance.pending_days || 0)
      ) {
        throw bad('Total leave days cannot be less than used and reserved days.', 409);
      }

      await t.none(
        `UPDATE leave_balance
         SET total_days=$1, updated_at=NOW()
         WHERE student_id=$2`,
        [totalDays, studentId]
      );
    }

    const updatedStudent = await t.one(
      `SELECT id, full_name, email, student_number, attendance_percent
       FROM users
       WHERE id=$1`,
      [studentId]
    );
    const balance = await t.oneOrNone(
      `SELECT total_days, used_days, pending_days,
              GREATEST(total_days - used_days - pending_days, 0) AS remaining_days,
              GREATEST(used_days + pending_days - total_days, 0) AS over_quota_days
       FROM leave_balance
       WHERE student_id=$1`,
      [studentId]
    );

    return { ...updatedStudent, ...balance };
  });
