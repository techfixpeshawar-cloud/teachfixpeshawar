import nodemailer from 'nodemailer';
import { getAdminFirestore } from '../firebaseAdmin';

export interface EmailSettings {
  provider: 'auto' | 'resend' | 'gmail_smtp' | 'smtp';
  senderEmail: string;
  adminEmail: string;
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  updatedAt?: string;
}

export interface SafeEmailSettings {
  provider: 'auto' | 'resend' | 'gmail_smtp' | 'smtp';
  senderEmail: string;
  adminEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  resendApiKeyConfigured: boolean;
  smtpPasswordConfigured: boolean;
  gmailAppPasswordConfigured: boolean;
}

export interface SendEmailOptions {
  to?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  preferredProvider?: 'auto' | 'resend' | 'gmail_smtp' | 'smtp';
  customResendKey?: string;
  customGmailUser?: string;
  customGmailPass?: string;
}

export interface SendEmailResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  failoverNote?: string;
  sentTo: string;
  sentAt: string;
}

const SETTINGS_EMAIL_DOC = 'email';

/**
 * Clean & sanitize subject line to avoid heuristic spam triggers
 */
export function sanitizeEmailSubject(rawSubject: string): string {
  if (!rawSubject) return 'TechFix Peshawar On-Site Service Notification';
  return rawSubject
    .replace(/\[VERIFIED TEST\]/gi, 'TechFix Verification Test:')
    .replace(/\[TEST\]/gi, 'TechFix Test:')
    .replace(/\[URGENT\]/gi, 'Priority Notice:')
    .replace(/\[CONFIRMED\]/gi, 'Appointment Confirmed:')
    .replace(/\[LEAD INQUIRY\]/gi, 'Customer Inquiry:')
    .replace(/\[RESENT INQUIRY\]/gi, 'Inquiry Update:')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Standard CAN-SPAM deliverability footer
 */
export function generateEmailFooterHtml(recipientEmail?: string): string {
  return `
  <!-- Deliverability & Authenticity Footer -->
  <div style="background-color:#090d16; padding:20px 24px; text-align:center; border-top:1px solid #1e293b; font-size:11px; color:#64748b; line-height:1.6;">
    <p style="margin:0 0 6px 0; font-weight:700; color:#cbd5e1; letter-spacing:0.3px;">
      TechFix On-Site Computer Support & Hardware Diagnostics
    </p>
    <p style="margin:0 0 6px 0; color:#94a3b8;">
      University Town, Saddar & Hayatabad, Peshawar, Khyber Pakhtunkhwa, Pakistan • Helpline: +92 327 5526107
    </p>
    <p style="margin:0; font-size:10px; color:#64748b;">
      Authentic transactional service notification${recipientEmail ? ` for ${recipientEmail}` : ''}.
    </p>
  </div>
  `;
}

/**
 * Load complete email settings (Server-side privileged only)
 * Priority: Firestore 'settings/email' -> Environment variables -> Defaults
 */
export async function getFullEmailSettings(): Promise<EmailSettings> {
  let firestoreData: any = {};
  try {
    const db = getAdminFirestore();
    const docSnap = await db.collection('settings').doc(SETTINGS_EMAIL_DOC).get();
    if (docSnap.exists) {
      firestoreData = docSnap.data() || {};
    }
  } catch (err: any) {
    console.warn('[EMAIL SERVICE] Firestore settings load note:', err?.message || err);
  }

  // Resolve with fallback to environment variables
  const provider = (
    firestoreData.provider ||
    process.env.EMAIL_PROVIDER ||
    'auto'
  ) as 'auto' | 'resend' | 'gmail_smtp' | 'smtp';

  const resendApiKey = (
    firestoreData.resendApiKey ||
    process.env.RESEND_API_KEY ||
    ''
  ).trim();

  const senderEmail = (
    firestoreData.senderEmail ||
    process.env.RESEND_FROM ||
    process.env.FROM_EMAIL ||
    'Peshawar Tech Support <onboarding@resend.dev>'
  ).trim();

  const adminEmail = (
    firestoreData.adminEmail ||
    process.env.TARGET_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.NOTIFICATION_TARGET_EMAIL ||
    'techfixpeshawar@gmail.com'
  ).trim();

  let smtpHost = (
    firestoreData.smtpHost ||
    process.env.SMTP_HOST ||
    'smtp.gmail.com'
  ).trim().replace(/^[a-zA-Z]+:\/\//, '').replace(/\/+$/, '');
  if (!smtpHost || smtpHost === 'gmail.com') smtpHost = 'smtp.gmail.com';

  const smtpPort = parseInt(
    String(firestoreData.smtpPort || process.env.SMTP_PORT || '465'),
    10
  );

  const smtpUser = (
    firestoreData.smtpUser ||
    process.env.GMAIL_USER ||
    process.env.GMAIL_ADDRESS ||
    process.env.SMTP_USER ||
    'techfixpeshawar@gmail.com'
  ).trim();

  const smtpPassword = (
    firestoreData.smtpPassword ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GOOGLE_APP_PASSWORD ||
    process.env.SMTP_PASSWORD ||
    process.env.SMTP_PASS ||
    ''
  ).trim().replace(/\s+/g, '');

  return {
    provider,
    senderEmail,
    adminEmail,
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    updatedAt: firestoreData.updatedAt
  };
}

/**
 * Returns safe metadata for Admin Panel UI — NEVER leaks actual keys or passwords!
 */
export async function getSafeEmailSettings(): Promise<SafeEmailSettings> {
  const full = await getFullEmailSettings();
  return {
    provider: full.provider,
    senderEmail: full.senderEmail,
    adminEmail: full.adminEmail,
    smtpHost: full.smtpHost || 'smtp.gmail.com',
    smtpPort: full.smtpPort || 465,
    smtpUser: full.smtpUser || 'techfixpeshawar@gmail.com',
    resendApiKeyConfigured: !!(full.resendApiKey && full.resendApiKey.length >= 10),
    smtpPasswordConfigured: !!(full.smtpPassword && full.smtpPassword.length >= 8),
    gmailAppPasswordConfigured: !!(full.smtpPassword && full.smtpPassword.length === 16),
  };
}

/**
 * Save email settings from Admin Panel.
 * If credentials are left blank, existing saved values in Firestore are preserved!
 */
export async function saveEmailSettings(incoming: {
  provider?: 'auto' | 'resend' | 'gmail_smtp' | 'smtp';
  senderEmail?: string;
  adminEmail?: string;
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  gmailAppPassword?: string;
  clearResendApiKey?: boolean;
  clearSmtpPassword?: boolean;
}): Promise<SafeEmailSettings> {
  const current = await getFullEmailSettings();

  const updated: Partial<EmailSettings> = {
    provider: incoming.provider || current.provider,
    senderEmail: incoming.senderEmail ? incoming.senderEmail.trim() : current.senderEmail,
    adminEmail: incoming.adminEmail ? incoming.adminEmail.trim() : current.adminEmail,
    smtpHost: incoming.smtpHost ? incoming.smtpHost.trim() : current.smtpHost,
    smtpPort: incoming.smtpPort ? Number(incoming.smtpPort) : current.smtpPort,
    smtpUser: incoming.smtpUser ? incoming.smtpUser.trim() : current.smtpUser,
    updatedAt: new Date().toISOString()
  };

  // Handle Resend API Key:
  if (incoming.clearResendApiKey) {
    updated.resendApiKey = '';
  } else if (incoming.resendApiKey && incoming.resendApiKey.trim().length > 0) {
    updated.resendApiKey = incoming.resendApiKey.trim();
  } else {
    // Preserve existing key
    updated.resendApiKey = current.resendApiKey;
  }

  // Handle SMTP / Gmail App Password:
  const incomingPassword = (incoming.smtpPassword || incoming.gmailAppPassword || '').trim().replace(/\s+/g, '');
  if (incoming.clearSmtpPassword) {
    updated.smtpPassword = '';
  } else if (incomingPassword.length > 0) {
    updated.smtpPassword = incomingPassword;
  } else {
    // Preserve existing password
    updated.smtpPassword = current.smtpPassword;
  }

  // Persist to Firestore server-only document: settings/email
  try {
    const db = getAdminFirestore();
    await db.collection('settings').doc(SETTINGS_EMAIL_DOC).set(updated, { merge: true });
    console.log(`[EMAIL SERVICE] Settings saved to Firestore (settings/email). Provider: ${updated.provider} | Resend Key Configured: ${!!updated.resendApiKey} | SMTP Pass Configured: ${!!updated.smtpPassword}`);
  } catch (err: any) {
    console.warn(`[EMAIL SERVICE] Firestore settings save note (requires FIREBASE_PRIVATE_KEY in production):`, err?.message || err);
  }

  return getSafeEmailSettings();
}

/**
 * Creates Nodemailer Transporter for SMTP
 */
function createSmtpTransporter(host: string, port: number, user: string, pass: string) {
  const secure = port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });
}

