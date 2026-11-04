require('dotenv').config();

const { sendVerificationEmail } = require('./utils/mailer');

async function testEmail() {
    try {
        console.log('Sending test verification email...');

        await sendVerificationEmail(
            process.env.SMTP_USER,
            'Test User',
            'test-verification-token-123'
        );

        console.log('SUCCESS: Email sent successfully!');
    } catch (error) {
        console.log('FAILED: Email could not be sent.');
        console.log(error.message);
    }
}

testEmail();