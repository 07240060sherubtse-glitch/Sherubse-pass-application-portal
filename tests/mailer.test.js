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
  const originalEmailProvider = process.env.EMAIL_PROVIDER;
  const originalAppsScriptUrl = process.env.APPS_SCRIPT_MAIL_URL;
  const originalAppsScriptSecret = process.env.APPS_SCRIPT_MAIL_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.EMAIL_PROVIDER;
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
    if (originalEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = originalEmailProvider;
    if (originalAppsScriptUrl === undefined) delete process.env.APPS_SCRIPT_MAIL_URL;
    else process.env.APPS_SCRIPT_MAIL_URL = originalAppsScriptUrl;
    if (originalAppsScriptSecret === undefined) delete process.env.APPS_SCRIPT_MAIL_SECRET;
    else process.env.APPS_SCRIPT_MAIL_SECRET = originalAppsScriptSecret;
    global.fetch = originalFetch;
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

  test('sends verification messages through the Apps Script HTTPS endpoint when configured', async () => {
    process.env.EMAIL_PROVIDER = 'apps-script';
    process.env.APPS_SCRIPT_MAIL_URL = 'https://script.google.com/macros/s/test/exec';
    process.env.APPS_SCRIPT_MAIL_SECRET = 'test-secret';
    process.env.API_URL = 'https://api.example.test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });

    await sendVerificationEmail('student@example.test', 'Test Student', 'raw-token');

    expect(global.fetch).toHaveBeenCalledWith(
      process.env.APPS_SCRIPT_MAIL_URL,
      expect.objectContaining({ method: 'POST' })
    );
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload).toEqual(expect.objectContaining({
      secret: 'test-secret',
      to: 'student@example.test',
      subject: 'Verify your Sherubtse Pass Portal email'
    }));
    expect(payload.text).toContain(
      'https://api.example.test/api/auth/verify-email?token=raw-token'
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  test('reports rejected Apps Script email requests', async () => {
    process.env.EMAIL_PROVIDER = 'apps-script';
    process.env.APPS_SCRIPT_MAIL_URL = 'https://script.google.com/macros/s/test/exec';
    process.env.APPS_SCRIPT_MAIL_SECRET = 'test-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: 'Email quota exceeded.' })
    });

    await expect(
      sendVerificationEmail('student@example.test', 'Test Student', 'raw-token')
    ).rejects.toThrow('Email quota exceeded.');
  });
});
