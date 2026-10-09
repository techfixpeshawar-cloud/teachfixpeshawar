// server.ts
import express from "express";
import path from "path";
import crypto from "crypto";

// server/firebaseAdmin.ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
var _app = null;
var _firestore = null;
var _auth = null;
var _hasServiceAccount = false;
function initFirebaseAdmin() {
  if (_app && _firestore && _auth) {
    return { app: _app, db: _firestore, auth: _auth };
  }
  const existingApps = getApps();
  if (existingApps.length > 0) {
    _app = existingApps[0];
  } else {
    const base64Sa = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
    if (base64Sa) {
      try {
        const decoded = Buffer.from(base64Sa, "base64").toString("utf-8");
        const sa = JSON.parse(decoded);
        _app = initializeApp({ credential: cert(sa) });
        _hasServiceAccount = true;
      } catch (err) {
        console.warn("[FIREBASE ADMIN] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:", err?.message || err);
      }
    }
    if (!_app) {
      const projectId2 = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0759593306").trim();
      const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
      let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();
      if (clientEmail && privateKey) {
        try {
          if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
          }
          privateKey = privateKey.replace(/\\n/g, "\n");
          _app = initializeApp({
            credential: cert({
              projectId: projectId2,
              clientEmail,
              privateKey
            })
          });
          _hasServiceAccount = true;
        } catch (err) {
          console.warn("[FIREBASE ADMIN] Failed to initialize with cert credentials:", err?.message || err);
        }
      }
    }
    if (!_app) {
      const projectId2 = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0759593306").trim();
      _app = initializeApp({ projectId: projectId2 });
    }
  }
  const dbId = (process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-peshawaronsitete-70e75457-6a23-4284-84ee-9bd0ef9c4555").trim();
  try {
    _firestore = dbId ? getFirestore(_app, dbId) : getFirestore(_app);
  } catch (err) {
    console.warn(`[FIREBASE ADMIN] Could not open named database '${dbId}', falling back to default:`, err?.message || err);
    _firestore = getFirestore(_app);
  }
  _auth = getAuth(_app);
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0759593306").trim();
  console.log(`[FIREBASE ADMIN] Initialized. Project: ${projectId} | Named DB: ${dbId || "(default)"} | Service Account Auth: ${_hasServiceAccount}`);
  return { app: _app, db: _firestore, auth: _auth };
}
function getAdminFirestore() {
  if (!_firestore) {
    initFirebaseAdmin();
  }
  return _firestore;
}

// server/email/emailService.ts
import nodemailer from "nodemailer";
var SETTINGS_EMAIL_DOC = "email";
function sanitizeEmailSubject(rawSubject) {
  if (!rawSubject) return "TechFix Peshawar On-Site Service Notification";
  return rawSubject.replace(/\[VERIFIED TEST\]/gi, "TechFix Verification Test:").replace(/\[TEST\]/gi, "TechFix Test:").replace(/\[URGENT\]/gi, "Priority Notice:").replace(/\[CONFIRMED\]/gi, "Appointment Confirmed:").replace(/\[LEAD INQUIRY\]/gi, "Customer Inquiry:").replace(/\[RESENT INQUIRY\]/gi, "Inquiry Update:").replace(/\s{2,}/g, " ").trim();
}
async function getFullEmailSettings() {
  let firestoreData = {};
  try {
    const db2 = getAdminFirestore();
    const docSnap = await db2.collection("settings").doc(SETTINGS_EMAIL_DOC).get();
    if (docSnap.exists) {
      firestoreData = docSnap.data() || {};
    }
  } catch (err) {
    console.warn("[EMAIL SERVICE] Firestore settings load note:", err?.message || err);
  }
  const provider = firestoreData.provider || process.env.EMAIL_PROVIDER || "auto";
  const resendApiKey = (firestoreData.resendApiKey || process.env.RESEND_API_KEY || "").trim();
  const senderEmail = (firestoreData.senderEmail || process.env.RESEND_FROM || process.env.FROM_EMAIL || "Peshawar Tech Support <onboarding@resend.dev>").trim();
  const adminEmail = (firestoreData.adminEmail || process.env.TARGET_EMAIL || process.env.ADMIN_EMAIL || process.env.NOTIFICATION_TARGET_EMAIL || "techfixpeshawar@gmail.com").trim();
  let smtpHost = (firestoreData.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com").trim().replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "");
  if (!smtpHost || smtpHost === "gmail.com") smtpHost = "smtp.gmail.com";
  const smtpPort = parseInt(
    String(firestoreData.smtpPort || process.env.SMTP_PORT || "465"),
    10
  );
  const smtpUser = (firestoreData.smtpUser || process.env.GMAIL_USER || process.env.GMAIL_ADDRESS || process.env.SMTP_USER || "techfixpeshawar@gmail.com").trim();
  const smtpPassword = (firestoreData.smtpPassword || process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
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
function createSmtpTransporter(host, port, user, pass) {
  const secure = port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 1e4,
    greetingTimeout: 1e4
  });
}
async function sendEmail(options) {
  const config = await getFullEmailSettings();
  const sentAt = (/* @__PURE__ */ new Date()).toISOString();
  const recipient = (options.to || config.adminEmail).trim();
  const cleanSubject = sanitizeEmailSubject(options.subject);
  const plainText = options.text || (options.html ? options.html.replace(/<[^>]+>/g, " ") : "");
  const replyTo = options.replyTo || config.adminEmail;
  const resendKey = options.customResendKey?.trim() || config.resendApiKey || "";
  const smtpUser = options.customGmailUser?.trim() || config.smtpUser || "";
  const smtpPass = options.customGmailPass?.trim().replace(/\s+/g, "") || config.smtpPassword || "";
  const smtpHost = config.smtpHost || "smtp.gmail.com";
  const smtpPort = config.smtpPort || 465;
  const fromAddress = config.senderEmail || "Peshawar Tech Support <onboarding@resend.dev>";
  const requestedProvider = options.preferredProvider || config.provider || "auto";
  async function deliverViaSmtp() {
    if (!smtpUser || !smtpPass) {
      return { ok: false, error: "SMTP username or password missing" };
    }
    try {
      const transporter = createSmtpTransporter(smtpHost, smtpPort, smtpUser, smtpPass);
      const info = await transporter.sendMail({
        from: `"TechFix Peshawar Support" <${smtpUser}>`,
        to: recipient,
        replyTo,
        subject: cleanSubject,
        text: plainText,
        html: options.html || `<div style="font-family: sans-serif; line-height: 1.6;">${plainText.replace(/\n/g, "<br/>")}</div>`,
        headers: {
          "X-Entity-Ref-ID": `techfix-${Date.now()}`,
          "X-Priority": "3",
          "Importance": "normal"
        }
      });
      console.log(`[SMTP SUCCESS] Delivered to ${recipient}. Message ID: ${info.messageId}`);
      return { ok: true, messageId: info.messageId };
    } catch (err) {
      console.warn(`[SMTP FAILED] ${err?.message || err}`);
      return { ok: false, error: err?.message || "SMTP delivery rejected by host" };
    }
  }
  async function deliverViaResend() {
    if (!resendKey || !resendKey.startsWith("re_")) {
      return { ok: false, error: "Resend API Key missing or invalid format (requires re_...)" };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject: cleanSubject,
          reply_to: replyTo,
          html: options.html || `<div style="font-family: sans-serif; line-height: 1.6;">${plainText.replace(/\n/g, "<br/>")}</div>`,
          text: plainText,
          headers: {
            "X-Entity-Ref-ID": `techfix-${Date.now()}`,
            "X-Priority": "3",
            "Importance": "normal"
          }
        })
      });
      const data = await res.json();
      if (res.ok && data?.id) {
        console.log(`[RESEND SUCCESS] Delivered to ${recipient}. ID: ${data.id}`);
        return { ok: true, messageId: data.id };
      } else {
        const msg = data?.message || `Resend returned HTTP ${res.status}`;
        console.warn(`[RESEND FAILED] ${msg}`);
        return { ok: false, error: msg };
      }
    } catch (err) {
      console.warn(`[RESEND NETWORK ERROR] ${err?.message || err}`);
      return { ok: false, error: err?.message || "Network error reaching Resend API" };
    }
  }
  if (requestedProvider === "resend") {
    const resendRes = await deliverViaResend();
    if (resendRes.ok) {
      return { success: true, provider: "resend", messageId: resendRes.messageId, sentTo: recipient, sentAt };
    }
    return { success: false, provider: "resend", error: resendRes.error, sentTo: recipient, sentAt };
  }
  if (requestedProvider === "gmail_smtp" || requestedProvider === "smtp") {
    const smtpRes = await deliverViaSmtp();
    if (smtpRes.ok) {
      return { success: true, provider: "smtp", messageId: smtpRes.messageId, sentTo: recipient, sentAt };
    }
    return { success: false, provider: "smtp", error: smtpRes.error, sentTo: recipient, sentAt };
  }
  let primaryType = "resend";
  let backupType = "smtp";
  if (!resendKey && smtpPass) {
    primaryType = "smtp";
    backupType = "resend";
  }
  const primaryRes = primaryType === "resend" ? await deliverViaResend() : await deliverViaSmtp();
  if (primaryRes.ok) {
    return { success: true, provider: primaryType, messageId: primaryRes.messageId, sentTo: recipient, sentAt };
  }
  const failoverNote = `Primary (${primaryType.toUpperCase()}) failed: ${primaryRes.error}. Attempted backup (${backupType.toUpperCase()}).`;
  console.warn(`[AUTO-FAILOVER] ${failoverNote}`);
  const backupRes = backupType === "resend" ? await deliverViaResend() : await deliverViaSmtp();
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
  const finalError = `Both email delivery methods failed. Primary (${primaryType}): ${primaryRes.error} | Backup (${backupType}): ${backupRes.error}`;
  console.error(`[EMAIL DISPATCH FAILURE] ${finalError}`);
  return {
    success: false,
    provider: "none",
    error: finalError,
    failoverNote,
    sentTo: recipient,
    sentAt
  };
}

