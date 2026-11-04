
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

    const message = {
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
    };

    if (process.env.EMAIL_PROVIDER === 'apps-script') {
        const endpoint = process.env.APPS_SCRIPT_MAIL_URL;
        const secret = process.env.APPS_SCRIPT_MAIL_SECRET;

        if (!endpoint || !secret) {
            throw new Error(
                'Apps Script email is not configured. Set APPS_SCRIPT_MAIL_URL and APPS_SCRIPT_MAIL_SECRET.'
            );
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, ...message })
        });

        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error(`Apps Script email endpoint returned invalid JSON (HTTP ${response.status}).`);
        }

        if (!response.ok || result.ok !== true) {
            throw new Error(result.error || `Apps Script email request failed (HTTP ${response.status}).`);
        }
        return;
    }

    const transporter = createTransport();

    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
        ...message
    });
};
