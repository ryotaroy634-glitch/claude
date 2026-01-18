const nodemailer = require('nodemailer');
const db = require('./database');

let transporter = null;

// Initialize email transporter based on environment variables
function initializeTransporter() {
  if (transporter) return transporter;

  const config = getMailConfig();
  if (!config) {
    console.log('Email notifications disabled: No mail configuration found');
    return null;
  }

  transporter = nodemailer.createTransport(config);
  return transporter;
}

// Get mail configuration from environment variables
function getMailConfig() {
  // SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    };
  }

  // Gmail
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    };
  }

  // Generic SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };
  }

  // AWS SES
  if (process.env.AWS_SES_REGION) {
    return {
      host: `email-smtp.${process.env.AWS_SES_REGION}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: {
        user: process.env.AWS_SES_ACCESS_KEY,
        pass: process.env.AWS_SES_SECRET_KEY
      }
    };
  }

  return null;
}

// Format items into email content
function formatEmailContent(items) {
  if (!items || items.length === 0) {
    return null;
  }

  // Group items by category
  const byCategory = {};
  for (const item of items) {
    const category = item.category || 'Other';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(item);
  }

  // Build HTML content
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
    h2 { color: #4f46e5; margin-top: 30px; }
    .item { margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1; }
    .item-title { font-size: 16px; font-weight: 600; margin: 0 0 5px 0; }
    .item-title a { color: #1e40af; text-decoration: none; }
    .item-title a:hover { text-decoration: underline; }
    .item-meta { font-size: 13px; color: #64748b; margin-bottom: 8px; }
    .item-summary { font-size: 14px; color: #475569; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>RSS Update - ${items.length} new article${items.length > 1 ? 's' : ''}</h1>
`;

  for (const [category, categoryItems] of Object.entries(byCategory)) {
    html += `<h2>${escapeHtml(category)}</h2>`;
    for (const item of categoryItems) {
      const pubDate = item.published_at ? new Date(item.published_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';

      html += `
      <div class="item">
        <p class="item-title"><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></p>
        <p class="item-meta">${item.source_icon || ''} ${escapeHtml(item.source_name || '')} ${pubDate ? `- ${pubDate}` : ''}</p>
        ${item.summary ? `<p class="item-summary">${escapeHtml(truncate(item.summary, 200))}</p>` : ''}
      </div>
`;
    }
  }

  html += `
  <div class="footer">
    <p>This is an automated notification from your RSS Reader.</p>
    <p>To unsubscribe, update your notification settings in the app.</p>
  </div>
</body>
</html>
`;

  // Build plain text content
  let text = `RSS Update - ${items.length} new article${items.length > 1 ? 's' : ''}\n\n`;

  for (const [category, categoryItems] of Object.entries(byCategory)) {
    text += `=== ${category} ===\n\n`;
    for (const item of categoryItems) {
      const pubDate = item.published_at ? new Date(item.published_at).toLocaleString() : '';
      text += `${item.source_icon || ''} ${item.source_name || ''}\n`;
      text += `${item.title}\n`;
      if (pubDate) text += `${pubDate}\n`;
      text += `${item.link}\n`;
      if (item.summary) text += `${truncate(item.summary, 200)}\n`;
      text += `\n---\n\n`;
    }
  }

  text += `\nThis is an automated notification from your RSS Reader.`;

  return { html, text };
}

// Send notification email
async function sendNotificationEmail(items) {
  if (!items || items.length === 0) {
    console.log('No items to notify');
    return { success: false, reason: 'no_items' };
  }

  const transport = initializeTransporter();
  if (!transport) {
    console.log('Email transport not configured');
    return { success: false, reason: 'not_configured' };
  }

  const fromEmail = process.env.MAIL_FROM || process.env.GMAIL_USER || 'rss@example.com';
  const toEmail = process.env.MAIL_TO;

  if (!toEmail) {
    console.log('MAIL_TO not configured');
    return { success: false, reason: 'no_recipient' };
  }

  const content = formatEmailContent(items);
  if (!content) {
    return { success: false, reason: 'no_content' };
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const mailOptions = {
    from: fromEmail,
    to: toEmail,
    subject: `RSS Update ${dateStr} ${timeStr} - ${items.length} new article${items.length > 1 ? 's' : ''}`,
    text: content.text,
    html: content.html
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`Notification email sent: ${info.messageId}`);

    // Mark items as notified
    const itemIds = items.map(item => item.id);
    db.markItemsAsNotified(itemIds);

    return { success: true, messageId: info.messageId, itemCount: items.length };
  } catch (error) {
    console.error('Failed to send notification email:', error.message);
    return { success: false, reason: 'send_failed', error: error.message };
  }
}

// Run notification cycle
async function runNotificationCycle() {
  const unnotifiedItems = db.getUnnotifiedItems();

  if (unnotifiedItems.length === 0) {
    console.log('No new items to notify');
    return { success: true, reason: 'no_items', itemCount: 0 };
  }

  console.log(`Found ${unnotifiedItems.length} unnotified items`);
  return await sendNotificationEmail(unnotifiedItems);
}

// Helper functions
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(str, length) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

// Verify email configuration
async function verifyEmailConfig() {
  const transport = initializeTransporter();
  if (!transport) {
    return { configured: false, reason: 'no_config' };
  }

  try {
    await transport.verify();
    return { configured: true, verified: true };
  } catch (error) {
    return { configured: true, verified: false, error: error.message };
  }
}

module.exports = {
  initializeTransporter,
  sendNotificationEmail,
  runNotificationCycle,
  verifyEmailConfig,
  formatEmailContent
};