// server.ts
if (!process.env.VERCEL) {
  await import("dotenv/config");
}
process.env.TZ = "Asia/Karachi";
var APP_ROOT = typeof __dirname !== "undefined" ? __dirname : process.cwd();
function getPeshawarTimeString(date = /* @__PURE__ */ new Date()) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}
function getPeshawarShortTimeString(date = /* @__PURE__ */ new Date()) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}
function getPeshawarDateTimeString(date = /* @__PURE__ */ new Date()) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}
var app = express();
var IS_VERCEL = !!process.env.VERCEL;
var DB_FILE = IS_VERCEL ? path.join("/tmp", "techfix_database.json") : path.join(process.cwd(), "data", "database.json");
var FIREBASE_CLIENT_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0759593306"
};
var SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SECRET || "peshawar-techfix-secure-session-key-2026").trim();
function generateAdminSessionToken(adminIdentifier = "admin") {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${adminIdentifier}:${issuedAt}:${nonce}`;
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `techfix_sess_${Buffer.from(payload).toString("base64url")}_${signature}`;
}
function verifyAdminSessionToken(token) {
  if (!token || typeof token !== "string") return false;
  if (!token.startsWith("techfix_sess_")) return false;
  const parts = token.slice("techfix_sess_".length).split("_");
  if (parts.length !== 2) return false;
  const [encodedPayload, signature] = parts;
  try {
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }
    const [, issuedAtStr] = payload.split(":");
    const issuedAt = parseInt(issuedAtStr, 10);
    const maxAgeMs = 7 * 24 * 60 * 60 * 1e3;
    if (isNaN(issuedAt) || Date.now() - issuedAt > maxAgeMs || Date.now() < issuedAt - 6e4) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval';");
  next();
});
function createRateLimiter(windowMs, maxRequests, message) {
  const limiterMap = /* @__PURE__ */ new Map();
  return (req, res, next) => {
    if (process.env.TEST_MODE === "true") return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let record = limiterMap.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      limiterMap.set(ip, record);
      return next();
    }
    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: message || "Too many requests, please try again later.",
        retryAfter: Math.ceil((record.resetTime - now) / 1e3)
      });
    }
    next();
  };
}
var authRateLimiter = createRateLimiter(15 * 60 * 1e3, 15, "Too many authentication attempts. Please try again later.");
var uploadRateLimiter = createRateLimiter(60 * 1e3, 20, "Upload rate limit exceeded. Please slow down.");
var publicApiRateLimiter = createRateLimiter(60 * 1e3, 60, "Too many requests. Please try again shortly.");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
var UPLOADS_DIR = IS_VERCEL ? path.join("/tmp", "techfix_uploads") : path.join(process.cwd(), "public", "uploads");
var db = null;
function getNotificationDestination() {
  return process.env.TARGET_EMAIL || process.env.ADMIN_EMAIL || db?.settings?.resendTargetEmail || db?.settings?.email || process.env.NOTIFICATION_TARGET_EMAIL || process.env.NOTIFICATION_EMAIL || "techfixpeshawar@gmail.com";
}
function getTechnicianPhone() {
  return db?.settings?.phoneNumber || process.env.BUSINESS_PHONE || "0327 5526107";
}
function getTechnicianWhatsApp() {
  const raw = db?.settings?.whatsappNumber || process.env.BUSINESS_WHATSAPP || "923275526107";
  return raw.replace(/[^0-9]/g, "");
}
function getResendApiKey() {
  return process.env.RESEND_API_KEY || db?.settings?.resendApiKey || "";
}
function getResendFromEmail() {
  return db?.settings?.resendFromEmail || process.env.FROM_EMAIL || process.env.RESEND_FROM || "Peshawar Tech Support <onboarding@resend.dev>";
}
var NOTIFICATION_DESTINATION = "techfixpeshawar@gmail.com";
async function sendNotificationEmail(options) {
  const result = await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    preferredProvider: options.preferredProvider,
    customResendKey: options.apiKey,
    customGmailUser: options.gmailUser,
    customGmailPass: options.gmailAppPassword
  });
  return {
    success: result.success,
    status: result.success ? "sent" : "failed",
    provider: result.provider === "smtp" || result.provider === "resend" ? result.provider : "logged",
    sentTo: result.sentTo,
    sentAt: result.sentAt,
    messageId: result.messageId,
    error: result.error,
    failoverNote: result.failoverNote
  };
}
var defaultData = {
  settings: {
    whatsappNumber: "923275526107",
    phoneNumber: "+92 327 5526107",
    email: "techfixpeshawar@gmail.com",
    serviceCity: "Peshawar, Khyber Pakhtunkhwa, Pakistan",
    businessHours: "Monday \u2013 Saturday: 9:00 AM \u2013 8:30 PM (Urgent On-Site Visits Available)",
    visitFeeStarting: "From Rs. 500",
    bulkQuoteNote: "Custom discounted tier for 5+ PCs with deployment script & hardware imaging",
    technicianName: "Safiullah",
    technicianTitle: "Computer Science & Cybersecurity Specialist",
    technicianInstitution: "University of Agriculture, Peshawar",
    technicianExperience: "5+ Years Practical Windows & Hardware Experience",
    technicianBio: "Hi, I'm Safiullah. I'm a student at the University of Agriculture, Peshawar, currently developing my knowledge in Computer Science and Cybersecurity. I also have around 5 years of practical experience working with computers, Windows systems, troubleshooting, OS installation, migration, and recovery. I started this service because computer problems shouldn't force people to waste an entire day travelling to a repair shop.",
    technicianPhoto: "/uploads/technician-portrait-1789213477063.jpg",
    socialX: "https://x.com/safiullah",
    socialLinkedin: "https://linkedin.com/in/safiullah",
    socialTiktok: "https://tiktok.com/@safiullah_tech",
    socialFacebook: "https://facebook.com/peshawaronlinepc"
  },
  services: [
    {
      id: "srv-win-install",
      key: "windows-installation",
      title: "Fast Windows Installation & Setup",
      shortDesc: "Clean, stable Windows 10 & 11 installation with proper drivers, essential runtimes, and performance tuning.",
      fullDesc: "I install and configure genuine Windows on compatible laptops and desktop computers. Every setup includes partition preparation, correct manufacturer drivers, critical security patches, and full hardware verification.",
      priceStarting: "From Rs. 1,500",
      priceNote: "Depends on SSD/HDD, hardware condition, and required data transfer",
      turnaround: "45 \u2013 90 mins (depends on SSD/USB/Hardware)",
      icon: "Monitor",
      status: "active",
      order: 1,
      workflow: [
        "1. Backup Important Data & User Files",
        "2. Clean Partitioning & Windows Installation",
        "3. Official Hardware Drivers (Chipset, GPU, Audio, Wi-Fi)",
        "4. Critical Windows Security Updates",
        "5. System Configuration & Bloatware Removal",
        "6. Hardware Stability & Temperature Test"
      ]
    },
    {
      id: "srv-os-migration",
      key: "os-migration",
      title: "Make Your Old Computer Feel Faster (HDD \u2192 SSD)",
      shortDesc: "Breathe new life into sluggish laptops and PCs by upgrading to high-speed solid-state storage.",
      fullDesc: "Many older computers use traditional hard disk drives (HDDs) that bottleneck every click. Upgrading your system drive to an SSD provides dramatic responsiveness improvements. When appropriate, I migrate your entire existing Windows installation to the SSD without starting from zero.",
      priceStarting: "From Rs. 2,000",
      priceNote: "Excludes SSD cost or customer-supplied SSD; includes cloning/migration & optimization",
      turnaround: "1 \u2013 2 hours",
      icon: "HardDrive",
      status: "active",
      order: 2,
      workflow: [
        "1. Old HDD Health & Sector Integrity Check",
        "2. Clone/Migrate Windows Partition Directly to SSD",
        "3. Align 4K Partitions & Optimize TRIM Support",
        "4. Configure Old HDD as Secondary Storage Drive",
        "5. Fast Startup Benchmark & Boot Verification"
      ]
    },
    {
      id: "srv-data-recovery",
      key: "data-recovery",
      title: "Data Recovery Assistance",
      shortDesc: "Lost files? Stop before you format. Sector-level safety, disk imaging, and non-destructive recovery.",
      fullDesc: "When files or partitions disappear, immediate caution is critical. Writing new data or reinstalling Windows overwrites deleted sectors permanently. We assess drive condition, create sector-by-sector clones, and perform non-destructive recovery from the image.",
      priceStarting: "Diagnostic / Quote",
      priceNote: "No charge if drive is physically unreadable and referred to specialized cleanroom lab",
      turnaround: "Diagnostic within 30 mins",
      icon: "ShieldAlert",
      status: "active",
      order: 3,
      warningNote: "DO NOT FORMAT THE DRIVE. DO NOT INSTALL WINDOWS ON IT. DO NOT COPY NEW FILES. Recovery depends on drive condition and whether data was overwritten.",
      workflow: [
        "1. Stop Drive Usage & Prevent Sector Overwrites",
        "2. Non-Destructive S.M.A.R.T. Health Diagnostic",
        "3. Create Raw Bit-by-Bit Drive Image/Clone",
        "4. Attempt Logical Carving & File Recovery from Clone",
        "5. Safe Export to Verified External Drive"
      ]
    },
    {
      id: "srv-bsod-diagnosis",
      key: "blue-screen",
      title: "Blue Screen / BSOD Real Cause Diagnosis",
      shortDesc: "Stop blindly reformatting. We pinpoint the exact driver, memory error, or hardware failure.",
      fullDesc: "A Blue Screen of Death is a symptom, not a mystery that always requires reformatting. We analyze minidump logs, test RAM sticks for bit-flip faults, check SSD health, and monitor thermals to fix the root cause permanently.",
      priceStarting: "From Rs. 1,500",
      priceNote: "Includes crash dump analysis, RAM stress test, and thermal check",
      turnaround: "45 \u2013 75 mins",
      icon: "Cpu",
      status: "active",
      order: 4,
      diagnosticSteps: [
        "1. Read Stop Error Code & Minidump Crash Stack",
        "2. Isolate Conflicting Drivers or Windows Patches",
        "3. Multi-Pass RAM Memory Stress Test",
        "4. Storage Sector Integrity & Cable Health Check",
        "5. CPU/GPU Thermal Throttling & Thermal Paste Check",
        "6. Target Component Repair & 30-Minute Stress Test"
      ]
    },
    {
      id: "srv-win-repair",
      key: "windows-repair",
      title: "Windows Startup & Boot Repair",
      shortDesc: "Stuck in Automatic Repair loop, corrupted BCD, or failing updates? We repair without losing your files.",
      fullDesc: "Repair first when appropriate; reinstall only when strictly necessary. We fix broken Boot Configuration Data (BCD), repair corrupted system files with DISM/SFC, and resolve update rollback loops.",
      priceStarting: "From Rs. 1,500",
      priceNote: "Priority on preserving customer applications and desktop data",
      turnaround: "40 \u2013 60 mins",
      icon: "Wrench",
      status: "active",
      order: 5,
      workflow: [
        "1. Boot to Recovery Environment & Check BCD",
        "2. Rebuild EFI / Bootloader Partitions",
        "3. Offline DISM & System File Checker (SFC)",
        "4. Registry Hive Restoration from RegBack / VSS",
        "5. Normal Boot Verification & Update Cleanup"
      ]
    },
    {
      id: "srv-slow-computer",
      key: "slow-computer",
      title: "Slow Computer & Thermal Overhaul",
      shortDesc: "In-depth diagnostic to eliminate bottlenecks, startup bloat, malware, and thermal throttling.",
      fullDesc: "Why is your computer crawling? We inspect hardware bottlenecks, analyze storage read/write performance, eliminate background resource hogs, check for stealth malware, and clean out dust/thermal barriers.",
      priceStarting: "From Rs. 1,200",
      priceNote: "Transparent diagnosis: if an SSD is needed, we inform you honestly",
      turnaround: "45 \u2013 60 mins",
      icon: "Gauge",
      status: "active",
      order: 6,
      workflow: [
        "1. Check Storage Health & Real Read/Write Speed",
        "2. RAM Capacity vs. Workload Pagefile Stress",
        "3. Startup Background Tasks & Services Optimization",
        "4. Thermal Throttling & Fan RPM Verification",
        "5. Malware & Unwanted Browser Extension Removal",
        "6. Final Performance Benchmark Report"
      ]
    },
    {
      id: "srv-software-drivers",
      key: "software-setup",
      title: "Software, Drivers & Printer Configuration",
      shortDesc: "Clean setup of essential everyday tools, network printers, OEM drivers, and productivity suites.",
      fullDesc: "Setup your computer right. We install official manufacturer device drivers, configure network or USB printers, configure secure browsers, PDF tools, and legitimate customer software. Strictly no pirated or cracked software.",
      priceStarting: "From Rs. 1,000",
      priceNote: "Per machine or bundled with Windows installation",
      turnaround: "30 \u2013 45 mins",
      icon: "Layers",
      status: "active",
      order: 7
    },
    {
      id: "srv-account-recovery",
      key: "account-access",
      title: "Authorized Windows Account Access Help",
      shortDesc: "Legitimate troubleshooting for forgotten local accounts and BitLocker recovery key guidance.",
      fullDesc: "Locked out of your authorized device? We provide authorized troubleshooting for forgotten local Windows accounts, PIN corruption, and assist with official Microsoft Account / BitLocker recovery portal access. Customer proof of ownership required.",
      priceStarting: "From Rs. 1,500",
      priceNote: "Verification of authorization required. Encrypted drives require your recovery key.",
      turnaround: "30 \u2013 45 mins",
      icon: "KeyRound",
      status: "active",
      order: 8
    },
    {
      id: "srv-bulk-deployment",
      key: "bulk-windows",
      title: "Bulk Windows Deployment (5 to 50+ PCs)",
      shortDesc: "Rapid imaging, driver packages, and standardized Windows deployment for offices, schools & labs.",
      fullDesc: "For small offices, computer academies, school labs, and organizations. Instead of spending days installing PCs one by one, we deploy standardized, clean Windows images with automated driver packs and configured lab profiles.",
      priceStarting: "Custom Quote",
      priceNote: "Volume tier discounts based on machine quantity (5, 10, 20, 50+ PCs)",
      turnaround: "Scheduled by batch / weekend availability",
      icon: "Building2",
      status: "active",
      order: 9
    }
  ],
  serviceAreas: [
    "University Town",
    "Hayatabad (Phases 1 to 7)",
    "Peshawar Cantt & Saddar",
    "Warsak Road & Near Areas",
    "Board Bazar & Jamrud Road",
    "Agriculture University Campus & Hostels",
    "Peshawar University Campus",
    "Ring Road / Charsadda Road",
    "Gulbahar & City Environs",
    "Dalazak Road & Landi Arbab",
    "Kohat Road & Defense Colony",
    "Danishabad & Rahatabad",
    "Tehkal & Pishtakhara"
  ],
  faqs: [
    {
      id: "faq-1",
      question: "Do you come directly to my home or office in Peshawar?",
      answer: "Yes! That is the core foundation of our service: 'We come to you.' You do not need to unplug cables, pack your desktop or laptop into a bag, or navigate busy traffic to drop your PC at a market shop. We bring our diagnostic tools, installation media, and equipment right to your location."
    },
    {
      id: "faq-2",
      question: "How does the on-site computer service work?",
      answer: "It's simple: 1) Contact us via WhatsApp or submit our quick online booking form. 2) Explain your PC issue. 3) We agree on a convenient day and time. 4) The technician visits your location, tests the machine in front of you, diagnoses the root cause, and resolves it after your direct approval."
    },
    {
      id: "faq-3",
      question: "How long does a Windows installation take?",
      answer: "We focus on fast, thorough installations without cutting corners. On modern computers with an SSD and USB 3.0, clean installation, official drivers, and essential software typically take around 45 to 60 minutes. On older mechanical HDDs, slower processors, or systems requiring large data transfers, it may take 75 to 90 minutes."
    },
    {
      id: "faq-4",
      question: "Can you move my existing Windows and files from an HDD to a new SSD?",
      answer: "Yes, this is one of our most popular services! If your current Windows installation and HDD sectors are healthy, we clone your entire operating system, programs, and desktop directly onto the SSD. Your system boots in seconds with all files intact. If the old drive has severe bad sectors or corruption, we advise on safe data backup followed by a clean setup."
    },
    {
      id: "faq-5",
      question: "Can you recover my deleted or lost files?",
      answer: "Recovery is possible in many cases, provided the sectors where the files were stored have not been overwritten by new data. We utilize non-destructive drive imaging and recovery software. However, we are completely transparent: if a hard drive is physically damaged (clicking noises, dropped, burnt PCB, head failure), it requires a specialized cleanroom laboratory."
    },
    {
      id: "faq-6",
      question: "What should I do immediately if I accidentally deleted important files or formatted a drive?",
      answer: "STOP USING THE COMPUTER IMMEDIATELY. Do not copy new files, do not download software onto that drive, and do not reinstall Windows. Any new data written to the drive can permanently overwrite the deleted sectors. Turn off the computer and contact us right away for an on-site assessment."
    },
    {
      id: "faq-7",
      question: "Can you fix Blue Screen (BSOD) errors without deleting all my files?",
      answer: "Absolutely. Many repair shops take the lazy approach of immediately formatting your PC for a Blue Screen. A Blue Screen is merely a symptom. We analyze the Windows minidump crash log, test RAM modules with memtest, inspect drive S.M.A.R.T. health, and update faulty drivers to resolve the actual cause while preserving your data."
    },
    {
      id: "faq-8",
      question: "Do you install pirated or cracked software?",
      answer: "No. As a Computer Science and Cybersecurity learner, I strictly do not install cracked, keygen, or pirated software. Cracked software frequently bundles trojans, cryptocurrency miners, and backdoor rootkits that compromise your personal data, banking credentials, and system stability."
    },
    {
      id: "faq-9",
      question: "Can you help if I forgot my Windows account password?",
      answer: "We provide authorized local account recovery and PIN troubleshooting for verified owners of the computer. For encrypted drives (like BitLocker), access strictly requires the official BitLocker recovery key or authenticated Microsoft Account."
    },
    {
      id: "faq-10",
      question: "Do you provide bulk Windows installation and setup for offices, schools, and labs?",
      answer: "Yes. For organizations with 5, 10, 20, or 50+ computers, we utilize standardized imaging and deployment methods so your entire lab or office is configured uniformly with drivers, networking, and software in a fraction of the time. Request a bulk quote through our form or WhatsApp."
    }
  ],
  caseStudies: [
    {
      id: "case-1",
      title: "University Town: Laptop Boot Loop & Corrupted BCD Fixed Without Data Loss",
      customerType: "Home User",
      deviceInfo: "Dell Inspiron 15 (5000 Series)",
      date: "Feb 2026",
      problem: "Laptop rebooting constantly in Automatic Repair loop after a forced Windows update shutdown.",
      diagnosis: "Damaged EFI partition and corrupted Boot Configuration Data. Drive S.M.A.R.T. health tested 100% healthy.",
      solution: "Rebuilt EFI bootloader via command line recovery environment, repaired corrupted system files with offline SFC & DISM.",
      result: "Windows booted normally within 35 minutes with 100% of customer university thesis files and desktop intact."
    },
    {
      id: "case-2",
      title: "Hayatabad Phase 4: Mechanical HDD to NVMe SSD Upgrade & System Migration",
      customerType: "Business / Home Office",
      deviceInfo: "HP Pavilion Desktop Tower",
      date: "Jan 2026",
      problem: "PC taking 4.5 minutes to boot, 100% disk usage freeze during basic document work.",
      diagnosis: "Aging 1TB mechanical hard drive with slow read/write latency bottlenecking system performance.",
      solution: "Installed 500GB high-speed SSD, cloned existing Windows 11 installation and programs directly, aligned partitions, and formatted old HDD as secondary storage.",
      result: "Boot time dropped from 4.5 minutes down to 11 seconds. Customer maintained all existing software licenses and desktop settings."
    }
  ],
  websiteContent: {
    heroHeadline: "Professional On-Site Computer Support in Peshawar",
    heroSubheadline: "Don't disconnect cables and waste hours in traffic. We come to your home or office with diagnostic tools, Windows setup media, SSD upgrades, and honest solutions.",
    announcementActive: true,
    announcementText: "\u26A1 Urgent same-day on-site computer diagnostics available across University Town, Hayatabad, Cantt & Saddar.",
    ctaButtonText: "Book On-Site Service",
    metaTitle: "Peshawar On-Site Computer Support | Windows & PC Troubleshooting",
    metaDescription: "Professional on-site computer support, Windows setup, SSD upgrades, BSOD troubleshooting, and data recovery assistance delivered at your home or office in Peshawar.",
    metaKeywords: "computer repair peshawar, windows installation peshawar, ssd upgrade, on-site pc technician hayatabad, university town",
    footerBio: "Independent on-site technical assistance by Safiullah \u2014 Computer Science & Cybersecurity practitioner in Peshawar.",
    disclaimerText: "Windows is a registered trademark of Microsoft Corporation. We operate as an independent on-site computer support provider in Peshawar."
  },
  categories: [
    { id: "cat-1", title: "Windows & Boot Issues", serviceCount: 3 },
    { id: "cat-2", title: "Speed & Hardware Upgrades", serviceCount: 2 },
    { id: "cat-3", title: "Data Recovery & Security", serviceCount: 2 },
    { id: "cat-4", title: "Software & Peripherals", serviceCount: 1 },
    { id: "cat-5", title: "Bulk & Institutional Deployment", serviceCount: 1 }
  ],
  media: [
    {
      id: "media-1",
      name: "technician.jpg",
      url: "/uploads/technician-portrait-1789213477063.jpg",
      dataUrl: "",
      size: "245 KB",
      type: "image/jpeg",
      uploadedAt: "2026-02-15T10:00:00.000Z",
      usedIn: "Technician Profile"
    }
  ],
  customers: [
    {
      id: "cust-1",
      name: "Saad Khan",
      email: "saad.khan@gmail.com",
      phone: "0313 4567891",
      whatsapp: "0313 4567891",
      area: "University Town",
      totalBookings: 1,
      totalSpent: "Pending",
      lastServiceDate: "Today",
      notes: "Student at UET Peshawar. Device has critical exam files.",
      devices: ["Dell XPS 15"]
    },
    {
      id: "cust-2",
      name: "Dr. Tariq Mahmood",
      email: "tariq.mahmood@yahoo.com",
      phone: "0333 9123456",
      whatsapp: "0333 9123456",
      area: "Hayatabad Phase 4",
      totalBookings: 1,
      totalSpent: "Pending",
      lastServiceDate: "Today",
      notes: "Wants on-site SSD clone without reinstalling medical records software.",
      devices: ["HP Pavilion Desktop"]
    },
    {
      id: "cust-3",
      name: "Ayesha Rehman",
      phone: "0321 8765432",
      whatsapp: "0321 8765432",
      area: "Peshawar Cantt & Saddar",
      totalBookings: 1,
      totalSpent: "Pending",
      lastServiceDate: "Today",
      notes: "Needs clean genuine Windows 11 with BitLocker key setup.",
      devices: ["Lenovo ThinkPad T480"]
    },
    {
      id: "cust-4",
      name: "Irfan Ullah",
      phone: "0300 5544332",
      whatsapp: "0300 5544332",
      area: "Board Bazar & Jamrud Road",
      totalBookings: 1,
      totalSpent: "Pending",
      lastServiceDate: "Today",
      notes: "Automatic repair loop after update.",
      devices: ["Asus TUF Gaming"]
    },
    {
      id: "cust-5",
      name: "Engr. Bilal Shinwari",
      phone: "0345 9988776",
      whatsapp: "0345 9988776",
      area: "Danishabad & Rahatabad",
      totalBookings: 1,
      totalSpent: "Rs. 1,500 Quoted",
      lastServiceDate: "Yesterday",
      notes: "Thermal throttling during CAD rendering.",
      devices: ["Lenovo Legion 5"]
    },
    {
      id: "cust-6",
      name: "Professor Khalid",
      phone: "0301 2233445",
      whatsapp: "0301 2233445",
      area: "Agriculture University Campus",
      totalBookings: 2,
      totalSpent: "Rs. 3,000",
      lastServiceDate: "Today",
      notes: "Faculty member. Clean Windows installation confirmed for today 2:30 PM.",
      devices: ["HP EliteBook 840 G6"]
    },
    {
      id: "cust-7",
      name: "Zubair Khan",
      phone: "0315 9988112",
      whatsapp: "0315 9988112",
      area: "University Town",
      totalBookings: 1,
      totalSpent: "Rs. 2,500",
      lastServiceDate: "3 days ago",
      notes: "512GB NVMe SSD upgrade completed successfully.",
      devices: ["HP Envy x360"]
    }
  ],
  activityLogs: [
    {
      id: "log-1",
      action: "System Initialized",
      details: "Admin CMS loaded with official Peshawar on-site service catalog",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    },
    {
      id: "log-2",
      action: "Booking Confirmed",
      details: "Confirmed on-site visit for Professor Khalid at Agriculture University (Today 2:30 PM)",
      timestamp: new Date(Date.now() - 36e5).toISOString(),
      user: "Safiullah (Admin)"
    },
    {
      id: "log-3",
      action: "Price Updated",
      details: "Verified standard transparent starting price Rs. 1,500 for Clean Windows Setup",
      timestamp: new Date(Date.now() - 72e5).toISOString(),
      user: "Safiullah (Admin)"
    }
  ],
  bookings: [
    // 4 NEW Requests
    {
      id: "PSH-NEW-101",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      fullName: "Saad Khan",
      phone: "0313 4567891",
      whatsapp: "0313 4567891",
      area: "University Town",
      deviceType: "Laptop",
      computerBrandModel: "Dell XPS 15 (9500)",
      serviceRequired: "Blue Screen / BSOD Real Cause Diagnosis",
      problemDescription: "Getting random blue screen crashes with error IRQL_NOT_LESS_OR_EQUAL whenever I launch Chrome or Adobe Premiere. Need urgent help before exam submission.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Morning (10 AM - 1 PM)",
      urgency: "Urgent",
      containsImportantData: "YES",
      status: "NEW",
      adminNotes: "Client called earlier. Needs dump analysis. Recommended not writing new data."
    },
    {
      id: "PSH-NEW-102",
      createdAt: new Date(Date.now() - 18e5).toISOString(),
      fullName: "Dr. Tariq Mahmood",
      phone: "0333 9123456",
      whatsapp: "0333 9123456",
      area: "Hayatabad (Phase 4)",
      deviceType: "Desktop",
      computerBrandModel: "HP Pavilion Desktop Core i5",
      serviceRequired: "Make Your Old Computer Feel Faster (HDD \u2192 SSD)",
      problemDescription: "Desktop computer is terribly slow since last month. Takes almost 5 minutes to boot. Want to upgrade to SSD and keep all patient clinic management files intact without reinstalling.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Afternoon (1 PM - 5 PM)",
      urgency: "Normal",
      containsImportantData: "YES",
      status: "NEW",
      adminNotes: "Can clone directly to 500GB SSD on-site. Quoted Rs. 2,000 service fee."
    },
    {
      id: "PSH-NEW-103",
      createdAt: new Date(Date.now() - 36e5).toISOString(),
      fullName: "Ayesha Rehman",
      phone: "0321 8765432",
      whatsapp: "0321 8765432",
      area: "Peshawar Cantt & Saddar",
      deviceType: "Laptop",
      computerBrandModel: "Lenovo ThinkPad T480",
      serviceRequired: "Fast Windows Installation & Setup",
      problemDescription: "Recently purchased used laptop from market. Want clean genuine Windows 11 installation with all official Lenovo Vantage drivers, Wi-Fi drivers, and browser setup.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Evening (5 PM - 8 PM)",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "NEW",
      adminNotes: "Quick clean installation with driver pack. Estimated 50 mins."
    },
    {
      id: "PSH-NEW-104",
      createdAt: new Date(Date.now() - 54e5).toISOString(),
      fullName: "Irfan Ullah",
      phone: "0300 5544332",
      whatsapp: "0300 5544332",
      area: "Board Bazar & Jamrud Road",
      deviceType: "Laptop",
      computerBrandModel: "Asus TUF Gaming FX505",
      serviceRequired: "Windows Startup & Boot Repair",
      problemDescription: "Laptop turned off during Windows update and now displays 'Preparing Automatic Repair' and black screen. Do not want to format my college assignments.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Morning (10 AM - 1 PM)",
      urgency: "Urgent",
      containsImportantData: "YES",
      status: "NEW",
      adminNotes: "Bootloader / EFI repair candidate. Data preserved."
    },
    // 2 PENDING Bookings (Contacted, awaiting time confirmation)
    {
      id: "PSH-PND-201",
      createdAt: new Date(Date.now() - 864e5).toISOString(),
      fullName: "Engr. Bilal Shinwari",
      phone: "0345 9988776",
      whatsapp: "0345 9988776",
      area: "Danishabad & Rahatabad",
      deviceType: "Laptop",
      computerBrandModel: "Lenovo Legion 5 AMD Ryzen 7",
      serviceRequired: "Slow Computer & Thermal Overhaul",
      problemDescription: "Fans running at maximum speed loudly. Laptop gets burning hot when running AutoCAD. Likely needs heatsink dust cleaning and fresh thermal paste application.",
      preferredDate: new Date(Date.now() + 864e5).toISOString().split("T")[0],
      preferredTime: "Morning (10 AM - 1 PM)",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "CONTACTED",
      adminNotes: "Spoke via WhatsApp. He will confirm when his engineering shift ends."
    },
    {
      id: "PSH-PND-202",
      createdAt: new Date(Date.now() - 9e7).toISOString(),
      fullName: "Farooq Shah",
      phone: "0312 3344556",
      whatsapp: "0312 3344556",
      area: "Rahatabad",
      deviceType: "Desktop",
      computerBrandModel: "Custom Core i7 Tower",
      serviceRequired: "Data Recovery Assistance",
      problemDescription: "Accidentally formatted partition D: while trying to create a USB installer. Have not written anything to the drive since. Need recovery assessment.",
      preferredDate: new Date(Date.now() + 864e5).toISOString().split("T")[0],
      preferredTime: "Afternoon (1 PM - 5 PM)",
      urgency: "Urgent",
      containsImportantData: "YES",
      status: "CONTACTED",
      adminNotes: "Instructed customer to leave PC completely powered off until technician visit."
    },
    // 3 CONFIRMED Visits (Scheduled on-site visits)
    {
      id: "PSH-CNF-301",
      createdAt: new Date(Date.now() - 432e5).toISOString(),
      fullName: "Professor Khalid",
      phone: "0301 2233445",
      whatsapp: "0301 2233445",
      area: "Agriculture University Campus & Hostels",
      deviceType: "Laptop",
      computerBrandModel: "HP EliteBook 840 G6",
      serviceRequired: "Fast Windows Installation & Setup",
      problemDescription: "Need clean genuine Windows 10 installation with all academic research software and network printer configured.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Afternoon (1 PM - 5 PM)",
      scheduledTime: "Today at 2:30 PM",
      urgency: "Normal",
      containsImportantData: "YES",
      status: "CONFIRMED",
      adminNotes: "Visit confirmed at Faculty Block A. All backup verified."
    },
    {
      id: "PSH-CNF-302",
      createdAt: new Date(Date.now() - 48e6).toISOString(),
      fullName: "Naveed Ahmed",
      phone: "0314 6677889",
      whatsapp: "0314 6677889",
      area: "Hayatabad (Phase 2)",
      deviceType: "Desktop",
      computerBrandModel: "Custom Gaming Rig (RTX 3060)",
      serviceRequired: "Blue Screen / BSOD Real Cause Diagnosis",
      problemDescription: "Crashing under GPU load with VIDEO_TDR_FAILURE. Need hardware and driver diagnostics.",
      preferredDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: "Evening (5 PM - 8 PM)",
      scheduledTime: "Today at 5:00 PM",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "CONFIRMED",
      adminNotes: "Confirmed home visit. Bringing DDU and clean WHQL driver media."
    },
    {
      id: "PSH-CNF-303",
      createdAt: new Date(Date.now() - 52e6).toISOString(),
      fullName: "Frontier Computer Academy (Director Tariq)",
      phone: "0334 1122334",
      whatsapp: "0334 1122334",
      area: "Warsak Road & Near Areas",
      deviceType: "Desktop",
      computerBrandModel: "12x Dell OptiPlex Desktops",
      serviceRequired: "Bulk Windows Deployment (5 to 50+ PCs)",
      problemDescription: "Need all 12 academy student workstations re-imaged with clean Windows 10, student restrictions, and lab software installed.",
      preferredDate: new Date(Date.now() + 864e5).toISOString().split("T")[0],
      preferredTime: "Morning (10 AM - 1 PM)",
      scheduledTime: "Tomorrow at 10:00 AM",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "CONFIRMED",
      adminNotes: "Bulk quote agreed: Rs. 14,000 for 12 systems. Master flash drive prepared."
    },
    // 5 COMPLETED Jobs
    {
      id: "PSH-CMP-401",
      createdAt: new Date(Date.now() - 1728e5).toISOString(),
      fullName: "Zubair Khan",
      phone: "0315 9988112",
      whatsapp: "0315 9988112",
      area: "University Town",
      deviceType: "Laptop",
      computerBrandModel: "HP Envy x360",
      serviceRequired: "Make Your Old Computer Feel Faster (HDD \u2192 SSD)",
      problemDescription: "Upgraded mechanical drive to 512GB NVMe SSD with OS cloning.",
      preferredDate: new Date(Date.now() - 1728e5).toISOString().split("T")[0],
      preferredTime: "Morning",
      urgency: "Normal",
      containsImportantData: "YES",
      status: "COMPLETED",
      adminNotes: "Job completed in 65 mins. Boot time reduced to 9 seconds. Collected Rs. 2,500."
    },
    {
      id: "PSH-CMP-402",
      createdAt: new Date(Date.now() - 2592e5).toISOString(),
      fullName: "M. Usman",
      phone: "0322 4455667",
      whatsapp: "0322 4455667",
      area: "Hayatabad (Phase 6)",
      deviceType: "Desktop",
      computerBrandModel: "Dell Optiplex 7050",
      serviceRequired: "Windows Startup & Boot Repair",
      problemDescription: "BCD corruption repaired, offline SFC pass clean.",
      preferredDate: new Date(Date.now() - 2592e5).toISOString().split("T")[0],
      preferredTime: "Afternoon",
      urgency: "Urgent",
      containsImportantData: "YES",
      status: "COMPLETED",
      adminNotes: "Fixed on-site in 40 mins without data wipe. Collected Rs. 1,500."
    },
    {
      id: "PSH-CMP-403",
      createdAt: new Date(Date.now() - 3456e5).toISOString(),
      fullName: "Shahida Parveen",
      phone: "0331 7788990",
      whatsapp: "0331 7788990",
      area: "Kohat Road & Defense Colony",
      deviceType: "Laptop",
      computerBrandModel: "Dell Inspiron 15",
      serviceRequired: "Software, Drivers & Printer Configuration",
      problemDescription: "Removed invasive adware popups, configured HP DeskJet Wi-Fi printer.",
      preferredDate: new Date(Date.now() - 3456e5).toISOString().split("T")[0],
      preferredTime: "Evening",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "COMPLETED",
      adminNotes: "Cleaned system, verified print spooler, user tested printing. Collected Rs. 1,200."
    },
    {
      id: "PSH-CMP-404",
      createdAt: new Date(Date.now() - 432e6).toISOString(),
      fullName: "Rashid Minhas",
      phone: "0302 8899001",
      whatsapp: "0302 8899001",
      area: "Ring Road / Charsadda Road",
      deviceType: "Laptop",
      computerBrandModel: "Acer Nitro 5",
      serviceRequired: "Fast Windows Installation & Setup",
      problemDescription: "Fresh Windows 11 installation with official Nvidia drivers & temperature tuning.",
      preferredDate: new Date(Date.now() - 432e6).toISOString().split("T")[0],
      preferredTime: "Afternoon",
      urgency: "Normal",
      containsImportantData: "NO",
      status: "COMPLETED",
      adminNotes: "Clean install completed, benchmarks passed. Collected Rs. 1,800."
    },
    {
      id: "PSH-CMP-405",
      createdAt: new Date(Date.now() - 5184e5).toISOString(),
      fullName: "Khyber Legal Associates",
      phone: "0346 5566778",
      whatsapp: "0346 5566778",
      area: "Peshawar Cantt & Saddar",
      deviceType: "Desktop",
      computerBrandModel: "8x Core i5 Office Workstations",
      serviceRequired: "Bulk Windows Deployment (5 to 50+ PCs)",
      problemDescription: "Standardized Windows 10 deployment with Urdu phonetic keyboard & scanner drivers.",
      preferredDate: new Date(Date.now() - 5184e5).toISOString().split("T")[0],
      preferredTime: "Full Day",
      urgency: "Normal",
      containsImportantData: "YES",
      status: "COMPLETED",
      adminNotes: "Deployed image to 8 PCs in 3.5 hours. Collected Rs. 9,600."
    }
  ],
  inquiries: [
    {
      id: "INQ-101",
      fullName: "Engr. Mansoor Ahmed",
      email: "mansoor.pesh@gmail.com",
      phone: "0314 9876543",
      whatsapp: "0314 9876543",
      area: "University Town",
      subject: "Thermal Overhaul & SolidWorks Throttling Fix",
      service: "Slow Computer & Thermal Overhaul",
      budget: "Rs. 2,000 - 3,000",
      message: "My Dell Precision workstation reaches 95C and shuts down under CAD load. Need on-site heatsink cleaning, Arctic MX-4 thermal paste reapplication, and fan inspection.",
      status: "NEW",
      createdAt: new Date(Date.now() - 72e5).toISOString(),
      emailNotificationStatus: "sent",
      emailNotificationSentTo: NOTIFICATION_DESTINATION,
      emailNotificationSentAt: new Date(Date.now() - 72e5).toISOString(),
      emailNotificationProvider: "smtp"
    },
    {
      id: "INQ-102",
      fullName: "Dr. Fatima Noor",
      email: "fatima.noor.clinic@gmail.com",
      phone: "0333 9123456",
      whatsapp: "0333 9123456",
      area: "Hayatabad (Phase 2)",
      subject: "NVMe SSD Upgrade with Patient DB Migration",
      service: "Make Your Old Computer Feel Faster (HDD \u2192 SSD)",
      budget: "Rs. 2,500",
      message: "Need SSD upgrade for our clinic reception desktop without losing patient records or reinstalling specialized software. Available Wednesday afternoon.",
      status: "CONTACTED",
      createdAt: new Date(Date.now() - 864e5).toISOString(),
      emailNotificationStatus: "sent",
      emailNotificationSentTo: NOTIFICATION_DESTINATION,
      emailNotificationSentAt: new Date(Date.now() - 864e5).toISOString(),
      emailNotificationProvider: "smtp"
    }
  ],
  pageSections: {
    pageStatuses: {
      services: "published",
      "how-it-works": "published",
      "why-on-site": "published",
      "who-we-serve": "published",
      "bulk-windows": "published",
      technician: "published",
      faq: "published",
      contact: "published"
    },
    services: {
      pageStatus: "published",
      badge: "ON-SITE SERVICES & TRANSPARENT PRICING",
      title: "Professional On-Site Computer Support",
      subtitle: "Clear, upfront pricing with no hidden charges. Every service includes full on-site diagnosis, live testing, and our standard 14-day warranty."
    },
    "how-it-works": {
      pageStatus: "published",
      badge: "TRANSPARENT ON-SITE PROTOCOL",
      title: "How Our On-Site Service Works",
      subtitle: "Simple, honest, and transparent computer assistance delivered right to your home, hostel, or office in Peshawar.",
      steps: [
        {
          id: "step-1",
          num: "STEP 01",
          title: "CONTACT",
          desc: "Send a quick WhatsApp message or submit our 60-second online service request.",
          status: "published"
        },
        {
          id: "step-2",
          num: "STEP 02",
          title: "EXPLAIN",
          desc: "Tell me your computer brand/model (Dell, HP, Lenovo, Custom PC) and what issue you are experiencing.",
          status: "published"
        },
        {
          id: "step-3",
          num: "STEP 03",
          title: "BOOK",
          desc: "Choose a suitable appointment time (Morning, Afternoon, Evening) for your home or office.",
          status: "published"
        },
        {
          id: "step-4",
          num: "STEP 04",
          title: "VISIT & DIAGNOSE",
          desc: "I come directly to your location in Peshawar with diagnostic gear, inspect the computer, and resolve the problem.",
          status: "published"
        }
      ],
      toolkit: [
        {
          id: "tool-1",
          title: "High-Speed Bootable Diagnostics",
          desc: "Multiple Sandisk & Samsung 3.2 Gen 2 USB drives preloaded with official Microsoft Windows 10/11 installation images, WinPE recovery suites, and memory test kernels.",
          status: "published"
        },
        {
          id: "tool-2",
          title: "Hardware & Storage Diagnostic Tools",
          desc: 'S.M.A.R.T telemetry analyzers, bad-sector detectors, NVMe-to-USB-C enclosure rigs, and 2.5" SATA docking adapters for safe isolated data testing.',
          status: "published"
        },
        {
          id: "tool-3",
          title: "Precision Screwdrivers & ESD Gear",
          desc: "iFixit precision bit set, anti-static grounding wristband, non-marring prying spudgers, and premium thermal interface compound (Arctic MX-4).",
          status: "published"
        },
        {
          id: "tool-4",
          title: "Offline Official Driver Cache",
          desc: "Pre-downloaded official network, chipset, graphics, and audio drivers for Dell, HP, Lenovo, and Asus laptops to ensure instant offline functionality.",
          status: "published"
        }
      ]
    },
    "why-on-site": {
      pageStatus: "published",
      badge: "TRANSPARENCY & PEACE OF MIND",
      title: "Why Choose On-Site Service Over a Repair Shop?",
      subtitle: "Taking your computer to a crowded repair shop in Saddar or City Bazaar exposes your private data, consumes hours in traffic, and leaves you without your machine for days. On-site computer repair changes that completely.",
      pillars: [
        {
          id: "pillar-1",
          title: "Zero Private Data Snooping",
          desc: "We never open personal picture galleries, browser history, WhatsApp folders, or financial documents. You sit right beside the computer and observe every diagnostic step.",
          status: "published"
        },
        {
          id: "pillar-2",
          title: "No Risk of Swapped Hardware",
          desc: "In bazaar shops, unscrupulous helpers occasionally swap original RAM sticks or SSDs with degraded units. With on-site service, your machine never leaves your room or desk.",
          status: "published"
        },
        {
          id: "pillar-3",
          title: "Zero Transit Shock or Hinge Damage",
          desc: "Carrying desktop towers and fragile laptops through Peshawar traffic, potholes, or rain frequently loosens heat sinks, snaps ribbon cables, or cracks screens. On-site prevents all travel damage.",
          status: "published"
        },
        {
          id: "pillar-4",
          title: "Immediate Real-World Testing",
          desc: "Test your machine on your exact home or office Wi-Fi, with your specific printer, monitor cables, and sound systems before the technician departs.",
          status: "published"
        }
      ],
      shopSteps: [
        { id: "shop-1", step: "01", title: "PACK COMPUTER", desc: "Unplug cables, pack heavy tower or delicate laptop into bag", status: "published" },
        { id: "shop-2", step: "02", title: "TRAVEL", desc: "Drive through Peshawar traffic, Saddar or Board Bazar congestion", status: "published" },
        { id: "shop-3", step: "03", title: "WAIT IN SHOP", desc: "Stand in line waiting for technician to become free", status: "published" },
        { id: "shop-4", step: "04", title: "EXPLAIN PROBLEM", desc: "Rush to explain issue to counter clerk, not the technician", status: "published" },
        { id: "shop-5", step: "05", title: "LEAVE COMPUTER", desc: "Leave your personal computer, sensitive files, and logins behind for days", status: "published" },
        { id: "shop-6", step: "06", title: "RETURN LATER", desc: "Make a second trip back to pick it up, hoping it was actually fixed", status: "published" }
      ],
      ourSteps: [
        { id: "our-1", step: "01", title: "CONTACT ONLINE", desc: "Reach out on WhatsApp or fill our simple 60-second form", status: "published" },
        { id: "our-2", step: "02", title: "BOOK A TIME", desc: "Choose a date and time that fits your exact schedule", status: "published" },
        { id: "our-3", step: "03", title: "WE COME TO YOU", desc: "Technician arrives at your home, hostel, or office in Peshawar", status: "published" },
        { id: "our-4", step: "04", title: "DIAGNOSE IN FRONT OF YOU", desc: "Full diagnostic performed right before your eyes with no mystery", status: "published" },
        { id: "our-5", step: "05", title: "SOLVE THE PROBLEM", desc: "Clean installation, SSD upgrade, or driver repair completed on-site", status: "published" },
        { id: "our-6", step: "06", title: "TEST & VERIFY", desc: "Verify everything runs smoothly together before you make payment", status: "published" }
      ]
    },
    "who-we-serve": {
      pageStatus: "published",
      badge: "CUSTOMIZED ON-SITE SUPPORT",
      title: "Who We Serve in Peshawar",
      subtitle: "Whether you are a university student rushing to meet a project deadline, a family needing a dependable home computer, or an office requiring fast workstation maintenance, our on-site service adapts directly to your requirements.",
      audiences: [
        {
          id: "aud-students",
          key: "students",
          title: "STUDENTS",
          tagline: "Agriculture University, Peshawar Uni, Medical & Engineering Campuses",
          headline: "Your laptop is part of your education. Get computer problems handled without wasting your study day.",
          badge: "STUDENT FRIENDLY",
          status: "published",
          services: [
            "Clean Windows 10 & 11 setups for semester work",
            "HDD to SSD upgrades for old study laptops",
            "BSOD & overheating diagnostics",
            "Academic software, compilers & development environments",
            "Thesis & lost assignment data recovery assistance",
            "Special student turnaround speed"
          ]
        },
        {
          id: "aud-home",
          key: "home-users",
          title: "HOME USERS",
          tagline: "Families, Personal Laptops & Home Desktops Across Peshawar",
          headline: "Computer problems at home? Get practical assistance without carrying your computer around.",
          badge: "MAXIMUM CONVENIENCE",
          status: "published",
          services: [
            "Zero travel: no carrying heavy desktop towers in traffic",
            "Full privacy: family photos & accounts stay safe in your home",
            "Home Wi-Fi & wireless printer configuration",
            "Slow PC cleanups & storage expansion",
            "Parental controls & browser safety setups",
            "Transparent in-person diagnosis in your living room"
          ]
        },
        {
          id: "aud-offices",
          key: "offices",
          title: "OFFICES & ACADEMIES",
          tagline: "Small Businesses, Schools, Academies & Computer Labs",
          headline: "Keep your team's computers working with on-site support and bulk Windows deployment.",
          badge: "WORKPLACE READY",
          status: "published",
          services: [
            "Bulk Windows deployment across 5, 10, 20 or 50+ PCs",
            "Standardized workstation software & driver profiles",
            "Network printer sharing & office file sharing",
            "Scheduled weekend maintenance with zero downtime",
            "Computer lab refreshes for schools & colleges",
            "Formal receipts & documented hardware logs"
          ]
        }
      ]
    },
    "bulk-windows": {
      pageStatus: "published",
      badge: "INSTITUTIONAL LAB DEPLOYMENT",
      title: "Bulk Windows Deployment for Institutions & Offices",
      subtitle: "Standardized operating system deployment, driver automation, and application configuration for 5 to 50+ PCs in Peshawar.",
      pricingTiers: [
        { id: "tier-1", minPCs: 5, maxPCs: 9, ratePerPc: 700, label: "5 - 9 Computers", desc: "Small office / clinic batch", status: "published" },
        { id: "tier-2", minPCs: 10, maxPCs: 19, ratePerPc: 600, label: "10 - 19 Computers", desc: "Standard department / academy", status: "published" },
        { id: "tier-3", minPCs: 20, maxPCs: 29, ratePerPc: 500, label: "20 - 29 Computers", desc: "College / School lab wing", status: "published" },
        { id: "tier-4", minPCs: 30, maxPCs: 100, ratePerPc: 450, label: "30+ Computers", desc: "Full campus / enterprise refresh", status: "published" }
      ],
      labFeatures: [
        {
          id: "lab-1",
          title: "Parallel USB 3.2 Deployment",
          desc: "Deploying multiple computers simultaneously using customized WinPE images cuts total lab downtime by up to 75% compared to single-disc setups.",
          status: "published"
        },
        {
          id: "lab-2",
          title: "Debloated Windows 10 / 11 Enterprise/Pro",
          desc: "Removal of consumer telemetry, pre-installed promotional games, Cortana bloat, and unwanted background background services for maximum speed on lab hardware.",
          status: "published"
        },
        {
          id: "lab-3",
          title: "Pre-Packaged Academic / Productivity Suites",
          desc: "Full installation of browsers, PDF readers, media players, WinRAR, and custom programming IDEs (VS Code, Python, C++, Java, Dev-C++) or office software.",
          status: "published"
        },
        {
          id: "lab-4",
          title: "Tamper-Resistant Security Policies",
          desc: "Configuring local group policies and restricted non-admin student profiles prevents unauthorized system setting changes and persistent malware.",
          status: "published"
        }
      ]
    },
    technician: {
      pageStatus: "published",
      badge: "PRIMARY TECHNICIAN PROFILE",
      title: "Meet Your Technician: Safiullah",
      subtitle: "Independent on-site technical assistance by Safiullah \u2014 Computer Science & Cybersecurity practitioner in Peshawar.",
      ethicalCodes: [
        {
          id: "ethic-1",
          title: "Zero Snooping & Absolute Confidentiality",
          desc: "Your personal photos, academic projects, browser cookies, and financial documents remain strictly private. I diagnose and service your computer right before your eyes.",
          status: "published"
        },
        {
          id: "ethic-2",
          title: "Technical Honesty: No Fabricated Faults",
          desc: "If a problem is caused by a loose ribbon cable or outdated driver, I tell you immediately. I never invent nonexistent motherboard or chipset failures to inflate fees.",
          status: "published"
        },
        {
          id: "ethic-3",
          title: "Root-Cause Diagnostics Over Blind Formatting",
          desc: "Many local technicians blindly format your drive when Windows crashes. I inspect minidump BSOD crash logs, test RAM blocks, and isolate hardware errors to solve the real cause.",
          status: "published"
        },
        {
          id: "ethic-4",
          title: "Clear, Respectful Communication",
          desc: "Explaining technical concepts in polite, plain Pashto, Urdu, or English so you understand what happened and how to avoid recurring issues.",
          status: "published"
        }
      ]
    },
    faq: {
      pageStatus: "published",
      badge: "FREQUENTLY ASKED QUESTIONS",
      title: "Frequently Asked Questions",
      subtitle: "Clear, direct answers about our on-site computer support in Peshawar, pricing, privacy, and procedures."
    },
    contact: {
      pageStatus: "published",
      badge: "DIRECT ON-SITE DISPATCH",
      title: "Schedule On-Site Support or Consult Directly",
      subtitle: "Choose the easiest way to reach us. Submit our service booking form or send a WhatsApp message for rapid response in Peshawar.",
      peshawarAreas: [
        { id: "area-1", name: "University Town", speed: "20 - 40 Mins", note: "Fast Dispatch", status: "published" },
        { id: "area-2", name: "Hayatabad (Phases 1 - 7)", speed: "30 - 50 Mins", note: "Daily Coverage", status: "published" },
        { id: "area-3", name: "Board Bazaar & Tehkal", speed: "20 - 35 Mins", note: "Fast Dispatch", status: "published" },
        { id: "area-4", name: "UoA / UoP Campus & Hostels", speed: "15 - 30 Mins", note: "Direct Access", status: "published" },
        { id: "area-5", name: "Saddar & Cantt Areas", speed: "30 - 50 Mins", note: "Daily Coverage", status: "published" },
        { id: "area-6", name: "Warsak Road & Surrounds", speed: "35 - 55 Mins", note: "Scheduled Visits", status: "published" },
        { id: "area-7", name: "Ring Road & Gulbahar", speed: "35 - 55 Mins", note: "Daily Coverage", status: "published" },
        { id: "area-8", name: "Dalazak Road & Kohat Road", speed: "45 - 65 Mins", note: "Scheduled Visits", status: "published" }
      ]
    }
  }
};
db = { ...defaultData };
export {
  NOTIFICATION_DESTINATION,
  generateAdminSessionToken,
  getNotificationDestination,
  getPeshawarDateTimeString,
  getPeshawarShortTimeString,
  getPeshawarTimeString,
  getResendApiKey,
  getResendFromEmail,
  getTechnicianPhone,
  getTechnicianWhatsApp,
  sendNotificationEmail,
  verifyAdminSessionToken
};
