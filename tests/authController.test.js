jest.mock('../models/authModel', () => ({
  createStudent: jest.fn(),
  setVerificationToken: jest.fn(),
  updateStudentProfile: jest.fn(),
  publicUser: jest.fn(user => user)
}));
jest.mock('../utils/mailer', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined)
}));

const Auth = require('../models/authModel');
const mailer = require('../utils/mailer');
const authController = require('../controllers/authController');

function response() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  return res;
}

describe('Student profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers with the original account fields without requiring a profile', async () => {
    const req = {
      body: {
        fullName: 'Test Student',
        email: 'student@example.com',
        studentNumber: 'STU-001',
        password: 'secure-password'
      }
    };
    const res = response();
    Auth.createStudent.mockResolvedValue({
      id: 17,
      email: 'student@example.com',
      full_name: 'Test Student'
    });
    Auth.setVerificationToken.mockResolvedValue(undefined);

    await authController.register(req, res);

    expect(res.statusCode).toBe(201);
    expect(Auth.createStudent).toHaveBeenCalledWith({
      fullName: 'Test Student',
      email: 'student@example.com',
      studentNumber: 'STU-001',
      password: 'secure-password'
    });
    expect(mailer.sendVerificationEmail).toHaveBeenCalled();
  });

  test('validates and saves a student-owned profile update', async () => {
    const profile = {
      course: 'DSDA',
      year: 'Year 2',
      section: 'A',
      hostel: 'Dekiling'
    };
    Auth.updateStudentProfile.mockResolvedValue({
      id: 17,
      role: 'student',
      ...profile
    });
    const req = {
      user: { id: 17, role: 'student' },
      body: profile
    };
    const res = response();

    await authController.updateProfile(req, res);

    expect(Auth.updateStudentProfile).toHaveBeenCalledWith(17, profile);
    expect(res.body.user).toMatchObject(profile);
  });

  test('rejects incomplete profile updates without writing to the database', async () => {
    const req = {
      user: { id: 17, role: 'student' },
      body: { course: 'BSc Chemistry', year: '', hostel: 'Dekiling' }
    };
    const res = response();

    await authController.updateProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Year is required.');
    expect(Auth.updateStudentProfile).not.toHaveBeenCalled();
  });

  test('requires a timetable section for sectioned programme years', async () => {
    const req = {
      user: { id: 17, role: 'student' },
      body: { course: 'DSDA', year: 'Year 2', hostel: 'Dekiling' }
    };
    const res = response();

    await authController.updateProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Select a valid section for this course and year.');
    expect(Auth.updateStudentProfile).not.toHaveBeenCalled();
  });

  test('rejects hostel and section values outside the dropdown options', async () => {
    const req = {
      user: { id: 17, role: 'student' },
      body: {
        course: 'BSc Chemistry',
        year: 'Year 2',
        section: 'A',
        hostel: 'Dekiling'
      }
    };
    const res = response();

    await authController.updateProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('This course and year do not have a section in the timetable.');
    expect(Auth.updateStudentProfile).not.toHaveBeenCalled();
  });

  test('rejects hostel values outside the dropdown options', async () => {
    const req = {
      user: { id: 17, role: 'student' },
      body: {
        course: 'BSc Chemistry',
        year: 'Year 2',
        hostel: 'Hostel A'
      }
    };
    const res = response();

    await authController.updateProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Select a valid hostel.');
    expect(Auth.updateStudentProfile).not.toHaveBeenCalled();
  });
});
