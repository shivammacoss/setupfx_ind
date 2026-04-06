const EmailTemplate = require('../models/EmailTemplate');

const DEFAULT_BRAND = 'SetupFX';

const DEFAULT_TEMPLATES = [
  {
    slug: 'signup_otp',
    name: 'Signup verification (OTP)',
    description: 'Sent when a user requests a verification code during registration.',
    subject: 'Your {{brandName}} verification code',
    variableKeys: ['code', 'otp', 'expiryMinutes', 'brandName'],
    order: 1,
    htmlBody: `<p>Your signup verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p>
<p>This code expires in <strong>{{expiryMinutes}} minutes</strong>.</p>
<p>If you did not request this, you can ignore this email.</p>`,
    textBody:
      'Your signup verification code is: {{code}}\n\nIt expires in {{expiryMinutes}} minutes. If you did not request this, ignore this email.'
  },
  {
    slug: 'password_reset',
    name: 'Password reset (OTP)',
    description: 'Sent when a user requests a password reset code.',
    subject: 'Your {{brandName}} password reset code',
    variableKeys: ['code', 'otp', 'expiryMinutes', 'brandName'],
    order: 2,
    htmlBody: `<p>Your password reset code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p>
<p>This code expires in <strong>{{expiryMinutes}} minutes</strong>.</p>
<p>If you did not request a reset, ignore this email.</p>`,
    textBody:
      'Your password reset code is: {{code}}\n\nIt expires in {{expiryMinutes}} minutes. If you did not request a reset, ignore this email.'
  },
  {
    slug: 'welcome',
    name: 'Welcome email',
    description: 'Sent after successful signup / email verification (optional future use).',
    subject: 'Welcome to {{brandName}}',
    variableKeys: ['userName', 'loginUrl', 'brandName'],
    order: 3,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Welcome to <strong>{{brandName}}</strong>.</p><p>You can log in here: <a href="{{loginUrl}}">{{loginUrl}}</a></p>',
    textBody: 'Hi {{userName}},\n\nWelcome to {{brandName}}.\nLog in: {{loginUrl}}'
  },
  {
    slug: 'account_banned',
    name: 'Account banned',
    description: 'Notify user that their account has been restricted.',
    subject: 'Your {{brandName}} account has been suspended',
    variableKeys: ['userName', 'reason', 'brandName', 'supportEmail'],
    order: 4,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your account has been suspended.</p><p><strong>Reason:</strong> {{reason}}</p><p>Contact: {{supportEmail}}</p>',
    textBody: 'Hi {{userName}},\n\nYour account has been suspended.\nReason: {{reason}}\nSupport: {{supportEmail}}'
  },
  {
    slug: 'account_unbanned',
    name: 'Account restored',
    description: 'Notify user that their account is active again.',
    subject: 'Your {{brandName}} account is active again',
    variableKeys: ['userName', 'brandName', 'loginUrl'],
    order: 5,
    htmlBody: '<p>Hi {{userName}},</p><p>Your account has been restored. You can log in at <a href="{{loginUrl}}">{{loginUrl}}</a>.</p>',
    textBody: 'Hi {{userName}},\n\nYour account has been restored.\nLogin: {{loginUrl}}'
  },
  {
    slug: 'deposit_approved',
    name: 'Deposit approved',
    description: 'Sent when a deposit request is approved.',
    subject: 'Deposit confirmed — {{brandName}}',
    variableKeys: ['userName', 'amount', 'currency', 'brandName'],
    order: 6,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your deposit of <strong>{{amount}} {{currency}}</strong> has been credited.</p>',
    textBody: 'Hi {{userName}},\n\nYour deposit of {{amount}} {{currency}} has been credited.'
  },
  {
    slug: 'withdrawal_approved',
    name: 'Withdrawal approved',
    description: 'Sent when a withdrawal is processed.',
    subject: 'Withdrawal processed — {{brandName}}',
    variableKeys: ['userName', 'amount', 'currency', 'brandName'],
    order: 7,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your withdrawal of <strong>{{amount}} {{currency}}</strong> has been processed.</p>',
    textBody: 'Hi {{userName}},\n\nYour withdrawal of {{amount}} {{currency}} has been processed.'
  }
];

function interpolate(str, vars) {
  if (!str) return '';
  const merged = { brandName: DEFAULT_BRAND, ...vars };
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = merged[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

async function seedMissingTemplates() {
  let created = 0;
  for (const t of DEFAULT_TEMPLATES) {
    const exists = await EmailTemplate.findOne({ slug: t.slug });
    if (!exists) {
      await EmailTemplate.create({ ...t, enabled: true });
      created += 1;
    }
  }
  return created;
}

async function resetAndSeed() {
  await EmailTemplate.deleteMany({});
  await EmailTemplate.insertMany(DEFAULT_TEMPLATES.map((t) => ({ ...t, enabled: true })));
  return DEFAULT_TEMPLATES.length;
}

function renderTemplateDoc(doc, vars) {
  if (!doc) return null;
  return {
    subject: interpolate(doc.subject, vars),
    text: interpolate(doc.textBody || '', vars),
    html: interpolate(doc.htmlBody || '', vars)
  };
}

/**
 * @returns {{ subject: string, text: string, html: string } | null}
 */
async function getRenderedForSend(slug, vars) {
  const doc = await EmailTemplate.findOne({ slug: String(slug).toLowerCase().trim() });
  if (!doc || !doc.enabled) return null;
  return renderTemplateDoc(doc, vars);
}

function sampleVariablesForSlug(slug) {
  const base = {
    code: '123456',
    otp: '123456',
    expiryMinutes: '10',
    brandName: DEFAULT_BRAND,
    supportEmail: 'support@example.com',
    userName: 'Demo User',
    loginUrl: 'https://example.com/login',
    reason: 'Policy review',
    amount: '1,000.00',
    currency: 'USD'
  };
  const s = String(slug).toLowerCase();
  if (s === 'password_reset') return { ...base, expiryMinutes: '15' };
  return base;
}

module.exports = {
  DEFAULT_TEMPLATES,
  interpolate,
  seedMissingTemplates,
  resetAndSeed,
  getRenderedForSend,
  renderTemplateDoc,
  sampleVariablesForSlug
};