/**
 * Core sendEmail function
 * Strictly uses Resend or Nodemailer SMTP with auto-failover.
 * NO FormSubmit or untracked external services!
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const config = await getFullEmailSettings();
  const sentAt = new Date().toISOString();
  const recipient = (options.to || config.adminEmail).trim();
  const cleanSubject = sanitizeEmailSubject(options.subject);
  const plainText = options.text || (options.html ? options.html.replace(/<[^>]+>/g, ' ') : '');
  const replyTo = options.replyTo || config.adminEmail;

  const resendKey = (options.customResendKey?.trim()) || config.resendApiKey || '';
  const smtpUser = (options.customGmailUser?.trim()) || config.smtpUser || '';
  const smtpPass = (options.customGmailPass?.trim().replace(/\s+/g, '')) || config.smtpPassword || '';
  const smtpHost = config.smtpHost || 'smtp.gmail.com';
  const smtpPort = config.smtpPort || 465;
  const fromAddress = config.senderEmail || 'Peshawar Tech Support <onboarding@resend.dev>';

  const requestedProvider = options.preferredProvider || config.provider || 'auto';

  // Helper 1: Nodemailer SMTP Delivery
  async function deliverViaSmtp(): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!smtpUser || !smtpPass) {
      return { ok: false, error: 'SMTP username or password missing' };
    }
    try {
      const transporter = createSmtpTransporter(smtpHost, smtpPort, smtpUser, smtpPass);
      const info = await transporter.sendMail({
        from: `"TechFix Peshawar Support" <${smtpUser}>`,
        to: recipient,
        replyTo,
        subject: cleanSubject,
        text: plainText,
        html: options.html || `<div style="font-family: sans-serif; line-height: 1.6;">${plainText.replace(/\n/g, '<br/>')}</div>`,
        headers: {
          'X-Entity-Ref-ID': `techfix-${Date.now()}`,
          'X-Priority': '3',
          'Importance': 'normal'
        }
      });
      console.log(`[SMTP SUCCESS] Delivered to ${recipient}. Message ID: ${info.messageId}`);
      return { ok: true, messageId: info.messageId };
    } catch (err: any) {
      console.warn(`[SMTP FAILED] ${err?.message || err}`);
      return { ok: false, error: err?.message || 'SMTP delivery rejected by host' };
    }
  }

  // Helper 2: Resend API Delivery
  async function deliverViaResend(): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!resendKey || !resendKey.startsWith('re_')) {
      return { ok: false, error: 'Resend API Key missing or invalid format (requires re_...)' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject: cleanSubject,
          reply_to: replyTo,
          html: options.html || `<div style="font-family: sans-serif; line-height: 1.6;">${plainText.replace(/\n/g, '<br/>')}</div>`,
          text: plainText,
          headers: {
            'X-Entity-Ref-ID': `techfix-${Date.now()}`,
            'X-Priority': '3',
            'Importance': 'normal'
          }
        })
      });
      const data: any = await res.json();
      if (res.ok && data?.id) {
        console.log(`[RESEND SUCCESS] Delivered to ${recipient}. ID: ${data.id}`);
        return { ok: true, messageId: data.id };
      } else {
        const msg = data?.message || `Resend returned HTTP ${res.status}`;
        console.warn(`[RESEND FAILED] ${msg}`);
        return { ok: false, error: msg };
      }
    } catch (err: any) {
      console.warn(`[RESEND NETWORK ERROR] ${err?.message || err}`);
      return { ok: false, error: err?.message || 'Network error reaching Resend API' };
    }
  }

  // Determine delivery order
  if (requestedProvider === 'resend') {
    const resendRes = await deliverViaResend();
    if (resendRes.ok) {
      return { success: true, provider: 'resend', messageId: resendRes.messageId, sentTo: recipient, sentAt };
    }
    return { success: false, provider: 'resend', error: resendRes.error, sentTo: recipient, sentAt };
  }

  if (requestedProvider === 'gmail_smtp' || requestedProvider === 'smtp') {
    const smtpRes = await deliverViaSmtp();
    if (smtpRes.ok) {
      return { success: true, provider: 'smtp', messageId: smtpRes.messageId, sentTo: recipient, sentAt };
    }
    return { success: false, provider: 'smtp', error: smtpRes.error, sentTo: recipient, sentAt };
  }

  // AUTO Mode: waterfall with auto-failover
  let primaryType: 'resend' | 'smtp' = 'resend';
  let backupType: 'resend' | 'smtp' = 'smtp';

  if (!resendKey && smtpPass) {
    primaryType = 'smtp';
    backupType = 'resend';
  }

  // 1. Primary Attempt
  const primaryRes = primaryType === 'resend' ? await deliverViaResend() : await deliverViaSmtp();
  if (primaryRes.ok) {
    return { success: true, provider: primaryType, messageId: primaryRes.messageId, sentTo: recipient, sentAt };
  }

  // 2. Backup Attempt (Auto-Failover)
  const failoverNote = `Primary (${primaryType.toUpperCase()}) failed: ${primaryRes.error}. Attempted backup (${backupType.toUpperCase()}).`;
  console.warn(`[AUTO-FAILOVER] ${failoverNote}`);

  const backupRes = backupType === 'resend' ? await deliverViaResend() : await deliverViaSmtp();
  if (backupRes.ok) {
    return {
      success: true,
      provider: backupType,
      messageId: backupRes.messageId,
      failoverNote,
      sentTo: recipient,
      sentAt
    };
  }

  // Both failed or neither configured
  const finalError = `Both email delivery methods failed. Primary (${primaryType}): ${primaryRes.error} | Backup (${backupType}): ${backupRes.error}`;
  console.error(`[EMAIL DISPATCH FAILURE] ${finalError}`);

  return {
    success: false,
    provider: 'none',
    error: finalError,
    failoverNote,
    sentTo: recipient,
    sentAt
  };
}
