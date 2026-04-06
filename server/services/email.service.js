const nodemailer = require('nodemailer');
const emailTemplateService = require('./emailTemplate.service');

function trimEnv(v) {
  if (v == null || v === undefined) return '';
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Parsed SMTP settings (trimmed). Use for health checks without exposing secrets. */
function getSmtpConfig() {
  const host = trimEnv(process.env.SMTP_HOST);
  const user = trimEnv(process.env.SMTP_USER);
  const pass = trimEnv(process.env.SMTP_PASS);
  const rawPort = trimEnv(process.env.SMTP_PORT);
  const portNum = Number(rawPort || 465);
  const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 465;

  const sec = trimEnv(process.env.SMTP_SECURE).toLowerCase();
  let secure;
  if (sec === 'true') secure = true;
  else if (sec === 'false') secure = false;
  else secure = port === 465;

  return { host, user, pass, port, secure };
}

function isSmtpConfigured() {
  const { host, user, pass } = getSmtpConfig();
  return !!(host && user && pass);
}

function formatSmtpError(err) {
  const bits = [];
  if (err?.message) bits.push(err.message);
  if (err?.response) bits.push(String(err.response).trim());
  if (err?.responseCode != null) bits.push(`SMTP ${err.responseCode}`);
  if (err?.command) bits.push(`(${err.command})`);
  return bits.filter(Boolean).join(' — ') || 'SMTP error';
}

function createTransport() {
  const { host, user, pass, port, secure } = getSmtpConfig();
  if (!host || !user || !pass) return null;

  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

  const options = {
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
    socketTimeout: 45_000,
    tls: {
      rejectUnauthorized,
      minVersion: 'TLSv1.2',
      servername: host
    }
  };

  // Port 587 (and similar submission ports): STARTTLS — must not use implicit TLS (secure: false).
  if (!secure && (port === 587 || port === 2587)) {
    options.requireTLS = true;
  }

  if (process.env.SMTP_DEBUG === 'true') {
    options.debug = true;
    options.logger = true;
  }

  return nodemailer.createTransport(options);
}

function fromAddress() {
  const name = trimEnv(process.env.SMTP_FROM_NAME) || 'SetupFX';
  const addr = trimEnv(process.env.SMTP_FROM) || trimEnv(process.env.SMTP_USER);
  return `"${name}" <${addr}>`;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = createTransport();
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  try {
    await transporter.sendMail({
      from: fromAddress(),
      to,
      subject,
      text: text || undefined,
      html: html || text || undefined
    });
  } catch (err) {
    throw new Error(formatSmtpError(err));
  }
}

async function verifySmtpConnection() {
  const transporter = createTransport();
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  try {
    await transporter.verify();
  } catch (err) {
    const cfg = getSmtpConfig();
    let hint = '';
    if (cfg.port === 587 && cfg.secure) {
      hint = ' For port 587 use STARTTLS: set SMTP_SECURE=false in .env.';
    } else if (cfg.port === 465 && !cfg.secure) {
      hint = ' For port 465 use implicit SSL: set SMTP_SECURE=true in .env.';
    }
    throw new Error(formatSmtpError(err) + hint);
  }
}

function getSmtpStatusForAdmin() {
  const { host, user, port, secure } = getSmtpConfig();
  const mask =
    user && user.includes('@')
      ? `${user.slice(0, 2)}***@${user.split('@')[1]}`
      : user
        ? '***'
        : '';
  return {
    host: host || null,
    port,
    secure,
    userHint: mask,
    configured: isSmtpConfigured()
  };
}

async function sendSignupOtpEmail(to, code) {
  const vars = { code, otp: code, expiryMinutes: '10' };
  const rendered = await emailTemplateService.getRenderedForSend('signup_otp', vars);
  if (rendered) {
    await sendMail({
      to,
      subject: rendered.subject,
      text: rendered.text || `Your signup verification code is: ${code}`,
      html: rendered.html || rendered.text
    });
    return;
  }
  const subject = 'Your SetupFX verification code';
  const text = `Your signup verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `
    <p>Your signup verification code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>This code expires in <strong>10 minutes</strong>.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  await sendMail({ to, subject, text, html });
}

async function sendPasswordResetOtpEmail(to, code) {
  const vars = { code, otp: code, expiryMinutes: '15' };
  const rendered = await emailTemplateService.getRenderedForSend('password_reset', vars);
  if (rendered) {
    await sendMail({
      to,
      subject: rendered.subject,
      text: rendered.text || `Your password reset code is: ${code}`,
      html: rendered.html || rendered.text
    });
    return;
  }
  const subject = 'Your SetupFX password reset code';
  const text = `Your password reset code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`;
  const html = `
    <p>Your password reset code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>This code expires in <strong>15 minutes</strong>.</p>
    <p>If you did not request a reset, ignore this email.</p>
  `;
  await sendMail({ to, subject, text, html });
}

module.exports = {
  isSmtpConfigured,
  createTransport,
  verifySmtpConnection,
  sendMail,
  sendSignupOtpEmail,
  sendPasswordResetOtpEmail,
  getSmtpConfig,
  getSmtpStatusForAdmin
};
