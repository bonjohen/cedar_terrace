import { config } from '../config';

export interface ActivationEmailData {
  email: string;
  activationToken: string;
  qrToken: string;
}

export interface NoticeIssuedEmailData {
  email: string;
  violationId: string;
  licensePlate: string;
  category: string;
  qrToken: string;
}

export function generateActivationEmail(data: ActivationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const activationUrl = `${config.email.recipientPortalUrl}/activate?token=${data.activationToken}`;
  const ticketUrl = `${config.email.recipientPortalUrl}/ticket/${data.qrToken}`;

  const subject = 'Activate Your Cedar Terrace Account';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #6200EE; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background-color: #6200EE; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .code { background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Cedar Terrace Parking</h1>
    </div>
    <div class="content">
      <h2>Activate Your Account</h2>
      <p>You've been issued a parking notice. To view your ticket details, please activate your account by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="${activationUrl}" class="button">Activate Account</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p><span class="code">${activationUrl}</span></p>
      <p>After activation, you can view your ticket at:</p>
      <p><span class="code">${ticketUrl}</span></p>
      <p><strong>This link expires in 24 hours.</strong></p>
    </div>
    <div class="footer">
      <p>Cedar Terrace Parking Enforcement</p>
      <p>Do not reply to this email. This inbox is not monitored.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Cedar Terrace Parking - Activate Your Account

You've been issued a parking notice. To view your ticket details, please activate your account.

Activation Link:
${activationUrl}

This link expires in 24 hours.

After activation, you can view your ticket at:
${ticketUrl}

---
Cedar Terrace Parking Enforcement
Do not reply to this email. This inbox is not monitored.
  `;

  return { subject, html, text };
}

export function generateNoticeIssuedEmail(data: NoticeIssuedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const ticketUrl = `${config.email.recipientPortalUrl}/ticket/${data.qrToken}`;

  const subject = `Parking Notice Issued - ${data.licensePlate}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #EF5350; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background-color: #6200EE; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .alert { background-color: #FFEBEE; border-left: 4px solid #EF5350; padding: 12px; margin: 16px 0; }
    .code { background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Parking Notice Issued</h1>
    </div>
    <div class="content">
      <div class="alert">
        <strong>A parking notice has been issued for vehicle: ${data.licensePlate}</strong>
      </div>
      <p><strong>Violation Category:</strong> ${data.category.replace(/_/g, ' ')}</p>
      <p>A notice has been placed on your vehicle. To view full details, deadlines, and resolution options, please visit your ticket page:</p>
      <p style="text-align: center;">
        <a href="${ticketUrl}" class="button">View Ticket Details</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p><span class="code">${ticketUrl}</span></p>
      <p><strong>Important:</strong></p>
      <ul>
        <li>Review the ticket details and evidence photos</li>
        <li>Note the payment and appeal deadlines</li>
        <li>Take action before escalation occurs</li>
      </ul>
    </div>
    <div class="footer">
      <p>Cedar Terrace Parking Enforcement</p>
      <p>Do not reply to this email. This inbox is not monitored.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Cedar Terrace Parking - Notice Issued

A parking notice has been issued for vehicle: ${data.licensePlate}

Violation Category: ${data.category.replace(/_/g, ' ')}

A notice has been placed on your vehicle. To view full details, deadlines, and resolution options, please visit your ticket page:

${ticketUrl}

Important:
- Review the ticket details and evidence photos
- Note the payment and appeal deadlines
- Take action before escalation occurs

---
Cedar Terrace Parking Enforcement
Do not reply to this email. This inbox is not monitored.
  `;

  return { subject, html, text };
}
