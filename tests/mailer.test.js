jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue(undefined)
  }))
}));

const nodemailer = require('nodemailer');
const { sendVerificationEmail } = require('../utils/mailer');

describe('Verification email links', () => {
  const originalApiUrl = process.env.API_URL;
  const originalAppUrl = process.env.APP_URL;
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpUser = process.env.SMTP_USER;
  const originalSmtpPass = process.env.SMTP_PASS;

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_USER = 'test-user';
    process.env.SMTP_PASS = 'test-password';
  });

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalApiUrl;

    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
    if (originalSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = originalSmtpHost;
    if (originalSmtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = originalSmtpUser;
    if (originalSmtpPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = originalSmtpPass;
    jest.clearAllMocks();
  });

  test('targets the configured API host rather than the frontend host', async () => {
    process.env.API_URL = 'https://api.example.test/';
    process.env.APP_URL = 'https://portal.example.test';

    await sendVerificationEmail('student@example.test', 'Test Student', 'raw-token');

    const transport = nodemailer.createTransport.mock.results[0].value;
    const message = transport.sendMail.mock.calls[0][0];
    expect(message.text).toContain(
      'https://api.example.test/api/auth/verify-email?token=raw-token'
    );
    expect(message.html).toContain(
      'https://api.example.test/api/auth/verify-email?token=raw-token'
    );
  });

  test('falls back to APP_URL for local development', async () => {
    delete process.env.API_URL;
    process.env.APP_URL = 'http://localhost:3000';

    await sendVerificationEmail('student@example.test', 'Test Student', 'raw-token');

    const transport = nodemailer.createTransport.mock.results[0].value;
    const message = transport.sendMail.mock.calls[0][0];
    expect(message.text).toContain(
      'http://localhost:3000/api/auth/verify-email?token=raw-token'
    );
  });
});
