// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

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
function getAdminAuth() {
  if (!_auth) {
    initFirebaseAdmin();
  }
  return _auth;
}

// server/email/emailService.ts
import nodemailer from "nodemailer";
var SETTINGS_EMAIL_DOC = "email";
function sanitizeEmailSubject(rawSubject) {
  if (!rawSubject) return "TechFix Peshawar On-Site Service Notification";
  return rawSubject.replace(/\[VERIFIED TEST\]/gi, "TechFix Verification Test:").replace(/\[TEST\]/gi, "TechFix Test:").replace(/\[URGENT\]/gi, "Priority Notice:").replace(/\[CONFIRMED\]/gi, "Appointment Confirmed:").replace(/\[LEAD INQUIRY\]/gi, "Customer Inquiry:").replace(/\[RESENT INQUIRY\]/gi, "Inquiry Update:").replace(/\s{2,}/g, " ").trim();
}
function generateEmailFooterHtml(recipientEmail) {
  return `
  <!-- Deliverability & Authenticity Footer -->
  <div style="background-color:#090d16; padding:20px 24px; text-align:center; border-top:1px solid #1e293b; font-size:11px; color:#64748b; line-height:1.6;">
    <p style="margin:0 0 6px 0; font-weight:700; color:#cbd5e1; letter-spacing:0.3px;">
      TechFix On-Site Computer Support & Hardware Diagnostics
    </p>
    <p style="margin:0 0 6px 0; color:#94a3b8;">
      University Town, Saddar & Hayatabad, Peshawar, Khyber Pakhtunkhwa, Pakistan \u2022 Helpline: +92 327 5526107
    </p>
    <p style="margin:0; font-size:10px; color:#64748b;">
      Authentic transactional service notification${recipientEmail ? ` for ${recipientEmail}` : ""}.
    </p>
  </div>
  `;
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
async function getSafeEmailSettings() {
  const full = await getFullEmailSettings();
  return {
    provider: full.provider,
    senderEmail: full.senderEmail,
    adminEmail: full.adminEmail,
    smtpHost: full.smtpHost || "smtp.gmail.com",
    smtpPort: full.smtpPort || 465,
    smtpUser: full.smtpUser || "techfixpeshawar@gmail.com",
    resendApiKeyConfigured: !!(full.resendApiKey && full.resendApiKey.length >= 10),
    smtpPasswordConfigured: !!(full.smtpPassword && full.smtpPassword.length >= 8),
    gmailAppPasswordConfigured: !!(full.smtpPassword && full.smtpPassword.length === 16)
  };
}
async function saveEmailSettings(incoming) {
  const current = await getFullEmailSettings();
  const updated = {
    provider: incoming.provider || current.provider,
    senderEmail: incoming.senderEmail ? incoming.senderEmail.trim() : current.senderEmail,
    adminEmail: incoming.adminEmail ? incoming.adminEmail.trim() : current.adminEmail,
    smtpHost: incoming.smtpHost ? incoming.smtpHost.trim() : current.smtpHost,
    smtpPort: incoming.smtpPort ? Number(incoming.smtpPort) : current.smtpPort,
    smtpUser: incoming.smtpUser ? incoming.smtpUser.trim() : current.smtpUser,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (incoming.clearResendApiKey) {
    updated.resendApiKey = "";
  } else if (incoming.resendApiKey && incoming.resendApiKey.trim().length > 0) {
    updated.resendApiKey = incoming.resendApiKey.trim();
  } else {
    updated.resendApiKey = current.resendApiKey;
  }
  const incomingPassword = (incoming.smtpPassword || incoming.gmailAppPassword || "").trim().replace(/\s+/g, "");
  if (incoming.clearSmtpPassword) {
    updated.smtpPassword = "";
  } else if (incomingPassword.length > 0) {
    updated.smtpPassword = incomingPassword;
  } else {
    updated.smtpPassword = current.smtpPassword;
  }
  try {
    const db2 = getAdminFirestore();
    await db2.collection("settings").doc(SETTINGS_EMAIL_DOC).set(updated, { merge: true });
    console.log(`[EMAIL SERVICE] Settings saved to Firestore (settings/email). Provider: ${updated.provider} | Resend Key Configured: ${!!updated.resendApiKey} | SMTP Pass Configured: ${!!updated.smtpPassword}`);
  } catch (err) {
    console.warn(`[EMAIL SERVICE] Firestore settings save note (requires FIREBASE_PRIVATE_KEY in production):`, err?.message || err);
  }
  return getSafeEmailSettings();
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
var PORT = 3e3;
var IS_VERCEL = !!process.env.VERCEL;
var DB_FILE = IS_VERCEL ? path.join("/tmp", "techfix_database.json") : path.join(process.cwd(), "data", "database.json");
function getFirebaseAdminAuthInstance() {
  return getAdminAuth();
}
var FIREBASE_CLIENT_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0759593306"
};
async function verifyFirebaseIdTokenFallback(idToken) {
  if (!idToken || typeof idToken !== "string") return null;
  const apiKey = FIREBASE_CLIENT_CONFIG.apiKey;
  if (!apiKey) return null;
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    if (response.ok) {
      const data = await response.json();
      const user = data.users && data.users[0];
      if (user && user.email) {
        return user.email.toLowerCase();
      }
    }
  } catch (err) {
    console.warn("[AUTH] Firebase REST token verification note:", err?.message);
  }
  return null;
}
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
function validateImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return { valid: false, ext: "" };
  if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71) {
    return { valid: true, ext: "png" };
  }
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return { valid: true, ext: "jpg" };
  }
  if (buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80) {
    return { valid: true, ext: "webp" };
  }
  if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56) {
    return { valid: true, ext: "gif" };
  }
  return { valid: false, ext: "" };
}
var CREDENTIAL_FIELDS = [
  "gmailAppPassword",
  "resendApiKey",
  "adminPassword",
  "apiSecret",
  "smtpPassword",
  "smtpUser",
  "brevoApiKey",
  "googleAppPassword"
];
async function saveSettingsToFirestore(settings) {
  try {
    const fsDb = getAdminFirestore();
    const ref = fsDb.collection("settings").doc("site_config");
    const clean = {};
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v !== "function" && typeof v !== "undefined" && !CREDENTIAL_FIELDS.includes(k)) {
        clean[k] = v;
      }
    }
    await ref.set({ ...clean, _updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, { merge: true });
    console.log("[FIRESTORE] \u2705 Public settings saved to Firestore (settings/site_config)");
  } catch (err) {
    console.error("[FIRESTORE] \u274C Save failed:", err);
  }
}
async function loadSettingsFromFirestore() {
  try {
    const fsDb = getAdminFirestore();
    const ref = fsDb.collection("settings").doc("site_config");
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      delete data._updatedAt;
      delete data._migratedFromAdmin;
      console.log("[FIRESTORE] \u2705 Settings loaded from Firestore (settings/site_config)");
      return data;
    }
    console.log("[FIRESTORE] No saved settings in Firestore yet \u2014 using defaults");
    return null;
  } catch (err) {
    console.error("[FIRESTORE] \u274C Load failed:", err);
    return null;
  }
}
async function syncDocToFirestore(collectionName, docId, data) {
  try {
    const fsDb = getAdminFirestore();
    await fsDb.collection(collectionName).doc(String(docId)).set(data, { merge: true });
  } catch (err) {
    console.error(`[FIRESTORE] Sync ${collectionName}/${docId} error:`, err?.message || err);
  }
}
async function deleteDocFromFirestore(collectionName, docId) {
  try {
    const fsDb = getAdminFirestore();
    await fsDb.collection(collectionName).doc(String(docId)).delete();
  } catch (err) {
    console.error(`[FIRESTORE] Delete ${collectionName}/${docId} error:`, err?.message || err);
  }
}
async function saveProblemLeadToFirestore(lead) {
  try {
    const fsDb = getAdminFirestore();
    if (!lead?.id) return;
    const ref = fsDb.collection("inquiries").doc(String(lead.id));
    const clean = {};
    for (const [k, v] of Object.entries(lead)) {
      if (typeof v !== "function" && typeof v !== "undefined") clean[k] = v;
    }
    await ref.set({
      ...clean,
      type: "problem-lead",
      _updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, { merge: true });
    console.log(`[FIRESTORE] \u2705 Problem lead saved: ${lead.id}`);
  } catch (err) {
    console.error(`[FIRESTORE] \u274C Problem lead save failed (${lead?.id}):`, err);
  }
}
async function deleteProblemLeadFromFirestore(id) {
  try {
    const fsDb = getAdminFirestore();
    if (!id) return;
    await fsDb.collection("inquiries").doc(String(id)).delete();
    console.log(`[FIRESTORE] \u2705 Problem lead deleted: ${id}`);
  } catch (err) {
    console.error(`[FIRESTORE] \u274C Problem lead delete failed (${id}):`, err);
  }
}
async function loadProblemLeadsFromFirestore() {
  try {
    const fsDb = getAdminFirestore();
    const snap = await fsDb.collection("inquiries").where("type", "==", "problem-lead").get();
    if (!snap.empty) {
      const items = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const item = { id: d.id, ...data };
        delete item._updatedAt;
        items.push(item);
      });
      items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return items;
    }
  } catch (err) {
    console.error("[FIRESTORE] \u274C Problem leads load failed:", err);
  }
  return [];
}
async function saveProblemSolutionsToFirestore(solutions) {
  try {
    const fsDb = getAdminFirestore();
    if (!Array.isArray(solutions)) return;
    const cleanList = solutions.map((item) => {
      const clean = {};
      for (const [k, v] of Object.entries(item)) {
        if (typeof v !== "function" && typeof v !== "undefined") clean[k] = v;
      }
      return clean;
    });
    await fsDb.collection("settings").doc("problem_solutions").set({
      items: cleanList,
      _updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, { merge: true });
    console.log(`[FIRESTORE] \u2705 ${solutions.length} Problem solutions saved`);
  } catch (err) {
    console.error("[FIRESTORE] \u274C Problem solutions save failed:", err);
  }
}
async function loadProblemSolutionsFromFirestore() {
  try {
    const fsDb = getAdminFirestore();
    const snap = await fsDb.collection("settings").doc("problem_solutions").get();
    if (snap.exists) {
      const data = snap.data();
      if (Array.isArray(data?.items)) {
        console.log(`[FIRESTORE] \u2705 ${data.items.length} Problem solutions loaded from Firestore`);
        return data.items;
      }
    }
  } catch (err) {
    console.error("[FIRESTORE] \u274C Problem solutions load failed:", err);
  }
  return null;
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
function generateBrandedEmailHtml({
  clientName,
  fullName,
  title,
  badge,
  email,
  phone,
  whatsapp,
  subject,
  service,
  budget,
  message,
  area,
  urgency
}) {
  const effectiveClientName = clientName || fullName || "Valued Customer";
  const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
  const waNumber = (whatsapp || cleanPhone).startsWith("0") ? "92" + (whatsapp || cleanPhone).slice(1) : (whatsapp || cleanPhone).startsWith("+") ? (whatsapp || cleanPhone).slice(1) : whatsapp || cleanPhone;
  const waReplyLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${clientName}, this is Safiullah from TechFix Peshawar following up on your inquiry about ${subject || service || "computer service"}.`)}`;
  const mailtoLink = email ? `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject || service || "Computer Service Inquiry - TechFix Peshawar"}`)}&body=${encodeURIComponent(`Hello ${clientName},

Thank you for contacting TechFix Peshawar regarding your request.

`)}` : "";
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Lead Inquiry - TechFix Peshawar</title>
  </head>
  <body style="margin:0; padding:24px 0; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9;">
    <div style="max-width:600px; margin:0 auto; background-color:#0f172a; border-radius:16px; overflow:hidden; border:1px solid #1e293b; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
      
      <!-- Brand Header Badge -->
      <div style="background: linear-gradient(135deg, #0284c7, #0f766e); padding: 28px 24px; text-align: center; border-bottom: 2px solid #38bdf8;">
        <span style="display:inline-block; background-color:rgba(15, 23, 42, 0.6); color:#38bdf8; font-size:11px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; padding:4px 12px; border-radius:9999px; margin-bottom:10px; border:1px solid rgba(56, 189, 248, 0.4);">
          \u26A1 TECHFIX PESHAWAR \u2022 NEW INQUIRY ALERT
        </span>
        <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
          Customer Lead & Contact Inquiry
        </h1>
        <p style="margin:6px 0 0 0; font-size:13px; color:#cbd5e1;">
          Direct On-Site Support \u2022 Peshawar, Khyber Pakhtunkhwa
        </p>
      </div>

      <!-- Main Content -->
      <div style="padding: 28px 24px;">
        
        <!-- Summary Callout -->
        <div style="background-color:#1e293b; border-radius:12px; padding:16px 20px; margin-bottom:24px; border-left:4px solid #38bdf8;">
          <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:4px;">
            Subject / Service Requested
          </div>
          <div style="font-size:17px; font-weight:bold; color:#38bdf8;">
            ${subject || service || "General Computer Repair / Service Query"}
          </div>
        </div>

        <!-- Details Table -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px;">
          <tbody>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; width:150px; font-weight:600;">Client Name:</td>
              <td style="padding:10px 0; color:#ffffff; font-weight:700;">${effectiveClientName}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Email:</td>
              <td style="padding:10px 0;">
                ${email ? `<a href="mailto:${email}" style="color:#38bdf8; text-decoration:none; font-weight:600;">${email}</a>` : '<span style="color:#64748b;">Not provided</span>'}
              </td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Phone / WhatsApp:</td>
              <td style="padding:10px 0;">
                <a href="tel:${phone}" style="color:#34d399; text-decoration:none; font-weight:bold; margin-right:12px;">${phone}</a>
                <a href="${waReplyLink}" style="display:inline-block; font-size:11px; background-color:#065f46; color:#a7f3d0; padding:2px 8px; border-radius:6px; text-decoration:none; font-weight:bold;">WhatsApp</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Subject / Service:</td>
              <td style="padding:10px 0; color:#f1f5f9; font-weight:600;">${subject || service || "Computer Diagnostics & Support"}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Budget / Quote:</td>
              <td style="padding:10px 0; color:#fbbf24; font-weight:bold;">${budget || "Pending On-Site Inspection (From Rs. 500)"}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Location / Area:</td>
              <td style="padding:10px 0; color:#f1f5f9;">${area || "Peshawar"}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#94a3b8; font-weight:600;">Submitted Time:</td>
              <td style="padding:10px 0; color:#38bdf8; font-weight:bold;">${getPeshawarDateTimeString()} (PKT, UTC+5)</td>
            </tr>
          </tbody>
        </table>

        <!-- Message / Details Box -->
        <div style="background-color:#1e293b; border-radius:12px; padding:18px 20px; margin-bottom:28px; border:1px solid #334155;">
          <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:8px;">
            Message & Problem Description
          </div>
          <div style="font-size:14px; line-height:1.6; color:#e2e8f0; white-space:pre-wrap;">${message}</div>
        </div>

        <!-- High Contrast CTA Action Buttons -->
        <div style="text-align:center; padding:10px 0 10px 0;">
          ${email ? `
            <a href="${mailtoLink}" style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.4);">
              \u2709\uFE0F Reply Directly to Client
            </a>
          ` : ""}
          <a href="${waReplyLink}" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(5, 150, 105, 0.4);">
            \u{1F4AC} Chat on WhatsApp
          </a>
        </div>

      </div>

      ${generateEmailFooterHtml(NOTIFICATION_DESTINATION)}

    </div>
  </body>
  </html>
  `;
}
function generateBrandedEmailText({
  clientName,
  email,
  phone,
  subject,
  service,
  budget,
  message,
  area
}) {
  return `
========================================
\u26A1 TECHFIX PESHAWAR - NEW LEAD INQUIRY
========================================

Client Name:    ${clientName}
Email:          ${email || "Not provided"}
Phone/WhatsApp: ${phone}
Area/Location:  ${area || "Peshawar"}
Subject:        ${subject || service || "Computer Repair Inquiry"}
Budget:         ${budget || "Pending Inspection"}
Submitted At:   ${getPeshawarDateTimeString()} (PKT, UTC+5)

MESSAGE / DETAILS:
${message}

Reply via Email:    mailto:${email || ""}
WhatsApp Direct:    https://wa.me/${(phone || "").replace(/[^0-9]/g, "")}
========================================
  `.trim();
}
function generateAppointmentConfirmedEmailHtml({
  booking,
  scheduledTime
}) {
  const techWa = getTechnicianWhatsApp();
  const techPhone = getTechnicianPhone();
  const waTechLink = `https://wa.me/${techWa}?text=${encodeURIComponent(`Hello Safiullah! I received my appointment confirmation (#${booking.id}) for ${scheduledTime}.`)}`;
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appointment Confirmed - TechFix Peshawar</title>
  </head>
  <body style="margin:0; padding:24px 0; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9;">
    <div style="max-width:600px; margin:0 auto; background-color:#0f172a; border-radius:16px; overflow:hidden; border:1px solid #1e293b; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
      
      <!-- Brand Header -->
      <div style="background: linear-gradient(135deg, #059669, #0284c7); padding: 28px 24px; text-align: center; border-bottom: 2px solid #10b981;">
        <span style="display:inline-block; background-color:rgba(15, 23, 42, 0.7); color:#34d399; font-size:11px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; padding:5px 14px; border-radius:9999px; margin-bottom:10px; border:1px solid rgba(52, 211, 153, 0.4);">
          \u2713 APPOINTMENT SCHEDULED & CONFIRMED
        </span>
        <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
          TechFix Peshawar \u2022 On-Site Service Confirmed
        </h1>
        <p style="margin:6px 0 0 0; font-size:13px; color:#e0e7ff;">
          Computer Science & Hardware Specialist \u2022 Direct Doorstep Support
        </p>
      </div>

      <!-- Main Notification Body -->
      <div style="padding: 28px 24px;">
        <p style="margin:0 0 16px 0; font-size:15px; color:#e2e8f0; line-height:1.6;">
          Hello <strong>${booking.fullName}</strong>,
        </p>
        
        <!-- Big Green Confirmation Banner -->
        <div style="background: linear-gradient(135deg, rgba(5, 150, 105, 0.15), rgba(14, 165, 233, 0.1)); border: 1px solid rgba(52, 211, 153, 0.4); border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #34d399; margin-bottom: 6px;">
            Technician Arrival Confirmation
          </div>
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; line-height: 1.5;">
            Your scheduled appointment is confirmed! Our technician will arrive at:
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #38bdf8; margin-top: 8px; font-family: monospace;">
            \u{1F4C5} ${scheduledTime}
          </div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 6px;">
            Service Area: <strong style="color: #f1f5f9;">${booking.area} (Peshawar)</strong>
          </div>
        </div>

        <!-- Reference ID Card -->
        <div style="background-color:#1e293b; border-radius:10px; padding:14px 16px; margin-bottom:20px; border-left:4px solid #10b981; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:bold; text-transform:uppercase; color:#94a3b8;">Booking Reference ID</div>
            <div style="font-size:18px; font-weight:bold; color:#38bdf8; font-family:monospace; margin-top:2px;">${booking.id}</div>
          </div>
          <div style="text-align:right;">
            <span style="background-color:rgba(16, 185, 129, 0.2); color:#34d399; font-size:11px; font-weight:bold; padding:4px 10px; border-radius:6px; border:1px solid rgba(52, 211, 153, 0.3);">CONFIRMED</span>
          </div>
        </div>

        <!-- Appointment Full Breakdown Table -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px;">
          <tbody>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8; width:150px;">Customer:</td>
              <td style="padding:10px 0; color:#f8fafc; font-weight:bold;">${booking.fullName}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Primary Phone:</td>
              <td style="padding:10px 0; color:#38bdf8; font-weight:bold;"><a href="tel:${booking.phone}" style="color:#38bdf8; text-decoration:none;">${booking.phone}</a></td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">WhatsApp:</td>
              <td style="padding:10px 0; color:#34d399; font-weight:bold;">${booking.whatsapp || booking.phone}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Area / Sector:</td>
              <td style="padding:10px 0; color:#f8fafc; font-weight:bold;">${booking.area} (Peshawar)</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Service Required:</td>
              <td style="padding:10px 0; color:#fbbf24; font-weight:bold;">${booking.serviceRequired}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Device & Model:</td>
              <td style="padding:10px 0; color:#f8fafc;">${booking.deviceType} ${booking.computerBrandModel ? `\u2014 ${booking.computerBrandModel}` : ""}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Preferred Schedule:</td>
              <td style="padding:10px 0; color:#cbd5e1;">${booking.preferredDate} (${booking.preferredTime})</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Confirmed Schedule:</td>
              <td style="padding:10px 0; color:#34d399; font-weight:bold;">${scheduledTime}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Urgency:</td>
              <td style="padding:10px 0; color:${booking.urgency === "Urgent" ? "#f87171" : "#f8fafc"}; font-weight:bold;">${(booking.urgency || "NORMAL").toUpperCase()}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0; color:#94a3b8;">Important Data:</td>
              <td style="padding:10px 0; color:#f8fafc;">${booking.containsImportantData || "NO"}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#94a3b8;">Submitted Time:</td>
              <td style="padding:10px 0; color:#38bdf8; font-weight:bold;">${getPeshawarDateTimeString(booking.createdAt)} (PKT)</td>
            </tr>
          </tbody>
        </table>

        <!-- Problem Description Note -->
        <div style="background-color:#1e293b; border-radius:10px; padding:14px 16px; margin-bottom:24px; border:1px solid #334155;">
          <div style="font-size:11px; font-weight:bold; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">
            Diagnosed Problem / Job Notes
          </div>
          <div style="font-size:13px; color:#e2e8f0; line-height:1.5; white-space:pre-wrap;">${booking.problemDescription}</div>
        </div>

        <!-- Direct Reply / Action Buttons -->
        <div style="text-align:center; padding:10px 0;">
          <a href="${waTechLink}" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(5, 150, 105, 0.4);">
            \u{1F4AC} Reply on WhatsApp
          </a>
          <a href="tel:${techPhone.replace(/\s+/g, "")}" style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.4);">
            \u{1F4DE} Call Technician (${techPhone})
          </a>
        </div>

      </div>

      ${generateEmailFooterHtml(booking.email)}

    </div>
  </body>
  </html>
  `;
}
function generateTechnicianContactEmailHtml({
  booking,
  technicianNote
}) {
  const techWa = getTechnicianWhatsApp();
  const techPhone = getTechnicianPhone();
  const waTechLink = `https://wa.me/${techWa}?text=${encodeURIComponent(`Hello Safiullah! I received your message regarding my service request (#${booking.id}).`)}`;
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Technician Contacting You - TechFix Peshawar</title>
  </head>
  <body style="margin:0; padding:24px 0; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9;">
    <div style="max-width:600px; margin:0 auto; background-color:#0f172a; border-radius:16px; overflow:hidden; border:1px solid #1e293b; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #2563eb, #0284c7); padding: 28px 24px; text-align: center; border-bottom: 2px solid #38bdf8;">
        <span style="display:inline-block; background-color:rgba(15, 23, 42, 0.7); color:#38bdf8; font-size:11px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; padding:5px 14px; border-radius:9999px; margin-bottom:10px; border:1px solid rgba(56, 189, 248, 0.4);">
          \u26A1 TECHNICIAN UPDATE \u2022 CONTACT INITIATED
        </span>
        <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
          TechFix Peshawar \u2022 Service Update
        </h1>
        <p style="margin:6px 0 0 0; font-size:13px; color:#bae6fd;">
          Direct Follow-up on Your Computer Service Request
        </p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 24px;">
        <p style="margin:0 0 16px 0; font-size:15px; color:#e2e8f0; line-height:1.6;">
          Hello <strong>${booking.fullName}</strong>,
        </p>

        <!-- Message Box -->
        <div style="background: linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(14, 165, 233, 0.1)); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; line-height: 1.5;">
            Our technician is contacting you! Please check your WhatsApp or incoming calls.
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin: 8px 0 0 0; line-height: 1.6;">
            We have reached out to your phone / WhatsApp number: <strong style="color:#38bdf8;">${booking.phone}</strong>.
          </p>
        </div>

        ${technicianNote ? `
        <!-- Custom Technician Note -->
        <div style="background-color:#1e293b; border-radius:10px; padding:16px; margin-bottom:20px; border-left:4px solid #38bdf8;">
          <div style="font-size:11px; font-weight:bold; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">
            Note from Head Technician (Safiullah):
          </div>
          <div style="font-size:14px; color:#f1f5f9; line-height:1.6; font-style:italic;">
            "${technicianNote}"
          </div>
        </div>
        ` : ""}

        <!-- Booking Details -->
        <div style="background-color:#0b1120; border-radius:10px; padding:16px; margin-bottom:24px; border:1px solid #1e293b;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <tbody>
              <tr>
                <td style="padding:6px 0; color:#94a3b8; width:140px;">Booking Ref ID:</td>
                <td style="padding:6px 0; color:#38bdf8; font-weight:bold; font-family:monospace;">${booking.id}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#94a3b8;">Service:</td>
                <td style="padding:6px 0; color:#fbbf24; font-weight:bold;">${booking.serviceRequired}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#94a3b8;">Device:</td>
                <td style="padding:6px 0; color:#f8fafc;">${booking.deviceType} ${booking.computerBrandModel ? `\u2014 ${booking.computerBrandModel}` : ""}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#94a3b8;">Location:</td>
                <td style="padding:6px 0; color:#f8fafc;">${booking.area} (Peshawar)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Direct CTA Buttons -->
        <div style="text-align:center; padding:10px 0;">
          <a href="${waTechLink}" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(5, 150, 105, 0.4);">
            \u{1F4AC} Chat on WhatsApp
          </a>
          <a href="tel:${techPhone.replace(/\s+/g, "")}" style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; margin:6px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.4);">
            \u{1F4DE} Call Technician (${techPhone})
          </a>
        </div>

      </div>

      ${generateEmailFooterHtml(booking.email)}

    </div>
  </body>
  </html>
  `;
}
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
async function dispatchEmail(options) {
  const result = await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text
  });
  return {
    success: result.success,
    delivered: result.success,
    provider: result.provider,
    status: result.success ? "sent" : "failed",
    messageId: result.messageId,
    recipient: result.sentTo,
    error: result.error
  };
}
function ensureDbDirectory() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (err) {
  }
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
function loadDb() {
  ensureDbDirectory();
  const repoDbFile = path.join(APP_ROOT, "data", "database.json");
  if (!fs.existsSync(DB_FILE) && fs.existsSync(repoDbFile)) {
    try {
      const seedContent = fs.readFileSync(repoDbFile, "utf-8");
      fs.writeFileSync(DB_FILE, seedContent, "utf-8");
    } catch (seedErr) {
      console.warn("[DB] Cold start /tmp seed note:", seedErr?.message);
    }
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      db = {
        settings: { ...defaultData.settings, ...parsed.settings || {} },
        services: Array.isArray(parsed.services) ? parsed.services : defaultData.services,
        serviceAreas: Array.isArray(parsed.serviceAreas) ? parsed.serviceAreas : defaultData.serviceAreas,
        faqs: Array.isArray(parsed.faqs) ? parsed.faqs : defaultData.faqs,
        caseStudies: Array.isArray(parsed.caseStudies) ? parsed.caseStudies : defaultData.caseStudies,
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : defaultData.bookings,
        inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : defaultData.inquiries || [],
        websiteContent: { ...defaultData.websiteContent, ...parsed.websiteContent || {} },
        categories: Array.isArray(parsed.categories) ? parsed.categories : defaultData.categories,
        media: Array.isArray(parsed.media) ? parsed.media : defaultData.media,
        customers: Array.isArray(parsed.customers) ? parsed.customers : defaultData.customers,
        activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : defaultData.activityLogs,
        pageSections: parsed.pageSections ? { ...defaultData.pageSections, ...parsed.pageSections } : defaultData.pageSections,
        problemSolutions: Array.isArray(parsed.problemSolutions) ? parsed.problemSolutions : [],
        problemLeads: Array.isArray(parsed.problemLeads) ? parsed.problemLeads : []
      };
    } catch (err) {
      console.error("Error reading database file, using defaults:", err);
      db = { ...defaultData };
      saveDb();
    }
  } else {
    db = { ...defaultData };
    saveDb();
  }
}
function saveDb() {
  ensureDbDirectory();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving database file:", err);
  }
}
loadDb();
NOTIFICATION_DESTINATION = getNotificationDestination();
var _firestoreReadyResolve;
var firestoreReady = new Promise((resolve) => {
  _firestoreReadyResolve = resolve;
});
(async () => {
  try {
    const adminDb = getAdminFirestore();
    const firestoreSettings = await loadSettingsFromFirestore();
    if (firestoreSettings && typeof firestoreSettings === "object" && Object.keys(firestoreSettings).length > 0) {
      db.settings = { ...db.settings, ...firestoreSettings };
    }
    const emailCreds = await getFullEmailSettings();
    NOTIFICATION_DESTINATION = emailCreds.adminEmail || getNotificationDestination();
    const envResendKey = (process.env.RESEND_API_KEY || "").trim();
    const envGmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || "").trim();
    if (!emailCreds.resendApiKey && envResendKey || !emailCreds.smtpPassword && envGmailPass) {
      await saveEmailSettings({
        resendApiKey: envResendKey || void 0,
        gmailAppPassword: envGmailPass || void 0,
        senderEmail: process.env.RESEND_FROM || process.env.FROM_EMAIL,
        adminEmail: process.env.TARGET_EMAIL || process.env.ADMIN_EMAIL,
        smtpUser: process.env.GMAIL_USER || process.env.GMAIL_ADDRESS
      });
      console.log("[FIRESTORE] \u2705 Initial email credentials seeded from environment variables to Firestore (settings/email)");
    }
    const servicesSnap = await adminDb.collection("services").get().catch(() => null);
    if (servicesSnap && !servicesSnap.empty) {
      db.services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`[FIRESTORE] \u2705 db.services overlaid (${db.services.length} items) from Firestore on startup`);
    } else if (Array.isArray(db.services) && db.services.length > 0) {
      for (const s of db.services) {
        if (s.id) await adminDb.collection("services").doc(s.id).set(s, { merge: true }).catch(() => {
        });
      }
      console.log(`[FIRESTORE] \u2705 Seeded initial ${db.services.length} services to Firestore`);
    }
    const faqsSnap = await adminDb.collection("faqs").get().catch(() => null);
    if (faqsSnap && !faqsSnap.empty) {
      db.faqs = faqsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`[FIRESTORE] \u2705 db.faqs overlaid (${db.faqs.length} items) from Firestore on startup`);
    } else if (Array.isArray(db.faqs) && db.faqs.length > 0) {
      for (const f of db.faqs) {
        if (f.id) await adminDb.collection("faqs").doc(f.id).set(f, { merge: true }).catch(() => {
        });
      }
      console.log(`[FIRESTORE] \u2705 Seeded initial ${db.faqs.length} FAQs to Firestore`);
    }
    const casesSnap = await adminDb.collection("caseStudies").get().catch(() => null);
    if (casesSnap && !casesSnap.empty) {
      db.caseStudies = casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`[FIRESTORE] \u2705 db.caseStudies overlaid (${db.caseStudies.length} items) from Firestore on startup`);
    } else if (Array.isArray(db.caseStudies) && db.caseStudies.length > 0) {
      for (const c of db.caseStudies) {
        if (c.id) await adminDb.collection("caseStudies").doc(c.id).set(c, { merge: true }).catch(() => {
        });
      }
      console.log(`[FIRESTORE] \u2705 Seeded initial ${db.caseStudies.length} case studies to Firestore`);
    }
    const firestoreSolutions = await loadProblemSolutionsFromFirestore();
    if (Array.isArray(firestoreSolutions) && firestoreSolutions.length > 0) {
      db.problemSolutions = firestoreSolutions;
      console.log(`[FIRESTORE] \u2705 db.problemSolutions overlaid (${firestoreSolutions.length} items) from Firestore on startup`);
    } else if (Array.isArray(db.problemSolutions) && db.problemSolutions.length > 0) {
      await saveProblemSolutionsToFirestore(db.problemSolutions);
      console.log(`[FIRESTORE] \u2705 Seeded initial ${db.problemSolutions.length} problem solutions to Firestore`);
    }
    const firestoreLeads = await loadProblemLeadsFromFirestore();
    if (Array.isArray(firestoreLeads) && firestoreLeads.length > 0) {
      db.problemLeads = firestoreLeads;
      console.log(`[FIRESTORE] \u2705 db.problemLeads overlaid (${firestoreLeads.length} items) from Firestore on startup`);
    }
  } catch (err) {
    console.error("[FIRESTORE] Startup overlay error:", err);
  } finally {
    _firestoreReadyResolve();
  }
})();
app.get("/uploads/:filename", (req, res, next) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(filePath);
  }
  const targetUrl = `/uploads/${filename}`;
  const found = db.media?.find((m) => m.url === targetUrl || m.url?.endsWith(`/${filename}`));
  const dataUrlCandidate = found?.dataUrl || (db.settings?.technicianPhoto?.startsWith("data:image/") ? db.settings.technicianPhoto : null);
  if (dataUrlCandidate && dataUrlCandidate.startsWith("data:image/")) {
    const matches = dataUrlCandidate.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
    if (matches && matches[2]) {
      const mime = `image/${matches[1]}`;
      const buf = Buffer.from(matches[2].replace(/\s+/g, ""), "base64");
      try {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.writeFileSync(filePath, buf);
      } catch (e) {
        console.warn("Auto-recreating upload file on disk note:", e);
      }
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buf);
    }
  }
  next();
});
app.use("/uploads", express.static(UPLOADS_DIR));
app.get("/api/data", async (req, res) => {
  await Promise.race([
    firestoreReady,
    new Promise((resolve) => setTimeout(resolve, 3e3))
    // max 3s wait, then serve anyway
  ]);
  const publicSettings = { ...db.settings };
  delete publicSettings.resendApiKey;
  delete publicSettings.gmailAppPassword;
  delete publicSettings.adminPassword;
  delete publicSettings.apiSecret;
  delete publicSettings.smtpPassword;
  delete publicSettings.smtpUser;
  delete publicSettings.brevoApiKey;
  res.json({
    services: db.services.filter((s) => s.status === "active"),
    faqs: db.faqs,
    settings: publicSettings,
    serviceAreas: db.serviceAreas,
    caseStudies: db.caseStudies,
    websiteContent: db.websiteContent,
    categories: db.categories,
    pageSections: db.pageSections,
    problemSolutions: (db.problemSolutions || []).filter((p) => p.status !== "unpublished")
  });
});
app.get("/api/admin/settings", checkAdminAuth, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const configSnap = await adminDb.collection("settings").doc("site_config").get().catch(() => null);
    const siteConfig = configSnap && configSnap.exists ? configSnap.data() || {} : db?.settings || {};
    const safeEmail = await getSafeEmailSettings();
    delete siteConfig.resendApiKey;
    delete siteConfig.gmailAppPassword;
    delete siteConfig.smtpPassword;
    delete siteConfig.adminPassword;
    delete siteConfig.apiSecret;
    res.json({
      settings: {
        ...siteConfig,
        ...safeEmail
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load admin settings: " + err?.message });
  }
});
app.get("/api/page-sections", (req, res) => {
  res.json(db.pageSections);
});
app.post("/api/bookings", publicApiRateLimiter, (req, res) => {
  const {
    fullName,
    email,
    phone,
    whatsapp,
    area,
    deviceType,
    computerBrandModel,
    serviceRequired,
    problemDescription,
    preferredDate,
    preferredTime,
    urgency,
    containsImportantData
  } = req.body;
  if (!fullName || !phone || !problemDescription || !email || !String(email).trim()) {
    return res.status(400).json({ error: "Please provide Full Name, Email Address, Phone Number, and Problem Description." });
  }
  const cleanEmail = String(email).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: "Please provide a valid Email Address for instant confirmation." });
  }
  const cleanPhone = String(phone).trim();
  const cleanPhoneDigits = cleanPhone.replace(/[^0-9]/g, "");
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1e3).toISOString();
  const recentDuplicate = (db.bookings || []).find(
    (b) => b.createdAt && b.createdAt >= tenMinutesAgo && (b.phone && b.phone.replace(/[^0-9]/g, "") === cleanPhoneDigits || b.email && b.email.toLowerCase() === cleanEmail.toLowerCase())
  );
  if (recentDuplicate) {
    return res.status(409).json({
      success: false,
      duplicate: true,
      booking: recentDuplicate,
      message: `A service request was already received from this contact in the last 10 minutes (Reference ID: ${recentDuplicate.id}). Our technician is already reviewing it.`
    });
  }
  const newBooking = {
    id: `PSH-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    fullName: String(fullName).trim(),
    email: cleanEmail,
    phone: String(phone).trim(),
    whatsapp: String(whatsapp || phone).trim(),
    area: String(area || "Peshawar").trim(),
    deviceType: deviceType || "Laptop",
    computerBrandModel: String(computerBrandModel || "").trim(),
    serviceRequired: String(serviceRequired || "General Troubleshooting").trim(),
    problemDescription: String(problemDescription).trim(),
    preferredDate: preferredDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    preferredTime: preferredTime || "Morning (10 AM - 1 PM)",
    urgency: urgency === "Urgent" ? "Urgent" : "Normal",
    containsImportantData: containsImportantData === "YES" ? "YES" : "NO",
    status: "NEW",
    adminNotes: ""
  };
  const newLead = {
    id: `INQ-${newBooking.id.replace(/^PSH-/, "")}`,
    bookingId: newBooking.id,
    fullName: newBooking.fullName,
    name: newBooking.fullName,
    email: newBooking.email,
    phone: newBooking.phone,
    whatsapp: newBooking.whatsapp,
    area: newBooking.area,
    subject: `Service Request: ${newBooking.serviceRequired} (${newBooking.deviceType}${newBooking.computerBrandModel ? " \u2014 " + newBooking.computerBrandModel : ""})`,
    service: newBooking.serviceRequired,
    budget: "Pending On-Site Inspection (From Rs. 500)",
    message: `Problem: ${newBooking.problemDescription}
Device: ${newBooking.deviceType} ${newBooking.computerBrandModel || ""}
Schedule: ${newBooking.preferredDate} (${newBooking.preferredTime})
Urgency: ${newBooking.urgency}
Critical Data: ${newBooking.containsImportantData}`,
    status: "NEW",
    emailNotificationStatus: "sent",
    emailNotificationSentTo: NOTIFICATION_DESTINATION,
    emailNotificationSentAt: (/* @__PURE__ */ new Date()).toISOString(),
    emailNotificationProvider: "smtp",
    createdAt: newBooking.createdAt,
    preferredDate: newBooking.preferredDate,
    preferredTime: newBooking.preferredTime,
    deviceType: newBooking.deviceType,
    computerBrandModel: newBooking.computerBrandModel,
    urgency: newBooking.urgency,
    containsImportantData: newBooking.containsImportantData
  };
  if (!Array.isArray(db.inquiries)) {
    db.inquiries = [];
  }
  db.inquiries.unshift(newLead);
  newBooking.leadId = newLead.id;
  db.bookings.unshift(newBooking);
  try {
    const adminDb = getAdminFirestore();
    Promise.all([
      adminDb.collection("bookings").doc(newBooking.id).set(newBooking).catch((e) => console.warn("[FIRESTORE] bookings write warning:", e?.message)),
      adminDb.collection("serviceRequests").doc(newBooking.id).set(newBooking).catch((e) => console.warn("[FIRESTORE] serviceRequests write warning:", e?.message)),
      adminDb.collection("requests").doc(newBooking.id).set(newBooking).catch((e) => console.warn("[FIRESTORE] requests write warning:", e?.message)),
      adminDb.collection("inquiries").doc(newLead.id).set(newLead).catch((e) => console.warn("[FIRESTORE] inquiries write warning:", e?.message))
    ]).then(() => {
      console.log(`[FIRESTORE] \u2705 Booking ${newBooking.id} & inquiry ${newLead.id} saved to Firestore`);
    });
  } catch (fsSyncErr) {
    console.error("[FIRESTORE] \u274C Admin SDK error:", fsSyncErr?.message || fsSyncErr);
  }
  const existingCust = db.customers.find((c) => c.phone.replace(/\s+/g, "") === newBooking.phone.replace(/\s+/g, ""));
  if (existingCust) {
    existingCust.totalBookings += 1;
    existingCust.lastServiceDate = "Just now";
    if (newBooking.email && !existingCust.email) {
      existingCust.email = newBooking.email;
    }
    if (newBooking.computerBrandModel && !existingCust.devices?.includes(newBooking.computerBrandModel)) {
      existingCust.devices = [...existingCust.devices || [], newBooking.computerBrandModel];
    }
  } else {
    db.customers.unshift({
      id: `cust-${Date.now()}`,
      name: newBooking.fullName,
      email: newBooking.email,
      phone: newBooking.phone,
      whatsapp: newBooking.whatsapp,
      area: newBooking.area,
      totalBookings: 1,
      totalSpent: "Pending",
      lastServiceDate: "Just now",
      notes: "Submitted service request online",
      devices: newBooking.computerBrandModel ? [newBooking.computerBrandModel] : [newBooking.deviceType]
    });
  }
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "New Request Submitted",
    details: `${newBooking.fullName} requested ${newBooking.serviceRequired} (${newBooking.area})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Customer (Online)"
  });
  const waNumber = cleanPhoneDigits.startsWith("0") ? "92" + cleanPhoneDigits.slice(1) : cleanPhoneDigits.startsWith("+") ? cleanPhoneDigits.slice(1) : cleanPhoneDigits;
  const waReplyLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${newBooking.fullName}, this is Safiullah from TechFix Peshawar regarding your ${newBooking.serviceRequired} request.`)}`;
  const bookingEmailHtml = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
    <div style="background: linear-gradient(135deg, #1e3a8a, #0284c7); padding: 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px; color: #ffffff; letter-spacing: 1px;">NEW ON-SITE SERVICE REQUEST</h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #bae6fd;">TechFix Computer Support Peshawar</p>
    </div>
    
    <div style="padding: 24px;">
      <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #38bdf8;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Booking Reference</p>
        <p style="margin: 0; font-size: 18px; font-weight: bold; color: #38bdf8; font-family: monospace;">${newBooking.id}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px; width: 140px;">Customer:</td>
          <td style="padding: 8px 0; color: #f8fafc; font-size: 14px; font-weight: bold;">${newBooking.fullName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Primary Phone:</td>
          <td style="padding: 8px 0; color: #38bdf8; font-size: 14px; font-weight: bold;"><a href="tel:${newBooking.phone}" style="color: #38bdf8; text-decoration: none;">${newBooking.phone}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">WhatsApp:</td>
          <td style="padding: 8px 0; color: #34d399; font-size: 14px; font-weight: bold;"><a href="${waReplyLink}" style="color: #34d399; text-decoration: none;">${newBooking.whatsapp}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Area / Sector:</td>
          <td style="padding: 8px 0; color: #f8fafc; font-size: 14px; font-weight: bold;">${newBooking.area} (Peshawar)</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Service Required:</td>
          <td style="padding: 8px 0; color: #fbbf24; font-size: 14px; font-weight: bold;">${newBooking.serviceRequired}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Device & Model:</td>
          <td style="padding: 8px 0; color: #f8fafc; font-size: 14px;">${newBooking.deviceType} ${newBooking.computerBrandModel ? `\u2014 ${newBooking.computerBrandModel}` : ""}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Preferred Schedule:</td>
          <td style="padding: 8px 0; color: #f8fafc; font-size: 14px;">${newBooking.preferredDate} (${newBooking.preferredTime})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Urgency:</td>
          <td style="padding: 8px 0; color: ${newBooking.urgency === "Urgent" ? "#f87171" : "#f8fafc"}; font-size: 14px; font-weight: bold;">${newBooking.urgency.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Important Data:</td>
          <td style="padding: 8px 0; color: #f8fafc; font-size: 14px;">${newBooking.containsImportantData}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Submitted Time:</td>
          <td style="padding: 8px 0; color: #38bdf8; font-size: 14px; font-weight: bold;">${getPeshawarDateTimeString(newBooking.createdAt)} (PKT)</td>
        </tr>
      </table>

      <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Problem Description</p>
        <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.5; white-space: pre-wrap;">${newBooking.problemDescription}</p>
      </div>

      <div style="text-align: center;">
        <a href="${waReplyLink}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; font-size: 14px; margin-right: 10px;">Reply on WhatsApp</a>
        <a href="tel:${newBooking.phone}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; font-size: 14px;">Call Customer</a>
      </div>
    </div>
    
    <div style="background-color: #090d16; padding: 16px; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
      Dispatched automatically to ${NOTIFICATION_DESTINATION} \u2022 TechFix On-Site Computer Support Peshawar
    </div>
  </div>
  `;
  const bookingEmailText = `
\u{1F514} NEW ON-SITE SERVICE REQUEST / BOOKING
ID: ${newBooking.id}
Customer: ${newBooking.fullName}
Phone: ${newBooking.phone}
WhatsApp: ${newBooking.whatsapp}
Area: ${newBooking.area} (Peshawar)
Service: ${newBooking.serviceRequired}
Device: ${newBooking.deviceType} ${newBooking.computerBrandModel || ""}
Urgency: ${newBooking.urgency}
Important Data: ${newBooking.containsImportantData}
Preferred Slot: ${newBooking.preferredDate} - ${newBooking.preferredTime}
Submitted At: ${getPeshawarDateTimeString(newBooking.createdAt)} (PKT)

Problem Description:
${newBooking.problemDescription}

WhatsApp Quick Reply:
${waReplyLink}
`;
  dispatchEmail({
    to: NOTIFICATION_DESTINATION,
    subject: `[${newBooking.urgency.toUpperCase()}] New Booking: ${newBooking.fullName} (${newBooking.area}) - ${getPeshawarShortTimeString()}`,
    html: bookingEmailHtml,
    text: bookingEmailText
  }).catch((err) => console.error("Technician email dispatch catch:", err));
  if (newBooking.email && newBooking.email.includes("@")) {
    const customerConfirmationHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation - TechFix Peshawar</title>
    </head>
    <body style="margin:0; padding:24px 0; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9;">
      <div style="max-width:600px; margin:0 auto; background-color:#0f172a; border-radius:16px; overflow:hidden; border:1px solid #1e293b; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0284c7, #0f766e); padding: 28px 24px; text-align: center; border-bottom: 2px solid #38bdf8;">
          <div style="display:inline-block; background-color:rgba(15, 23, 42, 0.7); color:#38bdf8; font-size:11px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; padding:4px 12px; border-radius:9999px; margin-bottom:10px; border:1px solid rgba(56, 189, 248, 0.4);">
            \u2713 REQUEST RECEIVED & LOGGED
          </div>
          <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
            TechFix Peshawar \u2022 Booking Confirmation
          </h1>
          <p style="margin:6px 0 0 0; font-size:13px; color:#cbd5e1;">
            Reliable On-Site Computer Support in Peshawar
          </p>
        </div>

        <!-- Body -->
        <div style="padding: 28px 24px;">
          <p style="margin:0 0 16px 0; font-size:15px; color:#e2e8f0; line-height:1.6;">
            Hello <strong>${newBooking.fullName}</strong>,
          </p>
          <p style="margin:0 0 20px 0; font-size:14px; color:#94a3b8; line-height:1.6;">
            Thank you for booking with TechFix Peshawar! We have successfully received your on-site service request. Our head technician, <strong>Safiullah</strong>, has been alerted and will contact you shortly to review the issue and confirm our technician's arrival time.
          </p>

          <!-- Tracking Badge -->
          <div style="background-color:#1e293b; border-radius:12px; padding:16px; margin-bottom:20px; border-left:4px solid #38bdf8;">
            <div style="font-size:11px; font-weight:bold; text-transform:uppercase; color:#94a3b8; margin-bottom:4px;">
              Your Reference Tracking ID
            </div>
            <div style="font-size:20px; font-weight:bold; color:#38bdf8; font-family:monospace;">
              ${newBooking.id}
            </div>
          </div>

          <!-- Service Details Table -->
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
            <tbody>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 0; color:#94a3b8; width:140px;">Service:</td>
                <td style="padding:10px 0; color:#fbbf24; font-weight:bold;">${newBooking.serviceRequired}</td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 0; color:#94a3b8;">Device:</td>
                <td style="padding:10px 0; color:#f1f5f9;">${newBooking.deviceType} ${newBooking.computerBrandModel ? `(${newBooking.computerBrandModel})` : ""}</td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 0; color:#94a3b8;">Location / Area:</td>
                <td style="padding:10px 0; color:#f1f5f9;">${newBooking.area} (Peshawar)</td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 0; color:#94a3b8;">Preferred Window:</td>
                <td style="padding:10px 0; color:#f1f5f9;">${newBooking.preferredDate} \u2014 ${newBooking.preferredTime}</td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 0; color:#94a3b8;">Data Safety Alert:</td>
                <td style="padding:10px 0; color:${newBooking.containsImportantData === "YES" ? "#38bdf8" : "#94a3b8"}; font-weight:bold;">
                  ${newBooking.containsImportantData === "YES" ? "PROTECTED (Important Data Flagged)" : "Standard"}
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0; color:#94a3b8;">Submitted At:</td>
                <td style="padding:10px 0; color:#cbd5e1; font-size:13px;">${getPeshawarDateTimeString(newBooking.createdAt)} (PKT)</td>
              </tr>
            </tbody>
          </table>

          <!-- Problem Note -->
          <div style="background-color:#1e293b; border-radius:10px; padding:14px 16px; margin-bottom:24px; border:1px solid #334155;">
            <div style="font-size:11px; font-weight:bold; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">
              Reported Computer Issue
            </div>
            <div style="font-size:13px; color:#e2e8f0; line-height:1.5; white-space:pre-wrap;">${newBooking.problemDescription}</div>
          </div>

          <!-- What Happens Next Callout -->
          <div style="background-color:rgba(14, 165, 233, 0.08); border:1px solid rgba(14, 165, 233, 0.3); border-radius:10px; padding:14px 16px; margin-bottom:24px; font-size:13px; line-height:1.6; color:#bae6fd;">
            <strong>What happens next?</strong> Submitting this request allows our technician to prep tools & replacement parts. We will call or WhatsApp you at <strong>${newBooking.phone}</strong> to confirm the exact address and arrival slot before dispatching.
          </div>

          <!-- Direct WhatsApp Contact Button -->
          <div style="text-align:center; padding-top:6px;">
            <a href="https://wa.me/923275226107?text=${encodeURIComponent(`Hello Safiullah! I received my booking confirmation (${newBooking.id}) for ${newBooking.serviceRequired}.`)}" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; padding:12px 24px; font-weight:700; border-radius:10px; font-size:14px; box-shadow:0 4px 14px rgba(5, 150, 105, 0.4);">
              \u{1F4AC} Chat with Technician on WhatsApp (0327 5226107)
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color:#090d16; padding:18px 24px; text-align:center; border-top:1px solid #1e293b; font-size:12px; color:#64748b;">
          TechFix On-Site Computer Repair & IT Support \u2022 Peshawar, KP \u2022 Helpline: +92 327 5226107
        </div>

      </div>
    </body>
    </html>
    `;
    const customerConfirmationText = `
TechFix Peshawar \u2022 Booking Confirmation
Tracking ID: ${newBooking.id}

Hello ${newBooking.fullName},
We have received your service request for: ${newBooking.serviceRequired}.

Details:
- Device: ${newBooking.deviceType} ${newBooking.computerBrandModel || ""}
- Area: ${newBooking.area} (Peshawar)
- Preferred Slot: ${newBooking.preferredDate} (${newBooking.preferredTime})
- Data Safety: ${newBooking.containsImportantData}
- Submitted: ${getPeshawarDateTimeString(newBooking.createdAt)} (PKT)

Our technician (Safiullah) will contact you at ${newBooking.phone} shortly to confirm the appointment.
Helpline / WhatsApp: +92 327 5226107
    `.trim();
    dispatchEmail({
      to: newBooking.email,
      subject: `TechFix Peshawar \u2022 Service Request Received (${newBooking.id})`,
      html: customerConfirmationHtml,
      text: customerConfirmationText
    }).then((result) => {
      console.log(`[CUSTOMER RECEIPT EMAIL] Dispatched to ${newBooking.email}: delivered=${result.delivered}`);
    }).catch((err) => {
      console.error("[CUSTOMER RECEIPT EMAIL] Dispatch error:", err);
    });
  }
  db.activityLogs.unshift({
    id: `log-email-${Date.now()}`,
    action: "Email Notification Sent",
    details: `Immediate notification dispatched to ${NOTIFICATION_DESTINATION} for request ${newBooking.id} (${newBooking.fullName})${newBooking.email ? ` & confirmation sent to customer (${newBooking.email})` : ""}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "System Notification Trigger"
  });
  saveDb();
  res.status(201).json({
    success: true,
    booking: newBooking,
    message: "Your request has been received. We will contact you to discuss the problem and confirm an appointment."
  });
});
app.post("/api/notify-email", async (req, res) => {
  const { recipient, subject, bodyText, payload } = req.body;
  const targetEmail = recipient || NOTIFICATION_DESTINATION;
  const result = await dispatchEmail({
    to: targetEmail,
    subject: subject || `New PC Service Alert: ${payload?.customer_name || "Customer"}`,
    text: bodyText || JSON.stringify(payload, null, 2)
  });
  db.activityLogs.unshift({
    id: `log-email-${Date.now()}`,
    action: "Email Notification Dispatched",
    details: `Alert dispatched to ${targetEmail} for ${payload?.customer_name || "Customer"} (${payload?.service_required || "PC Repair"})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Notification Trigger"
  });
  if (db.activityLogs.length > 100) db.activityLogs.pop();
  saveDb();
  if (!result.delivered) {
    return res.status(502).json({
      success: false,
      delivered: false,
      recipient: targetEmail,
      error: result.error || "Email notification delivery failed",
      message: `Failed to dispatch notification to ${targetEmail}: ${result.error || "Check email settings"}`
    });
  }
  res.json({
    success: true,
    recipient: targetEmail,
    delivered: true,
    message: `Immediate notification logged and dispatched to ${targetEmail}`
  });
});
async function handleInquirySubmission(req, res) {
  const { fullName, phone, email, whatsapp, subject, service, budget, message, area } = req.body;
  if (!fullName || !phone || !message) {
    return res.status(400).json({ error: "Please provide your Full Name, Phone Number, and Message/Query." });
  }
  const cleanPhone = String(phone).trim();
  const cleanFullName = String(fullName).trim();
  const cleanEmail = email ? String(email).trim() : "";
  const cleanWhatsapp = whatsapp ? String(whatsapp).trim() : cleanPhone;
  const cleanArea = area ? String(area).trim() : "Peshawar";
  const cleanSubject = String(subject || service || "General Computer Service Inquiry").trim();
  const cleanService = String(service || subject || "Computer Diagnostics & Repair").trim();
  const cleanBudget = budget ? String(budget).trim() : "";
  const cleanMessage = String(message).trim();
  const newInquiry = {
    id: `INQ-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    fullName: cleanFullName,
    phone: cleanPhone,
    email: cleanEmail,
    whatsapp: cleanWhatsapp,
    area: cleanArea,
    subject: cleanSubject,
    service: cleanService,
    budget: cleanBudget,
    message: cleanMessage,
    status: "NEW",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    emailNotificationStatus: "credentials_pending",
    emailNotificationSentTo: NOTIFICATION_DESTINATION,
    emailNotificationSentAt: (/* @__PURE__ */ new Date()).toISOString(),
    emailNotificationProvider: "logged"
  };
  const html = generateBrandedEmailHtml({
    clientName: newInquiry.fullName,
    email: newInquiry.email,
    phone: newInquiry.phone,
    whatsapp: newInquiry.whatsapp,
    subject: newInquiry.subject,
    service: newInquiry.service,
    budget: newInquiry.budget,
    message: newInquiry.message,
    area: newInquiry.area
  });
  const text = generateBrandedEmailText({
    clientName: newInquiry.fullName,
    email: newInquiry.email,
    phone: newInquiry.phone,
    subject: newInquiry.subject,
    service: newInquiry.service,
    budget: newInquiry.budget,
    message: newInquiry.message,
    area: newInquiry.area
  });
  const emailResult = await sendNotificationEmail({
    to: NOTIFICATION_DESTINATION,
    subject: `[LEAD INQUIRY] ${newInquiry.fullName} - ${newInquiry.subject} (${newInquiry.area}) - ${getPeshawarShortTimeString()}`,
    html,
    text,
    lead: newInquiry
  });
  newInquiry.emailNotificationStatus = emailResult.status;
  newInquiry.emailNotificationSentTo = emailResult.sentTo;
  newInquiry.emailNotificationSentAt = emailResult.sentAt;
  newInquiry.emailNotificationProvider = emailResult.provider;
  if (emailResult.error) {
    newInquiry.emailNotificationError = emailResult.error;
  }
  if (!Array.isArray(db.inquiries)) {
    db.inquiries = [];
  }
  db.inquiries.unshift(newInquiry);
  try {
    const adminDb = getAdminFirestore();
    adminDb.collection("inquiries").doc(newInquiry.id).set(newInquiry).then(() => {
      console.log(`[FIRESTORE] \u2705 Inquiry ${newInquiry.id} saved to Firestore`);
    }).catch((err) => {
      console.error("[FIRESTORE] \u274C Inquiry save failed:", err);
    });
  } catch (_) {
  }
  const existingCustomer = db.customers.find((c) => c.phone === newInquiry.phone);
  if (!existingCustomer) {
    db.customers.unshift({
      id: `CUST-${Date.now()}`,
      name: newInquiry.fullName,
      phone: newInquiry.phone,
      whatsapp: newInquiry.whatsapp,
      area: newInquiry.area,
      totalBookings: 0,
      totalSpent: "Rs. 0",
      lastServiceDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      notes: `Lead Inquiry: ${newInquiry.subject}`,
      devices: []
    });
  }
  db.activityLogs.unshift({
    id: `log-inq-${Date.now()}`,
    action: "Lead Inquiry Received",
    details: `${newInquiry.fullName} submitted inquiry ("${newInquiry.subject}"). Email: ${emailResult.status.toUpperCase()} via ${emailResult.provider.toUpperCase()} to ${emailResult.sentTo}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Client (Online)"
  });
  if (db.activityLogs.length > 100) db.activityLogs.pop();
  saveDb();
  return res.status(201).json({
    success: true,
    inquiry: newInquiry,
    delivery: emailResult,
    message: emailResult.status === "sent" ? `Thank you! Your inquiry has been received and emailed to the site administrator at ${emailResult.sentTo}.` : `Thank you! Your inquiry has been recorded and received. We will contact you shortly.`
  });
}
app.post("/api/inquiries", publicApiRateLimiter, handleInquirySubmission);
app.post("/api/contact", publicApiRateLimiter, handleInquirySubmission);
app.get("/api/inquiries", (req, res) => {
  res.json({ inquiries: db.inquiries || [] });
});
app.get("/api/contact", (req, res) => {
  res.json({ inquiries: db.inquiries || [] });
});
async function handleResendInquiryEmail(req, res) {
  const { id } = req.params;
  const inquiry = (db.inquiries || []).find((inq) => inq.id === id);
  if (!inquiry) {
    return res.status(404).json({ error: "Inquiry not found" });
  }
  const html = generateBrandedEmailHtml({
    clientName: inquiry.fullName,
    email: inquiry.email,
    phone: inquiry.phone,
    whatsapp: inquiry.whatsapp,
    subject: inquiry.subject,
    service: inquiry.service,
    budget: inquiry.budget,
    message: inquiry.message,
    area: inquiry.area
  });
  const text = generateBrandedEmailText({
    clientName: inquiry.fullName,
    email: inquiry.email,
    phone: inquiry.phone,
    subject: inquiry.subject,
    service: inquiry.service,
    budget: inquiry.budget,
    message: inquiry.message,
    area: inquiry.area
  });
  const emailResult = await sendNotificationEmail({
    to: NOTIFICATION_DESTINATION,
    subject: `[RESENT INQUIRY] ${inquiry.fullName} - ${inquiry.subject} (${inquiry.area}) - ${getPeshawarShortTimeString()}`,
    html,
    text,
    lead: inquiry
  });
  inquiry.emailNotificationStatus = emailResult.status;
  inquiry.emailNotificationSentTo = emailResult.sentTo;
  inquiry.emailNotificationSentAt = emailResult.sentAt;
  inquiry.emailNotificationProvider = emailResult.provider;
  inquiry.emailNotificationError = emailResult.error || void 0;
  db.activityLogs.unshift({
    id: `log-resend-${Date.now()}`,
    action: "Inquiry Email Resent",
    details: `Manual email resend for inquiry ${inquiry.id} (${inquiry.fullName}). Result: ${emailResult.status.toUpperCase()} via ${emailResult.provider.toUpperCase()} to ${emailResult.sentTo}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  if (db.activityLogs.length > 100) db.activityLogs.pop();
  saveDb();
  return res.json({
    success: true,
    inquiry,
    delivery: emailResult,
    message: emailResult.status === "sent" ? `Email notification re-sent successfully to ${emailResult.sentTo} via ${emailResult.provider.toUpperCase()}!` : `Email dispatch attempted with status: ${emailResult.status} (${emailResult.provider}).`
  });
}
app.post("/api/inquiries/:id/resend-email", handleResendInquiryEmail);
app.post("/api/contact/:id/resend-email", handleResendInquiryEmail);
app.patch("/api/inquiries/:id", (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const inquiry = (db.inquiries || []).find((inq) => inq.id === id);
  if (!inquiry) {
    return res.status(404).json({ error: "Inquiry not found" });
  }
  if (status) inquiry.status = status;
  if (notes !== void 0) inquiry.adminNotes = notes;
  inquiry.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  res.json({ success: true, inquiry });
});
var handleDeleteInquiry = (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  const index = (db.inquiries || []).findIndex(
    (inq) => inq.id === rawId || inq.id === decodedId || inq.id && inq.id.trim().toLowerCase() === targetIdLower
  );
  let removedItem = null;
  if (index !== -1) {
    removedItem = db.inquiries.splice(index, 1)[0];
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Lead Inquiry Deleted",
      details: `Removed lead #${removedItem.id || decodedId} (${removedItem.fullName || "Lead"})`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
  }
  db.inquiries = (db.inquiries || []).filter(
    (inq) => inq.id !== rawId && inq.id !== decodedId && (!inq.id || inq.id.trim().toLowerCase() !== targetIdLower)
  );
  saveDb();
  res.json({
    success: true,
    removedId: removedItem?.id || decodedId,
    message: "Lead inquiry deleted successfully"
  });
};
app.delete("/api/inquiries/:id", handleDeleteInquiry);
app.delete("/api/admin/inquiries/:id", checkAdminAuth, handleDeleteInquiry);
app.post("/api/admin/test-email", checkAdminAuth, async (req, res) => {
  const targetEmail = req.body?.email && req.body.email.trim() || getNotificationDestination();
  const customApiKey = req.body?.resendApiKey && req.body.resendApiKey.trim() || void 0;
  const customFromEmail = req.body?.resendFromEmail && req.body.resendFromEmail.trim() || void 0;
  const preferredProvider = req.body?.provider || db?.settings?.emailProvider || "auto";
  const gmailUser = req.body?.gmailUser || db?.settings?.gmailUser;
  const gmailAppPassword = req.body?.gmailAppPassword || db?.settings?.gmailAppPassword;
  const effectiveFrom = customFromEmail || getResendFromEmail();
  const effectiveApiKey = customApiKey || getResendApiKey();
  const pktShortTime = getPeshawarShortTimeString();
  const pktDateTime = getPeshawarDateTimeString();
  const testHtml = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0; padding:20px; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#f8fafc;">
    <div style="max-width:550px; margin:0 auto; background-color:#0f172a; border-radius:12px; overflow:hidden; border:1px solid #1e293b; padding:28px; text-align:center;">
      <div style="display:inline-block; background-color:rgba(56, 189, 248, 0.1); color:#38bdf8; font-size:12px; font-weight:bold; padding:4px 12px; border-radius:9999px; margin-bottom:12px; border:1px solid rgba(56, 189, 248, 0.3);">
        \u2713 LIVE TEST DISPATCH
      </div>
      <h2 style="color:#ffffff; margin:0 0 10px 0; font-size:22px;">TechFix Email Delivery Active</h2>
      <p style="color:#94a3b8; font-size:14px; line-height:1.6; margin-bottom:20px;">
        This test confirms that customer inquiries, receipts, and booking notifications will be delivered directly from <strong>${effectiveFrom}</strong> to <strong>${targetEmail}</strong>.
      </p>
      <div style="background-color:#1e293b; border-radius:8px; padding:14px; font-size:13px; color:#cbd5e1; text-align:left; line-height:1.7; margin-bottom:20px;">
        <div><strong>Sender ("From"):</strong> <span style="color:#38bdf8;">${effectiveFrom}</span></div>
        <div><strong>Recipient ("To"):</strong> <span style="color:#4ade80;">${targetEmail}</span></div>
        <div><strong>Active Mode:</strong> <span style="color:#f59e0b; font-weight:bold;">${preferredProvider.toUpperCase()}</span></div>
        <div><strong>Resend Key:</strong> ${effectiveApiKey ? `${effectiveApiKey.substring(0, 8)}...` : '<span style="color:#f87171;">Not configured</span>'}</div>
        <div><strong>Peshawar Time:</strong> <span style="color:#38bdf8; font-weight:bold;">${pktShortTime}</span> (${pktDateTime} PKT)</div>
        <div><strong>Engine:</strong> Multi-Provider Waterfall (Resend REST + Native Google SMTP)</div>
      </div>
      ${generateEmailFooterHtml(targetEmail)}
    </div>
  </body>
  </html>
  `;
  const result = await sendNotificationEmail({
    to: targetEmail,
    from: effectiveFrom,
    apiKey: effectiveApiKey,
    preferredProvider,
    gmailUser,
    gmailAppPassword,
    subject: `TechFix Notification Test: Confirmed Active (${pktShortTime})`,
    html: testHtml,
    text: `TechFix Notification Test: Confirmed active delivery from ${effectiveFrom} to ${targetEmail} at ${pktDateTime} (PKT)`,
    lead: { fullName: "System Test", phone: "0300 0000000", message: "Live email delivery test." }
  });
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: result.status === "sent" ? "Email Test Delivered" : "Email Test Logged",
    details: result.status === "sent" ? `Live verification email sent from "${effectiveFrom}" to ${targetEmail} via ${result.provider.toUpperCase()} (ID: ${result.messageId || "ok"})` : `Test notification status: ${result.status} (${result.provider}). Sender: ${effectiveFrom}. Error: ${result.error || "none"}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  if (db.activityLogs.length > 100) db.activityLogs.pop();
  saveDb();
  if (result.status !== "sent") {
    return res.status(502).json({
      success: false,
      delivered: false,
      recipient: targetEmail,
      sender: result.provider === "smtp" ? gmailUser || "techfixpeshawar@gmail.com" : effectiveFrom,
      status: "failed",
      provider: result.provider,
      error: result.error || "Email delivery failed across all configured providers",
      failoverNote: result.failoverNote
    });
  }
  return res.json({
    success: true,
    delivered: true,
    recipient: targetEmail,
    sender: result.provider === "smtp" ? gmailUser || "techfixpeshawar@gmail.com" : effectiveFrom,
    status: "sent",
    provider: result.provider,
    messageId: result.messageId,
    failoverNote: result.failoverNote,
    message: `Live test email successfully delivered via ${result.provider.toUpperCase()} (ID: ${result.messageId || "ok"})!`
  });
});
app.get("/api/admin/email-status", checkAdminAuth, (req, res) => {
  const activeKey = getResendApiKey();
  const isResend = !!activeKey;
  const isGmail = !!((db?.settings?.gmailUser || process.env.GMAIL_USER || process.env.SMTP_USER) && (db?.settings?.gmailAppPassword || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS));
  const isSmtp = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const isConfigured = isResend || isGmail || isSmtp;
  res.json({
    configured: isConfigured,
    provider: db?.settings?.emailProvider || (isResend ? "Resend API" : isGmail ? "Gmail App Password (Nodemailer SMTP)" : "Not configured"),
    destinationEmail: getNotificationDestination(),
    fromEmail: getResendFromEmail(),
    emailProvider: db?.settings?.emailProvider || "auto",
    gmailUser: db?.settings?.gmailUser || process.env.GMAIL_USER || "",
    hasGmailAppPassword: !!(db?.settings?.gmailAppPassword || process.env.GMAIL_APP_PASSWORD),
    configuredVars: {
      hasResendKey: isResend,
      hasGmailUser: isGmail,
      hasGmailAppPassword: !!(db?.settings?.gmailAppPassword || process.env.GMAIL_APP_PASSWORD),
      hasSmtpUser: !!process.env.SMTP_USER,
      hasSmtpPass: !!process.env.SMTP_PASS
    }
  });
});
app.get("/api/bookings/:id", (req, res) => {
  const param = (req.params.id || "").toLowerCase().trim();
  const cleanPhone = param.replace(/[^0-9]/g, "");
  const booking = db.bookings.find((b) => {
    if (b.id.toLowerCase() === param) return true;
    if (cleanPhone.length >= 7) {
      const bPhone = (b.phone || "").replace(/[^0-9]/g, "");
      const bWa = (b.whatsapp || "").replace(/[^0-9]/g, "");
      if (bPhone && (bPhone === cleanPhone || bPhone.endsWith(cleanPhone) || cleanPhone.endsWith(bPhone))) return true;
      if (bWa && (bWa === cleanPhone || bWa.endsWith(cleanPhone) || cleanPhone.endsWith(bWa))) return true;
    }
    return false;
  });
  if (booking) return res.json({ booking });
  const lead = (db.problemLeads || []).find((l) => {
    if (l.id && l.id.toLowerCase() === param) return true;
    if (cleanPhone.length >= 7) {
      const lPhone = (l.phone || "").replace(/[^0-9]/g, "");
      const lWa = (l.whatsapp || "").replace(/[^0-9]/g, "");
      if (lPhone && (lPhone === cleanPhone || lPhone.endsWith(cleanPhone) || cleanPhone.endsWith(lPhone))) return true;
      if (lWa && (lWa === cleanPhone || lWa.endsWith(cleanPhone) || cleanPhone.endsWith(lWa))) return true;
    }
    return false;
  });
  if (lead) {
    return res.json({
      booking: {
        id: lead.id,
        fullName: lead.fullName,
        phone: lead.phone,
        whatsapp: lead.whatsapp || lead.phone,
        area: lead.area || "Peshawar",
        deviceType: lead.deviceType || "Laptop / Desktop",
        computerBrandModel: lead.deviceType || "",
        serviceRequired: lead.problemTitle || "Problem Diagnosis & Research",
        problemDescription: lead.problemDescription || "",
        preferredDate: "As soon as possible",
        preferredTime: "Standard Hours",
        urgency: lead.urgency === "urgent" ? "Urgent" : "Normal",
        containsImportantData: "NO",
        status: (lead.status || "NEW").toUpperCase(),
        createdAt: lead.createdAt,
        technicianNotes: lead.technicianNotes || ""
      }
    });
  }
  const inq = (db.inquiries || []).find((i) => {
    if (i.id && i.id.toLowerCase() === param) return true;
    if (cleanPhone.length >= 7) {
      const iPhone = (i.phone || "").replace(/[^0-9]/g, "");
      if (iPhone && (iPhone === cleanPhone || iPhone.endsWith(cleanPhone) || cleanPhone.endsWith(iPhone))) return true;
    }
    return false;
  });
  if (inq) {
    return res.json({
      booking: {
        id: inq.id,
        fullName: inq.fullName || inq.name || "Customer",
        phone: inq.phone,
        whatsapp: inq.whatsapp || inq.phone,
        area: inq.area || "Peshawar",
        deviceType: "Computer System",
        serviceRequired: inq.service || inq.subject || "General Technical Inquiry",
        problemDescription: inq.message || inq.notes || "",
        preferredDate: "Pending Discussion",
        preferredTime: "Pending Discussion",
        urgency: "Normal",
        containsImportantData: "NO",
        status: (inq.status || "NEW").toUpperCase(),
        createdAt: inq.createdAt
      }
    });
  }
  return res.status(404).json({ error: "Booking or request not found." });
});
var ADMIN_SECRET = (process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "").trim();
var customAdminPassword = null;
var AUTHORIZED_ADMIN_EMAILS = /* @__PURE__ */ new Set([
  "techfixpeshawar@gmail.com",
  "sullahjan40@gmail.com",
  "admin@peshawar-techsupport.pk"
]);
app.post("/api/admin/login", authRateLimiter, async (req, res) => {
  const { password, idToken, email } = req.body;
  if (idToken && typeof idToken === "string") {
    const emailFromToken = await verifyFirebaseIdTokenFallback(idToken);
    if (emailFromToken && AUTHORIZED_ADMIN_EMAILS.has(emailFromToken.toLowerCase())) {
      const sessionToken = generateAdminSessionToken(emailFromToken);
      return res.json({ success: true, token: sessionToken });
    }
    try {
      const adminAuth = getFirebaseAdminAuthInstance();
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const emailLower = (decoded?.email || "").toLowerCase();
        if (decoded && (AUTHORIZED_ADMIN_EMAILS.has(emailLower) || decoded.admin === true || decoded.role === "admin")) {
          const sessionToken = generateAdminSessionToken(decoded.email || "admin");
          return res.json({ success: true, token: sessionToken });
        }
      }
    } catch (tokenErr) {
      console.warn("[AUTH] Firebase Admin token verify note:", tokenErr?.message);
    }
    return res.status(401).json({ error: "Invalid or expired Firebase session. Please sign in again." });
  }
  const p = (password || "").toString().trim();
  const currentSavedPassword = db?.settings?.adminPassword;
  const isValidPassword = customAdminPassword && p === customAdminPassword || currentSavedPassword && p === currentSavedPassword || ADMIN_SECRET && p === ADMIN_SECRET;
  if (p && isValidPassword) {
    const sessionToken = generateAdminSessionToken(email || "admin");
    return res.json({ success: true, token: sessionToken });
  }
  return res.status(401).json({ error: "Invalid admin credentials." });
});
app.post("/api/admin/change-password", checkAdminAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }
  customAdminPassword = newPassword.trim();
  if (db?.settings) {
    db.settings.adminPassword = customAdminPassword;
    saveDb();
    await saveSettingsToFirestore(db.settings);
  }
  return res.json({ success: true, message: "Admin password updated and synced successfully." });
});
async function checkAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  const customHeader = (req.headers["x-admin-token"] || "").trim();
  const validToken = token || customHeader;
  if (!validToken) {
    return res.status(401).json({ error: "Unauthorized. Valid admin session token required." });
  }
  if (validToken.startsWith("techfix_sess_") && verifyAdminSessionToken(validToken)) {
    return next();
  }
  if (validToken.split(".").length === 3) {
    const emailFromToken = await verifyFirebaseIdTokenFallback(validToken);
    if (emailFromToken && AUTHORIZED_ADMIN_EMAILS.has(emailFromToken.toLowerCase())) {
      return next();
    }
    try {
      const adminAuth = getFirebaseAdminAuthInstance();
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(validToken);
        const emailLower = (decoded?.email || "").toLowerCase();
        if (decoded && (AUTHORIZED_ADMIN_EMAILS.has(emailLower) || decoded.admin === true || decoded.role === "admin")) {
          return next();
        }
      }
    } catch {
    }
  }
  return res.status(401).json({ error: "Unauthorized. Valid admin session token required." });
}
app.get("/api/admin/data", checkAdminAuth, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const [firestoreSettings, safeEmail, bookingsSnap, inquiriesSnap] = await Promise.all([
      loadSettingsFromFirestore().catch(() => null),
      getSafeEmailSettings().catch(() => null),
      adminDb.collection("bookings").get().catch(() => null),
      adminDb.collection("inquiries").get().catch(() => null)
    ]);
    if (firestoreSettings && typeof firestoreSettings === "object") {
      db.settings = { ...db.settings, ...firestoreSettings };
    }
    if (bookingsSnap && !bookingsSnap.empty) {
      const fsBookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const idMap = /* @__PURE__ */ new Map();
      (db.bookings || []).forEach((b) => idMap.set(b.id, b));
      fsBookings.forEach((b) => idMap.set(b.id, b));
      db.bookings = Array.from(idMap.values());
    }
    if (inquiriesSnap && !inquiriesSnap.empty) {
      const fsInquiries = inquiriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const idMap = /* @__PURE__ */ new Map();
      (db.inquiries || []).forEach((i) => idMap.set(i.id, i));
      fsInquiries.forEach((i) => idMap.set(i.id, i));
      db.inquiries = Array.from(idMap.values());
    }
    const sanitizedSettings = {
      ...db.settings,
      ...safeEmail || {}
    };
    delete sanitizedSettings.resendApiKey;
    delete sanitizedSettings.gmailAppPassword;
    delete sanitizedSettings.smtpPassword;
    delete sanitizedSettings.adminPassword;
    delete sanitizedSettings.apiSecret;
    return res.json({
      settings: sanitizedSettings,
      services: db.services,
      serviceAreas: db.serviceAreas,
      faqs: db.faqs,
      caseStudies: db.caseStudies,
      bookings: db.bookings,
      inquiries: db.inquiries || [],
      websiteContent: db.websiteContent,
      categories: db.categories,
      media: db.media,
      customers: db.customers,
      activityLogs: db.activityLogs,
      pageSections: db.pageSections,
      problemSolutions: db.problemSolutions || [],
      problemLeads: db.problemLeads || []
    });
  } catch (err) {
    console.error("[FIRESTORE] Admin data GET error:", err);
    return res.status(500).json({ error: "Failed to load admin dashboard data" });
  }
});
app.put("/api/admin/page-sections/:sectionKey", checkAdminAuth, (req, res) => {
  const { sectionKey } = req.params;
  const updates = req.body;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  const currentSection = db.pageSections[sectionKey] || {};
  db.pageSections[sectionKey] = {
    ...currentSection,
    ...updates
  };
  if (updates.pageStatus && db.pageSections.pageStatuses) {
    db.pageSections.pageStatuses[sectionKey] = updates.pageStatus;
  }
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Page Section Updated",
    details: `Updated content metadata for section: ${sectionKey}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.json({ success: true, section: db.pageSections[sectionKey], pageSections: db.pageSections });
});
app.put("/api/admin/page-status/:sectionKey", checkAdminAuth, (req, res) => {
  const { sectionKey } = req.params;
  const { status } = req.body;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  if (!db.pageSections.pageStatuses) {
    db.pageSections.pageStatuses = { ...defaultData.pageSections?.pageStatuses || {} };
  }
  const newStatus = status === "unpublished" ? "unpublished" : "published";
  db.pageSections.pageStatuses[sectionKey] = newStatus;
  if (db.pageSections[sectionKey]) {
    db.pageSections[sectionKey].pageStatus = newStatus;
  }
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: newStatus === "published" ? "Page Published" : "Page Unpublished",
    details: `Page [${sectionKey}] is now ${newStatus.toUpperCase()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.json({ success: true, sectionKey, status: newStatus, pageStatuses: db.pageSections.pageStatuses });
});
app.post("/api/admin/page-sections/:sectionKey/:collectionKey", checkAdminAuth, (req, res) => {
  const { sectionKey, collectionKey } = req.params;
  const itemData = req.body;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  const section = db.pageSections[sectionKey];
  if (!section) {
    return res.status(404).json({ error: `Section ${sectionKey} not found` });
  }
  if (!Array.isArray(section[collectionKey])) {
    section[collectionKey] = [];
  }
  const newItem = {
    id: `${sectionKey}-${Date.now().toString(36)}`,
    ...itemData,
    status: itemData.status === "unpublished" ? "unpublished" : "published"
  };
  section[collectionKey].push(newItem);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Content Item Created",
    details: `Added new item to ${sectionKey} > ${collectionKey}: "${newItem.title || newItem.name || newItem.id}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.status(201).json({ success: true, item: newItem, collection: section[collectionKey] });
});
app.put("/api/admin/page-sections/:sectionKey/:collectionKey/:itemId", checkAdminAuth, (req, res) => {
  const { sectionKey, collectionKey, itemId } = req.params;
  const updates = req.body;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  const section = db.pageSections[sectionKey];
  if (!section || !Array.isArray(section[collectionKey])) {
    return res.status(404).json({ error: `Collection ${collectionKey} in section ${sectionKey} not found` });
  }
  const index = section[collectionKey].findIndex((i) => i.id === itemId);
  if (index === -1) {
    return res.status(404).json({ error: `Item ${itemId} not found` });
  }
  section[collectionKey][index] = {
    ...section[collectionKey][index],
    ...updates,
    id: itemId
    // preserve ID
  };
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Content Item Updated",
    details: `Updated item in ${sectionKey} > ${collectionKey}: "${section[collectionKey][index].title || itemId}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.json({ success: true, item: section[collectionKey][index], collection: section[collectionKey] });
});
app.delete("/api/admin/page-sections/:sectionKey/:collectionKey/:itemId", checkAdminAuth, (req, res) => {
  const { sectionKey, collectionKey, itemId } = req.params;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  const section = db.pageSections[sectionKey];
  if (!section || !Array.isArray(section[collectionKey])) {
    return res.status(404).json({ error: `Collection ${collectionKey} in section ${sectionKey} not found` });
  }
  const index = section[collectionKey].findIndex((i) => i.id === itemId);
  if (index === -1) {
    return res.status(404).json({ error: `Item ${itemId} not found` });
  }
  const removed = section[collectionKey].splice(index, 1)[0];
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Content Item Deleted",
    details: `Deleted item from ${sectionKey} > ${collectionKey}: "${removed.title || itemId}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.json({ success: true, removedId: itemId, collection: section[collectionKey] });
});
app.put("/api/admin/page-sections/:sectionKey/:collectionKey/:itemId/toggle", checkAdminAuth, (req, res) => {
  const { sectionKey, collectionKey, itemId } = req.params;
  if (!db.pageSections) {
    db.pageSections = { ...defaultData.pageSections };
  }
  const section = db.pageSections[sectionKey];
  if (!section || !Array.isArray(section[collectionKey])) {
    return res.status(404).json({ error: `Collection ${collectionKey} in section ${sectionKey} not found` });
  }
  const index = section[collectionKey].findIndex((i) => i.id === itemId);
  if (index === -1) {
    return res.status(404).json({ error: `Item ${itemId} not found` });
  }
  const currentStatus = section[collectionKey][index].status;
  const newStatus = currentStatus === "published" || currentStatus === "active" ? "unpublished" : "published";
  section[collectionKey][index].status = newStatus;
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: newStatus === "published" ? "Content Item Published" : "Content Item Unpublished",
    details: `Item "${section[collectionKey][index].title || itemId}" in ${sectionKey} is now ${newStatus.toUpperCase()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.json({ success: true, item: section[collectionKey][index], newStatus });
});
app.post("/api/admin/services", checkAdminAuth, (req, res) => {
  const { title, shortDesc, fullDesc, priceStarting, priceNote, turnaround, icon, customIcon, status, workflow, warningNote, diagnosticSteps } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Service title is required" });
  }
  const newService = {
    id: `srv-${Date.now().toString(36)}`,
    key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title: String(title).trim(),
    shortDesc: String(shortDesc || "").trim(),
    fullDesc: String(fullDesc || "").trim(),
    priceStarting: String(priceStarting || "From Rs. 1,000").trim(),
    priceNote: String(priceNote || "").trim(),
    turnaround: String(turnaround || "45 \u2013 60 mins").trim(),
    icon: icon || "Wrench",
    customIcon: customIcon || void 0,
    status: status === "inactive" ? "inactive" : "active",
    order: db.services.length + 1,
    workflow: Array.isArray(workflow) ? workflow : [],
    warningNote: warningNote || void 0,
    diagnosticSteps: Array.isArray(diagnosticSteps) ? diagnosticSteps : void 0
  };
  db.services.push(newService);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Service Created",
    details: `Created new service: "${newService.title}" with price ${newService.priceStarting}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("services", newService.id, newService);
  res.status(201).json({ success: true, service: newService });
});
app.put("/api/admin/services/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.services.findIndex((s) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Service not found" });
  }
  db.services[index] = { ...db.services[index], ...req.body, id };
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Service Updated",
    details: `Updated service details: "${db.services[index].title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("services", id, db.services[index]);
  res.json({ success: true, service: db.services[index] });
});
app.delete("/api/admin/services/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const item = db.services.find((s) => s.id === id || s.key === id);
  if (!item) {
    return res.json({ success: true, message: "Item was already deleted" });
  }
  db.services = db.services.filter((s) => s.id !== id && s.key !== id);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Service Deleted",
    details: `Deleted service: "${item.title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  deleteDocFromFirestore("services", id);
  res.json({ success: true, deletedId: id });
});
var handleToggleService = (req, res) => {
  const { id } = req.params;
  const index = db.services.findIndex((s) => s.id === id || s.key === id);
  if (index === -1) return res.status(404).json({ error: "Service not found" });
  const currentStatus = db.services[index].status;
  const newStatus = currentStatus === "active" || currentStatus === "published" ? "inactive" : "active";
  db.services[index].status = newStatus;
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Service Status Toggled",
    details: `${db.services[index].title} is now ${newStatus.toUpperCase()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("services", id, db.services[index]);
  res.json({ success: true, service: db.services[index] });
};
app.put("/api/admin/services/:id/toggle", checkAdminAuth, handleToggleService);
app.patch("/api/admin/services/:id/toggle", checkAdminAuth, handleToggleService);
app.post("/api/admin/services/:id/publish", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.services.findIndex((s) => s.id === id || s.key === id);
  if (index === -1) return res.status(404).json({ error: "Service not found" });
  db.services[index].status = "active";
  saveDb();
  syncDocToFirestore("services", id, db.services[index]);
  res.json({ success: true, service: db.services[index] });
});
app.post("/api/admin/services/:id/unpublish", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.services.findIndex((s) => s.id === id || s.key === id);
  if (index === -1) return res.status(404).json({ error: "Service not found" });
  db.services[index].status = "inactive";
  saveDb();
  syncDocToFirestore("services", id, db.services[index]);
  res.json({ success: true, service: db.services[index] });
});
app.post("/api/admin/services/reorder", checkAdminAuth, (req, res) => {
  const { serviceIds } = req.body;
  if (!Array.isArray(serviceIds)) {
    return res.status(400).json({ error: "serviceIds array required" });
  }
  const reordered = [];
  serviceIds.forEach((id, idx) => {
    const item = db.services.find((s) => s.id === id);
    if (item) {
      item.order = idx + 1;
      reordered.push(item);
    }
  });
  db.services.forEach((s) => {
    if (!reordered.some((r) => r.id === s.id)) {
      s.order = reordered.length + 1;
      reordered.push(s);
    }
  });
  db.services = reordered;
  saveDb();
  reordered.forEach((s) => syncDocToFirestore("services", s.id, s));
  res.json({ success: true, services: db.services });
});
app.put("/api/admin/services", checkAdminAuth, (req, res) => {
  const { services } = req.body;
  if (Array.isArray(services)) {
    db.services = services;
    saveDb();
    services.forEach((s) => {
      if (s?.id) syncDocToFirestore("services", s.id, s);
    });
    return res.json({ success: true, services: db.services });
  }
  res.status(400).json({ error: "Invalid services format" });
});
app.get("/api/problem-solutions", async (req, res) => {
  await firestoreReady;
  const published = (db.problemSolutions || []).filter((p) => p.status !== "unpublished");
  res.json({ success: true, problemSolutions: published });
});
app.get("/api/admin/problem-solutions", checkAdminAuth, async (req, res) => {
  await firestoreReady;
  res.json({ success: true, problemSolutions: db.problemSolutions || [] });
});
app.post("/api/admin/problem-solutions", checkAdminAuth, async (req, res) => {
  const data = req.body;
  if (!data.title) return res.status(400).json({ error: "Title is required" });
  if (!Array.isArray(db.problemSolutions)) db.problemSolutions = [];
  const newItem = {
    id: `prob-${Date.now().toString(36)}`,
    key: data.key || data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    badge: data.badge || "TECHNICAL SOLUTION",
    title: String(data.title).trim(),
    subtitle: data.subtitle || "",
    shortDesc: data.shortDesc || "",
    symptomsWhenNeeded: Array.isArray(data.symptomsWhenNeeded) ? data.symptomsWhenNeeded : [],
    honestAssessment: data.honestAssessment || "",
    turnaroundCriteria: data.turnaroundCriteria || "",
    turnaroundFactors: Array.isArray(data.turnaroundFactors) ? data.turnaroundFactors : [],
    protocolBadge: data.protocolBadge || "",
    protocolTitle: data.protocolTitle || "",
    steps: Array.isArray(data.steps) ? data.steps : [],
    priceStarting: data.priceStarting || "Contact for diagnosis",
    ctaText: data.ctaText || "Book Diagnosis",
    serviceKey: data.serviceKey || "",
    warningRules: Array.isArray(data.warningRules) ? data.warningRules : [],
    recoverableScenarios: Array.isArray(data.recoverableScenarios) ? data.recoverableScenarios : [],
    unrecoverableScenarios: Array.isArray(data.unrecoverableScenarios) ? data.unrecoverableScenarios : [],
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    status: data.status === "unpublished" ? "unpublished" : "published",
    order: db.problemSolutions.length + 1
  };
  db.problemSolutions.push(newItem);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Problem Solution Created",
    details: `Created problem solution: "${newItem.title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  await saveProblemSolutionsToFirestore(db.problemSolutions);
  res.status(201).json({ success: true, item: newItem });
});
app.put("/api/admin/problem-solutions/:id", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const index = (db.problemSolutions || []).findIndex((p) => p.id === id || p.key === id);
  if (index === -1) return res.status(404).json({ error: "Problem solution not found" });
  db.problemSolutions[index] = {
    ...db.problemSolutions[index],
    ...req.body,
    id: db.problemSolutions[index].id
  };
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Problem Solution Updated",
    details: `Updated problem solution: "${db.problemSolutions[index].title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  await saveProblemSolutionsToFirestore(db.problemSolutions);
  res.json({ success: true, item: db.problemSolutions[index] });
});
app.delete("/api/admin/problem-solutions/:id", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const index = (db.problemSolutions || []).findIndex((p) => p.id === id || p.key === id);
  if (index === -1) return res.status(404).json({ error: "Problem solution not found" });
  const removed = db.problemSolutions.splice(index, 1)[0];
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Problem Solution Deleted",
    details: `Removed problem solution: "${removed.title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  await saveProblemSolutionsToFirestore(db.problemSolutions);
  res.json({ success: true, removedId: id });
});
app.patch("/api/admin/problem-solutions/:id/status", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const index = (db.problemSolutions || []).findIndex((p) => p.id === id || p.key === id);
  if (index === -1) return res.status(404).json({ error: "Problem solution not found" });
  const newStatus = req.body.status || (db.problemSolutions[index].status === "published" ? "unpublished" : "published");
  db.problemSolutions[index].status = newStatus;
  saveDb();
  await saveProblemSolutionsToFirestore(db.problemSolutions);
  res.json({ success: true, item: db.problemSolutions[index], status: newStatus });
});
app.post("/api/problem-leads", publicApiRateLimiter, async (req, res) => {
  const { fullName, phone, whatsapp, email, area, deviceType, problemTitle, problemDescription, urgency } = req.body;
  if (!fullName || !phone || !problemDescription) {
    return res.status(400).json({ error: "Full name, phone, and problem description are required." });
  }
  if (!Array.isArray(db.problemLeads)) db.problemLeads = [];
  const newLead = {
    id: `LEAD-PRB-${Date.now().toString(36).toUpperCase()}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    fullName: String(fullName).trim(),
    phone: String(phone).trim(),
    whatsapp: String(whatsapp || phone).trim(),
    email: email ? String(email).trim() : void 0,
    area: String(area || "Peshawar").trim(),
    deviceType: String(deviceType || "Computer").trim(),
    problemTitle: String(problemTitle || "Unlisted Computer Problem").trim(),
    problemDescription: String(problemDescription).trim(),
    urgency: urgency === "urgent" ? "urgent" : "normal",
    status: "NEW",
    technicianNotes: ""
  };
  db.problemLeads.unshift(newLead);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "New Problem Lead",
    details: `Customer [${newLead.fullName}] submitted unlisted problem: "${newLead.problemTitle}" (${newLead.phone})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Website Visitor"
  });
  saveDb();
  await saveProblemLeadToFirestore(newLead);
  try {
    const adminDest = getNotificationDestination();
    const subject = sanitizeEmailSubject(`[LEAD INQUIRY] Problem Research Request: ${newLead.problemTitle} (${newLead.fullName})`);
    const emailHtml = generateBrandedEmailHtml({
      title: "New Problem Research & Diagnosis Request",
      badge: "RESEARCH LEAD",
      fullName: newLead.fullName,
      phone: newLead.phone,
      whatsapp: newLead.whatsapp,
      email: newLead.email,
      area: newLead.area,
      service: `Problem: ${newLead.problemTitle}`,
      message: `Device: ${newLead.deviceType}
