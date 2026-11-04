jest.mock('../config/db', () => ({}));

const db = require('../config/db');
const Leave = require('../models/leaveModel');
const { daysBetween } = Leave;
db.tx = jest.fn();
db.any = jest.fn();

const transaction = {
  any: jest.fn(),
  none: jest.fn(),
  one: jest.fn(),
  oneOrNone: jest.fn()
};

function prepareCreateRequest({
  attendance = 100,
  balance,
  student = {
    id: 11,
    attendance_percent: attendance,
    course: 'BSc Chemistry',
    study_year: 'Year 2',
    section: null,
    hostel_name: 'Dekiling'
  }
} = {}) {
  transaction.oneOrNone.mockResolvedValueOnce(student);
  const sectionRequired = (
    student.course === 'BSc Life Sciences' &&
    ['Year 1', 'Year 2', 'Year 3'].includes(student.study_year)
  ) || (
    student.course === 'DSDA' &&
    ['Year 1', 'Year 2', 'Year 3', 'Year 4'].includes(student.study_year)
  );
  const profileComplete = student.course && student.study_year &&
    student.hostel_name && (!sectionRequired || student.section);

  if (profileComplete) {
    transaction.oneOrNone
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(balance);
  }
  transaction.any.mockResolvedValue([]);
  transaction.none.mockResolvedValue(undefined);
  transaction.one.mockResolvedValue({ id: 42 });
  db.tx.mockImplementation(work => work(transaction));
}

describe('Leave day calculation', () => {
  test('counts both start and end dates', () => expect(daysBetween('2027-01-10','2027-01-10')).toBe(1));
  test('counts a multi-day leave inclusively', () => expect(daysBetween('2027-01-10','2027-01-12')).toBe(3));
});

describe('Leave quota rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not block an otherwise eligible request based on attendance', async () => {
    prepareCreateRequest({
      attendance: 70,
      balance: { total_days: 1, used_days: 0, pending_days: 0 }
    });

    await expect(Leave.createRequest(11, {
      leaveType: 'Personal',
      startDate: '2027-01-11',
      endDate: '2027-01-11',
      reason: 'Personal matter'
    })).resolves.toEqual({ id: 42 });
  });

  test('blocks non-emergency requests over the remaining quota', async () => {
    prepareCreateRequest({
      balance: { total_days: 1, used_days: 0, pending_days: 0 }
    });

    await expect(Leave.createRequest(11, {
      leaveType: 'Personal',
      startDate: '2027-01-11',
      endDate: '2027-01-12',
      reason: 'Personal matter'
    })).rejects.toMatchObject({
      status: 400,
      message: 'Not enough leave balance. Available: 1 working day(s).'
    });
  });

  test('blocks leave applications until the student profile is complete', async () => {
    prepareCreateRequest({
      student: {
        id: 11,
        course: null,
        study_year: null,
        section: null,
        hostel_name: null
      },
      balance: { total_days: 10, used_days: 0, pending_days: 0 }
    });

    await expect(Leave.createRequest(11, {
      leaveType: 'Personal',
      startDate: '2027-01-11',
      endDate: '2027-01-11',
      reason: 'Personal matter'
    })).rejects.toMatchObject({
      status: 400,
      message: 'Complete your student profile (course, year, section if applicable, and hostel) before applying for leave.'
    });

    expect(transaction.oneOrNone).toHaveBeenCalledTimes(1);
  });

  test('requires a section in a split-programme year before accepting leave', async () => {
    prepareCreateRequest({
      student: {
        id: 11,
        course: 'DSDA',
        study_year: 'Year 2',
        section: null,
        hostel_name: 'Dekiling'
      },
      balance: { total_days: 10, used_days: 0, pending_days: 0 }
    });

    await expect(Leave.createRequest(11, {
      leaveType: 'Personal',
      startDate: '2027-01-11',
      endDate: '2027-01-11',
      reason: 'Personal matter'
    })).rejects.toMatchObject({
      status: 400,
      message: 'Complete your student profile (course, year, section if applicable, and hostel) before applying for leave.'
    });
  });

  test('accepts an emergency request over quota and marks it for DSA review', async () => {
    prepareCreateRequest({
      balance: { total_days: 0, used_days: 0, pending_days: 0 }
    });

    await Leave.createRequest(11, {
      leaveType: 'Emergency',
      startDate: '2027-01-11',
      endDate: '2027-01-11',
      reason: 'Urgent family emergency'
    });

    expect(transaction.one.mock.calls[0][1][6]).toBe(true);
  });

  test('requires and records a reason for a DSA quota override', async () => {
    const request = {
      id: 42,
      student_id: 11,
      leave_type: 'Emergency',
      leave_days: 2,
      quota_exceeded: true,
      status: 'pending_dsa'
    };
    transaction.oneOrNone
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce({
        total_days: 1,
        used_days: 0,
        pending_days: 2
      });
    db.tx.mockImplementation(work => work(transaction));

    await expect(Leave.decide(42, { id: 5, role: 'dsa' }, 'approved'))
      .rejects.toThrow('A DSA override reason is required');

    transaction.oneOrNone
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce({
        total_days: 1,
        used_days: 0,
        pending_days: 2
      });
    transaction.none.mockResolvedValue(undefined);
    transaction.one.mockResolvedValue(request);

    await Leave.decide(
      42,
      { id: 5, role: 'dsa' },
      'approved',
      '',
      'Urgent medical emergency'
    );

    expect(transaction.none.mock.calls[2][1][4])
      .toBe('Quota override reason: Urgent medical emergency');
  });

  test('does not let a normal request push the balance over quota', async () => {
    transaction.oneOrNone
      .mockResolvedValueOnce({
        id: 43,
        student_id: 11,
        leave_type: 'Personal',
        leave_days: 1,
        quota_exceeded: false,
        status: 'pending_dsa'
      })
      .mockResolvedValueOnce({
        total_days: 1,
        used_days: 0,
        pending_days: 2
      });
    db.tx.mockImplementation(work => work(transaction));

    await expect(Leave.decide(
      43,
      { id: 5, role: 'dsa' },
      'approved'
    )).rejects.toThrow('Only emergency requests can exceed the leave quota.');
  });

  test('sorts emergency requests ahead of normal staff requests', async () => {
    db.any.mockResolvedValue([]);

    await Leave.listRequests({ id: 5, role: 'sso' });

    expect(db.any.mock.calls[0][0]).toContain(
      "CASE WHEN LOWER(lr.leave_type)='emergency' THEN 0 ELSE 1 END"
    );
    expect(db.any.mock.calls[0][0]).toContain(
      "CASE WHEN LOWER(lr.leave_type)='emergency'"
    );
  });
});
