function doGet() {
  return json({ ok: true, service: 'Sherubtse Portal Email' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const expectedSecret = PropertiesService.getScriptProperties()
      .getProperty('APPS_SCRIPT_MAIL_SECRET');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return json({ ok: false, error: 'Unauthorized mail request.' });
    }
    if (!payload.to || !payload.subject || !payload.text || !payload.html) {
      return json({ ok: false, error: 'Missing required email fields.' });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return json({ ok: false, error: 'Daily email quota exceeded.' });
    }

    MailApp.sendEmail({
      to: payload.to,
      subject: payload.subject,
      body: payload.text,
      htmlBody: payload.html,
      name: 'Sherubtse Pass Portal'
    });

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    const message = error && error.message
      ? error.message
      : 'Unknown Apps Script error.';
    return json({ ok: false, error: message });
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
