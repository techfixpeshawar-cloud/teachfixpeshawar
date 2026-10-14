import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _firestore: Firestore | null = null;
let _hasServiceAccount = false;

// Fallback project ID if not specified in environment
const DEFAULT_PROJECT_ID = 'gen-lang-client-0759593306';

/**
 * Safely parses Firebase Service Account credentials from various environment variable formats:
 * 1. FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON or escaped JSON string)
 * 2. FIREBASE_SERVICE_ACCOUNT_BASE64 (base64-encoded JSON)
 * 3. Individual variables: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID
 */
function parseServiceAccount(): Record<string, any> | null {
  // Option 1: FIREBASE_SERVICE_ACCOUNT_KEY (standard for Vercel / Cloud deployments)
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (rawKey) {
    try {
      // If it looks like base64, decode first
      if (!rawKey.startsWith('{') && !rawKey.startsWith('"')) {
        const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
        return JSON.parse(decoded);
      }
      // Parse JSON directly (handling potential escaped string quotes)
      const parsed = typeof rawKey === 'string' && rawKey.startsWith('"') && rawKey.endsWith('"')
        ? JSON.parse(JSON.parse(rawKey))
        : JSON.parse(rawKey);

      if (parsed && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err: any) {
      console.warn('[FIREBASE ADMIN] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY:', err?.message || err);
    }
  }

  // Option 2: FIREBASE_SERVICE_ACCOUNT_BASE64 (safe multi-line base64)
  const base64Sa = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64Sa) {
    try {
      const decoded = Buffer.from(base64Sa, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err: any) {
      console.warn('[FIREBASE ADMIN] Could not parse FIREBASE_SERVICE_ACCOUNT_BASE64:', err?.message || err);
    }
  }

  // Option 3: Individual environment variables
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    DEFAULT_PROJECT_ID
  ).trim();

  if (clientEmail && privateKey) {
    try {
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
      return { projectId, clientEmail, privateKey };
    } catch (err: any) {
      console.warn('[FIREBASE ADMIN] Could not parse individual cert credentials:', err?.message || err);
    }
  }

  return null;
}

/**
 * Initializes Firebase Admin SDK as a singleton to prevent duplicate app errors on Vercel cold starts.
 */
export function initFirebaseAdmin(): { app: App; db: Firestore } {
  if (_app && _firestore) {
    return { app: _app, db: _firestore };
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    _app = existingApps[0] as App;
  } else {
    const sa = parseServiceAccount();
    if (sa) {
      try {
        _app = initializeApp({ credential: cert(sa) });
        _hasServiceAccount = true;
      } catch (err: any) {
        console.warn('[FIREBASE ADMIN] Service account init failed, falling back:', err?.message || err);
      }
    }

    if (!_app) {
      const projectId = (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        DEFAULT_PROJECT_ID
      ).trim();
      _app = initializeApp({ projectId });
    }
  }

  // Target named database if configured (e.g., ai-studio-peshawaronsitete-70e75457-6a23-4284-84ee-9bd0ef9c4555)
  const dbId = (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    ''
  ).trim();

  try {
    _firestore = dbId ? getFirestore(_app, dbId) : getFirestore(_app);
  } catch (err: any) {
    console.warn(`[FIREBASE ADMIN] Could not open database '${dbId}', falling back to default:`, err?.message || err);
    _firestore = getFirestore(_app);
  }

  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    DEFAULT_PROJECT_ID
  ).trim();

  console.log(`[FIREBASE ADMIN] Singleton ready | Project: ${projectId} | DB: ${dbId || '(default)'} | Service Account: ${_hasServiceAccount}`);

  return { app: _app, db: _firestore };
}

/**
 * Returns the cached Firestore instance, initializing it if necessary.
 */
export function getAdminFirestore(): Firestore {
  if (!_firestore) {
    initFirebaseAdmin();
  }
  return _firestore!;
}

export function isFirebaseAdminWithServiceAccount(): boolean {
  return _hasServiceAccount;
}
