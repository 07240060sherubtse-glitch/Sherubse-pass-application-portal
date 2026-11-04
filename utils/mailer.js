
const nodemailer = require('nodemailer');

function createTransport() {
    const port = Number(process.env.SMTP_PORT || 587);

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {
        throw new Error(
            'Email is not configured. Check SMTP_HOST, SMTP_USER and SMTP_PASS in .env.'
        );
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: port,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

exports.sendVerificationEmail = async (email, fullName, token) => {
    const base = (process.env.API_URL || process.env.APP_URL || 'http://localhost:3000')
        .replace(/\/$/, '');

    const link = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

    const safeName = String(fullName).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);

    const transporter = createTransport();

    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Verify your Sherubtse Pass Portal email',

        text: `Hello ${fullName},

Please verify your email address by opening this link:

${link}

This link expires in 24 hours. If you did not create this account, ignore this email.`,

        html: `
            <p>Hello ${safeName},</p>
            <p>Please verify your email address to activate your Sherubtse Pass Portal account.</p>
            <p><a href="${link}">Verify email address</a></p>
            <p>This link expires in 24 hours.</p>
        `
    });
};