Urgency: ${newLead.urgency.toUpperCase()}
Ref: ${newLead.id}

Problem Description:
${newLead.problemDescription}`,
      urgency: newLead.urgency
    });
    sendNotificationEmail({
      to: adminDest,
      subject,
      html: emailHtml,
      leadType: "Problem Research Lead",
      leadName: newLead.fullName
    }).catch((e) => console.warn("Problem lead email dispatch error:", e));
  } catch (err) {
    console.warn("Problem lead email notification handled:", err);
  }
  res.status(201).json({
    success: true,
    lead: newLead,
    message: "Thank you! Your computer problem has been received. Safiullah will research your symptom and contact you shortly."
  });
});
app.get("/api/admin/problem-leads", checkAdminAuth, async (req, res) => {
  await firestoreReady;
  const fsLeads = await loadProblemLeadsFromFirestore();
  if (fsLeads.length > 0) {
    db.problemLeads = fsLeads;
  }
  res.json({ success: true, problemLeads: db.problemLeads || [] });
});
app.patch("/api/admin/problem-leads/:id/status", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const lead = (db.problemLeads || []).find((l) => l.id === id);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  lead.status = status;
  lead.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  await saveProblemLeadToFirestore(lead);
  res.json({ success: true, lead });
});
app.post("/api/admin/problem-leads/:id/notes", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const lead = (db.problemLeads || []).find((l) => l.id === id);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  lead.technicianNotes = notes;
  lead.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  await saveProblemLeadToFirestore(lead);
  res.json({ success: true, lead });
});
app.delete("/api/admin/problem-leads/:id", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const index = (db.problemLeads || []).findIndex((l) => l.id === id);
  if (index === -1) return res.status(404).json({ error: "Lead not found" });
  const removed = db.problemLeads.splice(index, 1)[0];
  saveDb();
  await deleteProblemLeadFromFirestore(id);
  res.json({ success: true, removedId: id });
});
app.post("/api/admin/upload-icon", checkAdminAuth, (req, res) => {
  const { filename, dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "Valid base64 image dataUrl required." });
  }
  ensureDbDirectory();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
  if (!matches || !matches[2]) {
    return res.status(400).json({ error: "Malformed base64 image data." });
  }
  const ext = matches[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
  const safeBase = (filename || "service-icon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const outFilename = `icon-${safeBase}-${Date.now().toString(36)}.${ext}`;
  const outPath = path.join(UPLOADS_DIR, outFilename);
  const buf = Buffer.from(matches[2].replace(/\s+/g, ""), "base64");
  fs.writeFileSync(outPath, buf);
  const finalUrl = `/uploads/${outFilename}`;
  if (!Array.isArray(db.media)) db.media = [];
  db.media.unshift({
    id: `media-icon-${Date.now().toString(36)}`,
    name: outFilename,
    url: finalUrl,
    dataUrl: dataUrl.length < 5e5 ? dataUrl : void 0,
    size: `${(buf.length / 1024).toFixed(1)} KB`,
    type: `image/${ext}`,
    uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
    usedIn: "Service Custom Icon"
  });
  saveDb();
  res.json({ success: true, url: finalUrl, filename: outFilename });
});
app.post("/api/admin/bookings", checkAdminAuth, (req, res) => {
  const {
    fullName,
    phone,
    whatsapp,
    area,
    deviceType,
    computerBrandModel,
    serviceRequired,
    problemDescription,
    preferredDate,
    preferredTime,
    urgency,
    containsImportantData,
    status,
    adminNotes,
    scheduledTime
  } = req.body;
  if (!fullName || !phone) {
    return res.status(400).json({ error: "Full Name and Phone Number are required" });
  }
  const newBooking = {
    id: `PSH-ADM-${Date.now().toString(36).toUpperCase()}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    fullName: String(fullName).trim(),
    phone: String(phone).trim(),
    whatsapp: String(whatsapp || phone).trim(),
    area: String(area || "Peshawar").trim(),
    deviceType: deviceType || "Laptop",
    computerBrandModel: String(computerBrandModel || "").trim(),
    serviceRequired: String(serviceRequired || "General Troubleshooting").trim(),
    problemDescription: String(problemDescription || "").trim(),
    preferredDate: preferredDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    preferredTime: preferredTime || "Morning (10 AM - 1 PM)",
    urgency: urgency === "Urgent" ? "Urgent" : "Normal",
    containsImportantData: containsImportantData === "YES" ? "YES" : "NO",
    status: status || "NEW",
    adminNotes: adminNotes || "",
    scheduledTime: scheduledTime || ""
  };
  db.bookings.unshift(newBooking);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Booking Created Manually",
    details: `Admin booked on-site visit for ${newBooking.fullName} (${newBooking.area})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  res.status(201).json({ success: true, booking: newBooking });
});
app.put("/api/admin/bookings/:id", checkAdminAuth, (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  const index = db.bookings.findIndex(
    (b) => b.id && b.id.trim().toLowerCase() === targetIdLower || b.trackingId && b.trackingId.trim().toLowerCase() === targetIdLower || b.id === rawId || b.id === decodedId
  );
  if (index === -1) {
    const newBooking = {
      id: decodedId || rawId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      fullName: req.body.fullName || "Customer",
      phone: req.body.phone || "",
      whatsapp: req.body.whatsapp || req.body.phone || "",
      area: req.body.area || "Peshawar",
      deviceType: req.body.deviceType || "Laptop",
      computerBrandModel: req.body.computerBrandModel || "",
      serviceRequired: req.body.serviceRequired || "General Diagnostic",
      problemDescription: req.body.problemDescription || "",
      preferredDate: req.body.preferredDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: req.body.preferredTime || "",
      urgency: req.body.urgency || "Normal",
      containsImportantData: req.body.containsImportantData || "NO",
      status: req.body.status || "NEW",
      adminNotes: req.body.adminNotes || "",
      ...req.body
    };
    db.bookings.unshift(newBooking);
    saveDb();
    return res.json({ success: true, booking: newBooking });
  }
  const prevStatus = db.bookings[index].status;
  db.bookings[index] = { ...db.bookings[index], ...req.body, id: db.bookings[index].id };
  if (req.body.status && req.body.status !== prevStatus) {
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Booking Status Changed",
      details: `Request #${db.bookings[index].id} status changed from ${prevStatus} to ${req.body.status} (${db.bookings[index].fullName})`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
  }
  saveDb();
  res.json({ success: true, booking: db.bookings[index] });
});
app.post("/api/admin/bookings/:id/confirm", checkAdminAuth, async (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  let booking = db.bookings.find(
    (b) => b.id && b.id.trim().toLowerCase() === targetIdLower || b.trackingId && b.trackingId.trim().toLowerCase() === targetIdLower || b.id === rawId || b.id === decodedId
  );
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  const scheduledTime = req.body.scheduledTime || booking.scheduledTime || `${booking.preferredDate} (${booking.preferredTime})`;
  booking.status = "CONFIRMED";
  booking.scheduledTime = scheduledTime;
  if (req.body.adminNotes !== void 0) {
    booking.adminNotes = req.body.adminNotes;
  }
  const lead = (db.inquiries || []).find(
    (inq) => inq.bookingId === booking.id || booking.leadId && inq.id === booking.leadId || inq.phone && inq.phone === booking.phone
  );
  if (lead) {
    lead.status = "CONVERTED";
    lead.scheduledTime = scheduledTime;
  }
  db.activityLogs.unshift({
    id: `log-confirm-${Date.now()}`,
    action: "Appointment Confirmed",
    details: `Appointment confirmed for ${booking.fullName} (${booking.area}). Scheduled Time: ${scheduledTime}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  try {
    const adminDb = getAdminFirestore();
    await Promise.all([
      adminDb.collection("bookings").doc(booking.id).set({
        status: "CONFIRMED",
        scheduledTime,
        adminNotes: booking.adminNotes || "",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true }),
      adminDb.collection("serviceRequests").doc(booking.id).set({
        status: "CONFIRMED",
        scheduledTime,
        adminNotes: booking.adminNotes || "",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true }),
      adminDb.collection("requests").doc(booking.id).set({
        status: "CONFIRMED",
        scheduledTime,
        adminNotes: booking.adminNotes || "",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true }),
      lead ? adminDb.collection("inquiries").doc(lead.id).set({
        status: "CONVERTED",
        scheduledTime,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true }) : Promise.resolve()
    ]);
    console.log(`[FIRESTORE] \u2705 Booking ${booking.id} confirmed and updated in Firestore`);
  } catch (fsErr) {
    console.error("[FIRESTORE] \u274C Failed to update booking in Firestore:", fsErr);
  }
  let emailDelivery = { status: "not_attempted" };
  const targetEmail = booking.email || (lead ? lead.email : "");
  const shouldSendEmail = req.body.sendEmail === true || req.body.sendEmail !== false && targetEmail && targetEmail.includes("@");
  if (shouldSendEmail && targetEmail && targetEmail.includes("@")) {
    const html = generateAppointmentConfirmedEmailHtml({
      booking,
      scheduledTime
    });
    const techPhone = getTechnicianPhone();
    const text = `
APPOINTMENT CONFIRMED - TECHFIX PESHAWAR
Booking Reference ID: ${booking.id}
Customer: ${booking.fullName}
Primary Phone: ${booking.phone}
WhatsApp: ${booking.whatsapp || booking.phone}
Area / Sector: ${booking.area} (Peshawar)
Service Required: ${booking.serviceRequired}
Device & Model: ${booking.deviceType} ${booking.computerBrandModel || ""}
Confirmed Arrival Slot: ${scheduledTime}
Urgency: ${(booking.urgency || "NORMAL").toUpperCase()}
Important Data: ${booking.containsImportantData || "NO"}

Your scheduled appointment is confirmed! Our technician will arrive at the scheduled time: ${scheduledTime}.
If you need to reschedule or have urgent queries, please call ${techPhone} or message on WhatsApp.
    `.trim();
    try {
      emailDelivery = await sendNotificationEmail({
        to: targetEmail,
        subject: `[CONFIRMED] Appointment Scheduled - TechFix Peshawar (Ref #${booking.id})`,
        html,
        text,
        lead: booking
      });
      console.log(`\u2705 Appointment confirmation email dispatched to ${targetEmail}: status=${emailDelivery.status}`);
    } catch (err) {
      console.error("Failed to send customer confirmation email:", err);
      emailDelivery = { status: "failed", error: err.message };
    }
  }
  const isEmailSuccessful = emailDelivery.status === "sent";
  return res.json({
    success: true,
    booking,
    emailDelivery,
    emailSent: isEmailSuccessful,
    emailError: isEmailSuccessful ? void 0 : emailDelivery.error,
    message: shouldSendEmail && targetEmail ? isEmailSuccessful ? `Appointment confirmed and confirmation email delivered to ${targetEmail}.` : `Appointment confirmed in database, but confirmation email status: ${emailDelivery.status}. (${emailDelivery.error || "Check email configuration"})` : `Appointment confirmed! (Schedule: ${scheduledTime}). Ready for WhatsApp confirmation or manual email dispatch.`
  });
});
app.post("/api/admin/bookings/:id/send-confirmation-email", checkAdminAuth, async (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  const booking = db.bookings.find(
    (b) => b.id && b.id.trim().toLowerCase() === targetIdLower || b.id === rawId || b.id === decodedId
  );
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  let targetEmail = req.body?.customerEmail && String(req.body.customerEmail).trim() || booking.email;
  if (!targetEmail || !targetEmail.includes("@") || !targetEmail.includes(".")) {
    return res.status(400).json({ error: "No valid customer email address on file for this booking. Please specify a valid email." });
  }
  const lowerEmail = targetEmail.toLowerCase();
  if (lowerEmail.endsWith("@gmil.com") || lowerEmail.endsWith("@gmai.com") || lowerEmail.endsWith("@gmial.com")) {
    return res.status(400).json({
      error: `Invalid email domain detected in "${targetEmail}". Did you mean "@gmail.com"? Please correct the email before dispatching.`
    });
  }
  if (req.body?.customerEmail && req.body.customerEmail.trim() !== booking.email) {
    booking.email = targetEmail;
    saveDb();
  }
  const scheduledTime = req.body.scheduledTime || booking.scheduledTime || `${booking.preferredDate || "Tomorrow"} (${booking.preferredTime || "Morning"})`;
  const html = generateAppointmentConfirmedEmailHtml({
    booking,
    scheduledTime
  });
  const techPhone = getTechnicianPhone();
  const text = `
APPOINTMENT CONFIRMED - TECHFIX PESHAWAR
Booking Reference ID: ${booking.id}
Customer: ${booking.fullName}
Primary Phone: ${booking.phone}
WhatsApp: ${booking.whatsapp || booking.phone}
Area / Sector: ${booking.area} (Peshawar)
Service Required: ${booking.serviceRequired}
Device & Model: ${booking.deviceType} ${booking.computerBrandModel || ""}
Confirmed Arrival Slot: ${scheduledTime}

Your scheduled appointment is confirmed! Our technician will arrive at the scheduled time: ${scheduledTime}.
If you need assistance, please call ${techPhone}.
  `.trim();
  try {
    const emailDelivery = await sendNotificationEmail({
      to: targetEmail,
      subject: `[CONFIRMED] Appointment Scheduled - TechFix Peshawar (Ref #${booking.id})`,
      html,
      text,
      lead: booking
    });
    const isDelivered = emailDelivery.status === "sent";
    if (!isDelivered) {
      return res.status(422).json({
        success: false,
        delivered: false,
        status: emailDelivery.status,
        provider: emailDelivery.provider,
        error: emailDelivery.error || `Email delivery failed (${emailDelivery.status}). Check email settings or SMTP password.`
      });
    }
    return res.json({
      success: true,
      delivered: true,
      status: emailDelivery.status,
      provider: emailDelivery.provider,
      messageId: emailDelivery.messageId,
      message: `Confirmation email successfully delivered to ${targetEmail} via ${emailDelivery.provider.toUpperCase()}!`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to dispatch confirmation email."
    });
  }
});
app.post("/api/admin/bookings/:id/contact", checkAdminAuth, async (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  let booking = db.bookings.find(
    (b) => b.id && b.id.trim().toLowerCase() === targetIdLower || b.trackingId && b.trackingId.trim().toLowerCase() === targetIdLower || b.id === rawId || b.id === decodedId
  );
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  booking.status = "CONTACTED";
  const technicianNote = req.body.technicianNote || req.body.adminNotes || "Our technician has reviewed your request and is reaching out to coordinate diagnostic details.";
  if (req.body.adminNotes !== void 0) {
    booking.adminNotes = req.body.adminNotes;
  }
  const lead = (db.inquiries || []).find(
    (inq) => inq.bookingId === booking.id || booking.leadId && inq.id === booking.leadId || inq.phone && inq.phone === booking.phone
  );
  if (lead) {
    lead.status = "CONTACTED";
  }
  db.activityLogs.unshift({
    id: `log-contact-${Date.now()}`,
    action: "Customer Contacted",
    details: `Technician contacted ${booking.fullName} for Service #${booking.id} (${booking.serviceRequired})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  let emailDelivery = { status: "not_attempted" };
  const targetEmail = booking.email || (lead ? lead.email : "");
  if (req.body.sendEmail === true && targetEmail && targetEmail.includes("@")) {
    const html = generateTechnicianContactEmailHtml({
      booking,
      technicianNote
    });
    const text = `
TECHNICIAN UPDATE - TECHFIX PESHAWAR
Service Request Ref ID: ${booking.id}
Customer: ${booking.fullName}
Service: ${booking.serviceRequired}
Device: ${booking.deviceType} ${booking.computerBrandModel || ""}

Our technician is contacting you regarding your computer service request!
Please check your WhatsApp or incoming calls (${booking.phone}).

Technician Note:
${technicianNote}

Direct WhatsApp: https://wa.me/${getTechnicianWhatsApp()}
Phone: ${getTechnicianPhone()}
    `.trim();
    try {
      emailDelivery = await sendNotificationEmail({
        to: targetEmail,
        subject: `Technician Update regarding your Service Request #${booking.id} - TechFix Peshawar`,
        html,
        text,
        lead: booking
      });
      console.log(`\u2705 Technician contact email dispatched to ${targetEmail}: status=${emailDelivery.status}`);
    } catch (err) {
      console.error("Failed to send customer contact email:", err);
      emailDelivery = { status: "failed", error: err.message };
    }
  }
  res.json({
    success: true,
    booking,
    emailDelivery,
    message: req.body.sendEmail && targetEmail ? `Contact email sent to customer at ${targetEmail}.` : `Marked as contacted. Ready for WhatsApp dispatch.`
  });
});
app.post("/api/admin/inquiries/:id/confirm", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const inquiry = (db.inquiries || []).find((inq) => inq.id === id);
  if (!inquiry) {
    return res.status(404).json({ error: "Inquiry not found" });
  }
  const scheduledTime = req.body.scheduledTime || `${inquiry.preferredDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]} (${inquiry.preferredTime || "Morning (10 AM - 1 PM)"})`;
  inquiry.status = "CONVERTED";
  let booking = db.bookings.find((b) => b.id === inquiry.bookingId || inquiry.phone && b.phone === inquiry.phone);
  if (!booking) {
    booking = {
      id: inquiry.bookingId || `PSH-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      fullName: inquiry.fullName,
      email: inquiry.email,
      phone: inquiry.phone,
      whatsapp: inquiry.whatsapp || inquiry.phone,
      area: inquiry.area || "Peshawar",
      deviceType: inquiry.deviceType || "Laptop",
      computerBrandModel: inquiry.computerBrandModel || "",
      serviceRequired: inquiry.service || inquiry.subject || "General Troubleshooting",
      problemDescription: inquiry.message,
      preferredDate: inquiry.preferredDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      preferredTime: inquiry.preferredTime || "Morning (10 AM - 1 PM)",
      urgency: inquiry.urgency || "Normal",
      containsImportantData: inquiry.containsImportantData || "NO",
      status: "CONFIRMED",
      adminNotes: req.body.adminNotes || "",
      scheduledTime
    };
    db.bookings.unshift(booking);
    inquiry.bookingId = booking.id;
  } else {
    booking.status = "CONFIRMED";
    booking.scheduledTime = scheduledTime;
    if (req.body.adminNotes) booking.adminNotes = req.body.adminNotes;
  }
  saveDb();
  let emailDelivery = { status: "not_attempted" };
  const targetEmail = req.body?.customerEmail && req.body.customerEmail.trim() || inquiry.email || booking.email;
  if (req.body.sendEmail === true && targetEmail && targetEmail.includes("@")) {
    const html = generateAppointmentConfirmedEmailHtml({
      booking,
      scheduledTime
    });
    const techPhone = getTechnicianPhone();
    const text = `
APPOINTMENT CONFIRMED - TECHFIX PESHAWAR
Booking Reference ID: ${booking.id}
Customer: ${booking.fullName}
Primary Phone: ${booking.phone}
WhatsApp: ${booking.whatsapp || booking.phone}
Area / Sector: ${booking.area} (Peshawar)
Service Required: ${booking.serviceRequired}
Device & Model: ${booking.deviceType} ${booking.computerBrandModel || ""}
Confirmed Arrival Slot: ${scheduledTime}

Your scheduled appointment is confirmed! Our technician will arrive at the scheduled time: ${scheduledTime}.
If you have any questions or need to reschedule, please call ${techPhone} or message on WhatsApp.
    `.trim();
    try {
      emailDelivery = await sendNotificationEmail({
        to: targetEmail,
        subject: `[CONFIRMED] Appointment Scheduled - TechFix Peshawar (Ref #${booking.id})`,
        html,
        text,
        lead: booking
      });
      console.log(`\u2705 Appointment confirmation email dispatched to ${targetEmail}: status=${emailDelivery.status}`);
    } catch (err) {
      console.error("Failed to send customer confirmation email:", err);
      emailDelivery = { status: "failed", error: err.message };
    }
  }
  res.json({
    success: true,
    inquiry,
    booking,
    emailDelivery,
    message: req.body.sendEmail && targetEmail ? emailDelivery.status === "sent" ? `Appointment confirmed! Confirmation email delivered to ${targetEmail}.` : `Appointment confirmed, but email status: ${emailDelivery.status}. (${emailDelivery.error || "Check email configuration"})` : `Lead converted to confirmed appointment! (Schedule: ${scheduledTime}). Ready for WhatsApp confirmation or manual email dispatch.`
  });
});
app.post("/api/admin/inquiries/:id/send-confirmation-email", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const inquiry = (db.inquiries || []).find((inq) => inq.id === id);
  if (!inquiry) {
    return res.status(404).json({ error: "Inquiry not found" });
  }
  const booking = db.bookings.find((b) => b.id === inquiry.bookingId || inquiry.phone && b.phone === inquiry.phone) || {
    id: inquiry.bookingId || `PSH-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
    fullName: inquiry.fullName,
    email: inquiry.email,
    phone: inquiry.phone,
    whatsapp: inquiry.whatsapp || inquiry.phone,
    area: inquiry.area || "Peshawar",
    deviceType: inquiry.deviceType || "Laptop",
    computerBrandModel: inquiry.computerBrandModel || "",
    serviceRequired: inquiry.service || inquiry.subject || "General Troubleshooting",
    problemDescription: inquiry.message,
    status: "CONFIRMED"
  };
  let targetEmail = req.body?.customerEmail && String(req.body.customerEmail).trim() || inquiry.email || booking.email;
  if (!targetEmail || !targetEmail.includes("@") || !targetEmail.includes(".")) {
    return res.status(400).json({ error: "No valid customer email address on file for this inquiry. Please provide a valid email." });
  }
  const lowerEmail = targetEmail.toLowerCase();
  if (lowerEmail.endsWith("@gmil.com") || lowerEmail.endsWith("@gmai.com") || lowerEmail.endsWith("@gmial.com")) {
    return res.status(400).json({
      error: `Invalid email domain detected in "${targetEmail}". Did you mean "@gmail.com"? Please correct before sending.`
    });
  }
  if (req.body?.customerEmail && req.body.customerEmail.trim() !== inquiry.email) {
    inquiry.email = targetEmail;
    if (booking) booking.email = targetEmail;
    saveDb();
  }
  const scheduledTime = req.body.scheduledTime || booking.scheduledTime || `${inquiry.preferredDate || "Tomorrow"} (${inquiry.preferredTime || "Morning"})`;
  const html = generateAppointmentConfirmedEmailHtml({
    booking,
    scheduledTime
  });
  const techPhone = getTechnicianPhone();
  const text = `
APPOINTMENT CONFIRMED - TECHFIX PESHAWAR
Booking Reference ID: ${booking.id}
Customer: ${booking.fullName}
Primary Phone: ${booking.phone}
WhatsApp: ${booking.whatsapp || booking.phone}
Area / Sector: ${booking.area} (Peshawar)
Service Required: ${booking.serviceRequired}
Device & Model: ${booking.deviceType} ${booking.computerBrandModel || ""}
Confirmed Arrival Slot: ${scheduledTime}

Your scheduled appointment is confirmed! Our technician will arrive at the scheduled time: ${scheduledTime}.
If you need assistance, please call ${techPhone}.
  `.trim();
  try {
    const emailDelivery = await sendNotificationEmail({
      to: targetEmail,
      subject: `[CONFIRMED] Appointment Scheduled - TechFix Peshawar (Ref #${booking.id})`,
      html,
      text,
      lead: booking
    });
    const isDelivered = emailDelivery.status === "sent";
    if (!isDelivered) {
      return res.status(422).json({
        success: false,
        delivered: false,
        status: emailDelivery.status,
        provider: emailDelivery.provider,
        error: emailDelivery.error || `Email delivery failed (${emailDelivery.status}). Check email settings or SMTP password.`
      });
    }
    return res.json({
      success: true,
      delivered: true,
      status: emailDelivery.status,
      provider: emailDelivery.provider,
      messageId: emailDelivery.messageId,
      message: `Confirmation email successfully delivered to ${targetEmail} via ${emailDelivery.provider.toUpperCase()}!`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to dispatch confirmation email."
    });
  }
});
app.post("/api/admin/inquiries/:id/contact", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const inquiry = (db.inquiries || []).find((inq) => inq.id === id);
  if (!inquiry) {
    return res.status(404).json({ error: "Inquiry not found" });
  }
  inquiry.status = "CONTACTED";
  const technicianNote = req.body.technicianNote || req.body.adminNotes || "Our technician has reviewed your inquiry and is reaching out via WhatsApp.";
  let booking = db.bookings.find((b) => b.id === inquiry.bookingId || inquiry.phone && b.phone === inquiry.phone);
  if (booking) {
    booking.status = "CONTACTED";
  } else {
    booking = {
      id: inquiry.id,
      fullName: inquiry.fullName,
      email: inquiry.email,
      phone: inquiry.phone,
      whatsapp: inquiry.whatsapp || inquiry.phone,
      area: inquiry.area || "Peshawar",
      deviceType: inquiry.deviceType || "Computer",
      computerBrandModel: inquiry.computerBrandModel || "",
      serviceRequired: inquiry.service || inquiry.subject || "General Support",
      problemDescription: inquiry.message,
      status: "CONTACTED"
    };
  }
  saveDb();
  let emailDelivery = { status: "not_attempted" };
  const targetEmail = inquiry.email;
  if (req.body.sendEmail === true && targetEmail && targetEmail.includes("@")) {
    const html = generateTechnicianContactEmailHtml({
      booking,
      technicianNote
    });
    const text = `
TECHNICIAN UPDATE - TECHFIX PESHAWAR
Inquiry Ref ID: ${inquiry.id}
Customer: ${inquiry.fullName}

Our technician is contacting you regarding your computer inquiry!
Please check your WhatsApp or phone messages (${inquiry.phone}).

Technician Note:
${technicianNote}
    `.trim();
    try {
      emailDelivery = await sendNotificationEmail({
        to: targetEmail,
        subject: `Technician Update regarding your Inquiry #${inquiry.id} - TechFix Peshawar`,
        html,
        text,
        lead: inquiry
      });
    } catch (err) {
      emailDelivery = { status: "failed", error: err.message };
    }
  }
  res.json({
    success: true,
    inquiry,
    emailDelivery,
    message: req.body.sendEmail && targetEmail ? `Contact email sent to ${targetEmail}.` : `Marked as contacted. Ready for WhatsApp follow-up.`
  });
});
app.delete("/api/admin/bookings/:id", checkAdminAuth, (req, res) => {
  const rawId = req.params.id || "";
  const decodedId = decodeURIComponent(rawId).trim();
  const targetIdLower = decodedId.toLowerCase();
  const index = db.bookings.findIndex(
    (b) => b.id && b.id.trim().toLowerCase() === targetIdLower || b.trackingId && b.trackingId.trim().toLowerCase() === targetIdLower || b.id === rawId || b.id === decodedId
  );
  let removedItem = null;
  if (index !== -1) {
    removedItem = db.bookings[index];
    db.bookings.splice(index, 1);
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Booking Deleted",
      details: `Removed request #${removedItem.id || decodedId} for ${removedItem.fullName || "Customer"}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
  }
  const beforeLen = db.bookings.length;
  db.bookings = db.bookings.filter(
    (b) => b.id !== rawId && b.id !== decodedId && (!b.id || b.id.trim().toLowerCase() !== targetIdLower) && (!b.trackingId || b.trackingId.trim().toLowerCase() !== targetIdLower)
  );
  if (removedItem || db.bookings.length !== beforeLen) {
    saveDb();
    const targetDelId = removedItem?.id || decodedId;
    deleteDocFromFirestore("bookings", targetDelId);
    deleteDocFromFirestore("serviceRequests", targetDelId);
    deleteDocFromFirestore("requests", targetDelId);
    deleteDocFromFirestore("inquiries", targetDelId);
  }
  res.json({
    success: true,
    message: removedItem ? `Booking ${removedItem.id} deleted successfully.` : `Booking removed.`,
    deletedId: removedItem?.id || decodedId
  });
});
app.post("/api/admin/customers", checkAdminAuth, (req, res) => {
  const { name, phone, whatsapp, area, notes, devices, totalSpent } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: "Name and Phone are required" });
  }
  const newCust = {
    id: `cust-${Date.now()}`,
    name: String(name).trim(),
    phone: String(phone).trim(),
    whatsapp: String(whatsapp || phone).trim(),
    area: String(area || "Peshawar").trim(),
    totalBookings: 0,
    totalSpent: totalSpent || "Rs. 0",
    lastServiceDate: "Never",
    notes: notes || "",
    devices: Array.isArray(devices) ? devices : []
  };
  db.customers.unshift(newCust);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Customer Profile Created",
    details: `Added new client: ${newCust.name} (${newCust.phone})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("customers", newCust.id, newCust);
  res.status(201).json({ success: true, customer: newCust });
});
app.put("/api/admin/customers/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.customers.findIndex((c) => c.id === id);
  if (index === -1) return res.status(404).json({ error: "Customer not found" });
  db.customers[index] = { ...db.customers[index], ...req.body, id };
  saveDb();
  syncDocToFirestore("customers", id, db.customers[index]);
  res.json({ success: true, customer: db.customers[index] });
});
app.delete("/api/admin/customers/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  db.customers = db.customers.filter((c) => c.id !== id);
  saveDb();
  deleteDocFromFirestore("customers", id);
  res.json({ success: true });
});
app.post("/api/admin/faqs", checkAdminAuth, (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ error: "Question and Answer are required" });
  }
  const newFaq = {
    id: `faq-${Date.now()}`,
    question: String(question).trim(),
    answer: String(answer).trim(),
    category: category || "General"
  };
  db.faqs.push(newFaq);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "FAQ Added",
    details: `Added new FAQ: "${newFaq.question.slice(0, 45)}..."`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("faqs", newFaq.id, newFaq);
  res.status(201).json({ success: true, faq: newFaq });
});
app.put("/api/admin/faqs/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.faqs.findIndex((f) => f.id === id);
  if (index === -1) return res.status(404).json({ error: "FAQ not found" });
  db.faqs[index] = { ...db.faqs[index], ...req.body, id };
  saveDb();
  syncDocToFirestore("faqs", id, db.faqs[index]);
  res.json({ success: true, faq: db.faqs[index] });
});
app.delete("/api/admin/faqs/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  db.faqs = db.faqs.filter((f) => f.id !== id);
  saveDb();
  deleteDocFromFirestore("faqs", id);
  res.json({ success: true });
});
app.put("/api/admin/faqs", checkAdminAuth, (req, res) => {
  const { faqs } = req.body;
  if (Array.isArray(faqs)) {
    db.faqs = faqs;
    saveDb();
    faqs.forEach((f) => {
      if (f?.id) syncDocToFirestore("faqs", f.id, f);
    });
    return res.json({ success: true, faqs: db.faqs });
  }
  res.status(400).json({ error: "Invalid faqs format" });
});
app.post("/api/admin/case-studies", checkAdminAuth, (req, res) => {
  const { title, customerType, problem, diagnosis, solution, result, deviceInfo } = req.body;
  if (!problem || !solution) {
    return res.status(400).json({ error: "Problem and solution are required" });
  }
  const newCase = {
    id: `case-${Date.now()}`,
    title: title || "On-Site Repair Case",
    customerType: customerType || "Home User",
    date: (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    problem,
    diagnosis: diagnosis || "",
    solution,
    result: result || "",
    deviceInfo: deviceInfo || "Laptop"
  };
  db.caseStudies.unshift(newCase);
  db.activityLogs.unshift({
    id: `log-${Date.now()}`,
    action: "Real Service Case Published",
    details: `Published case: "${newCase.title}"`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    user: "Safiullah (Admin)"
  });
  saveDb();
  syncDocToFirestore("caseStudies", newCase.id, newCase);
  res.json({ success: true, caseStudy: newCase });
});
app.put("/api/admin/case-studies/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = db.caseStudies.findIndex((c) => c.id === id);
  if (index === -1) return res.status(404).json({ error: "Case study not found" });
  db.caseStudies[index] = { ...db.caseStudies[index], ...req.body, id };
  saveDb();
  syncDocToFirestore("caseStudies", id, db.caseStudies[index]);
  res.json({ success: true, caseStudy: db.caseStudies[index] });
});
app.delete("/api/admin/case-studies/:id", checkAdminAuth, (req, res) => {
  db.caseStudies = db.caseStudies.filter((c) => c.id !== req.params.id);
  saveDb();
  deleteDocFromFirestore("caseStudies", req.params.id);
  res.json({ success: true });
});
app.post("/api/admin/media/upload", uploadRateLimiter, checkAdminAuth, (req, res) => {
  const { name, dataUrl, usedIn } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: "No image data provided" });
  }
  try {
    let finalUrl = dataUrl;
    if (dataUrl.startsWith("data:image/")) {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
      if (matches && matches[2]) {
        const cleanBase64 = matches[2].replace(/\s+/g, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        const { valid, ext } = validateImageMagicBytes(buffer);
        if (!valid) {
          return res.status(400).json({ error: "Invalid image format. Only authentic JPEG, PNG, WebP, and GIF images are permitted." });
        }
        const safeRandomName = `img-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeRandomName);
        try {
          if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
          fs.writeFileSync(filePath, buffer);
          finalUrl = `/uploads/${safeRandomName}`;
        } catch (fsErr) {
          finalUrl = dataUrl;
        }
      }
    }
    const newMedia = {
      id: `media-${Date.now()}`,
      name: name || "Uploaded Image",
      url: finalUrl,
      dataUrl,
      size: `${Math.round(dataUrl.length / 1370)} KB`,
      type: "image",
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usedIn: usedIn || "General Media"
    };
    db.media.unshift(newMedia);
    if (usedIn === "Technician Profile" || usedIn === "technicianPhoto") {
      db.settings.technicianPhoto = finalUrl;
    }
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Image Uploaded",
      details: `Uploaded image asset "${newMedia.name}" for ${newMedia.usedIn}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    saveDb();
    res.status(201).json({ success: true, item: newMedia, photoUrl: finalUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "The uploaded file could not be processed. Please try again." });
  }
});
app.post("/api/admin/profile-photo", uploadRateLimiter, checkAdminAuth, (req, res) => {
  const { dataUrl, filename } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: "No profile photo data provided" });
  }
  try {
    let finalUrl = dataUrl;
    if (dataUrl.startsWith("data:image/")) {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
      if (matches && matches[2]) {
        const cleanBase64 = matches[2].replace(/\s+/g, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        const { valid, ext } = validateImageMagicBytes(buffer);
        if (!valid) {
          return res.status(400).json({ error: "Invalid image format. Only authentic JPEG, PNG, WebP, and GIF images are permitted." });
        }
        const safeRandomName = `technician-portrait-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeRandomName);
        try {
          if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
          fs.writeFileSync(filePath, buffer);
          finalUrl = `/uploads/${safeRandomName}`;
        } catch (fsErr) {
          finalUrl = dataUrl;
        }
      }
    }
    db.settings.technicianPhoto = finalUrl;
    const mediaItem = {
      id: `media-profile-${Date.now()}`,
      name: filename || "Technician Profile Photo",
      url: finalUrl,
      dataUrl,
      size: `${Math.round(dataUrl.length / 1370)} KB`,
      type: "image",
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usedIn: "Technician Profile"
    };
    db.media.unshift(mediaItem);
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Profile Picture Updated",
      details: "Technician profile portrait photo updated successfully",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    saveDb();
    res.json({ success: true, photoUrl: finalUrl, settings: db.settings });
  } catch (err) {
    console.error("Profile photo upload error:", err);
    res.status(500).json({ error: "The uploaded file could not be processed. Please try again." });
  }
});
app.get("/api/media/image/:id", (req, res) => {
  const item = db.media.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).send("Image not found");
  if (item.dataUrl && item.dataUrl.startsWith("data:image/")) {
    const matches = item.dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
    if (matches && matches[2]) {
      const mime = `image/${matches[1]}`;
      const buf = Buffer.from(matches[2].replace(/\s+/g, ""), "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buf);
    }
  }
  if (item.url && item.url.startsWith("/uploads/")) {
    const filePath = path.join(UPLOADS_DIR, path.basename(item.url));
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }
  res.redirect("/uploads/technician-portrait-1789213477063.jpg");
});
app.delete("/api/admin/media/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  db.media = db.media.filter((m) => m.id !== id);
  saveDb();
  res.json({ success: true });
});
app.put("/api/admin/settings", checkAdminAuth, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({ error: "Invalid settings format" });
  }
  try {
    const safeEmail = await saveEmailSettings({
      provider: settings.emailProvider,
      senderEmail: settings.resendFromEmail || settings.senderEmail,
      adminEmail: settings.resendTargetEmail || settings.targetEmail || settings.adminEmail,
      resendApiKey: settings.resendApiKey,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort ? Number(settings.smtpPort) : void 0,
      smtpUser: settings.gmailUser || settings.smtpUser,
      smtpPassword: settings.smtpPassword || settings.gmailAppPassword,
      clearResendApiKey: settings.clearResendApiKey === true,
      clearSmtpPassword: settings.clearSmtpPassword === true
    });
    const protectedMerge = { ...db.settings };
    for (const [key, val] of Object.entries(settings)) {
      if (!CREDENTIAL_FIELDS.includes(key)) {
        protectedMerge[key] = val;
      }
    }
    protectedMerge.emailProvider = safeEmail.provider;
    protectedMerge.resendFromEmail = safeEmail.senderEmail;
    protectedMerge.resendTargetEmail = safeEmail.adminEmail;
    protectedMerge.gmailUser = safeEmail.smtpUser;
    protectedMerge.smtpHost = safeEmail.smtpHost;
    protectedMerge.smtpPort = safeEmail.smtpPort;
    db.settings = protectedMerge;
    NOTIFICATION_DESTINATION = safeEmail.adminEmail || getNotificationDestination();
    saveDb();
    await saveSettingsToFirestore(db.settings);
    const emailConfigLog = [
      `Engine: ${safeEmail.provider.toUpperCase()}`,
      `Resend Key: ${safeEmail.resendApiKeyConfigured ? "[CONFIGURED]" : "[NOT SET]"}`,
      `SMTP Pass: ${safeEmail.smtpPasswordConfigured ? "[CONFIGURED]" : "[NOT SET]"}`,
      `Sender: "${safeEmail.senderEmail}"`,
      `Destination: "${safeEmail.adminEmail}"`
    ];
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Settings Saved",
      details: `Updated settings & active email configuration (${emailConfigLog.join(", ")})`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    if (db.activityLogs.length > 100) db.activityLogs.pop();
    const sanitizedResponse = {
      ...db.settings,
      ...safeEmail
    };
    delete sanitizedResponse.resendApiKey;
    delete sanitizedResponse.gmailAppPassword;
    delete sanitizedResponse.smtpPassword;
    delete sanitizedResponse.adminPassword;
    delete sanitizedResponse.apiSecret;
    return res.json({
      success: true,
      settings: sanitizedResponse,
      activeEmailConfig: {
        target: NOTIFICATION_DESTINATION,
        from: safeEmail.senderEmail,
        hasApiKey: safeEmail.resendApiKeyConfigured,
        hasSmtpPass: safeEmail.smtpPasswordConfigured
      },
      message: "Settings saved successfully! Email credentials securely persisted in Firestore."
    });
  } catch (err) {
    console.error("Error saving admin settings:", err);
    return res.status(500).json({ error: "Failed to save settings: " + (err?.message || err) });
  }
});
app.put("/api/admin/website-content", checkAdminAuth, (req, res) => {
  const { websiteContent } = req.body;
  if (websiteContent && typeof websiteContent === "object") {
    db.websiteContent = { ...db.websiteContent, ...websiteContent };
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Website Content Updated",
      details: `Updated homepage headline, announcements, and SEO meta tags`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    saveDb();
    return res.json({ success: true, websiteContent: db.websiteContent });
  }
  res.status(400).json({ error: "Invalid websiteContent format" });
});
app.put("/api/admin/categories", checkAdminAuth, (req, res) => {
  const { categories } = req.body;
  if (Array.isArray(categories)) {
    db.categories = categories;
    saveDb();
    return res.json({ success: true, categories: db.categories });
  }
  res.status(400).json({ error: "Invalid categories format" });
});
app.put("/api/admin/areas", checkAdminAuth, (req, res) => {
  const { serviceAreas } = req.body;
  if (Array.isArray(serviceAreas)) {
    db.serviceAreas = serviceAreas;
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action: "Service Areas Updated",
      details: `Coverage list updated (${serviceAreas.length} active Peshawar neighborhoods)`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    saveDb();
    return res.json({ success: true, serviceAreas: db.serviceAreas });
  }
  res.status(400).json({ error: "Invalid areas format" });
});
app.post("/api/admin/activity-logs", checkAdminAuth, (req, res) => {
  const { action, details } = req.body;
  if (action) {
    db.activityLogs.unshift({
      id: `log-${Date.now()}`,
      action,
      details: details || "",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user: "Safiullah (Admin)"
    });
    if (db.activityLogs.length > 100) db.activityLogs.pop();
    saveDb();
  }
  res.json({ success: true });
});
app.post("/api/admin/reset-defaults", checkAdminAuth, (req, res) => {
  const currentBookings = db.bookings || [];
  const currentInquiries = db.inquiries || [];
  const currentActivity = db.activityLogs || [];
  db = JSON.parse(JSON.stringify(defaultData));
  if (currentBookings.length > 0) db.bookings = currentBookings;
  if (currentInquiries.length > 0) db.inquiries = currentInquiries;
  if (currentActivity.length > 0) db.activityLogs = currentActivity;
  saveDb();
  res.json({ success: true, message: "Database reset to official defaults (existing bookings preserved)" });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: APP_ROOT,
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(APP_ROOT, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}
app.get("/admin", (_req, res) => {
  res.status(404).send("Not Found");
});
if (!process.env.VERCEL) {
  startServer();
}
var server_default = app;
export {
  NOTIFICATION_DESTINATION,
  server_default as default,
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
