import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let _app: App | null = null;
let _firestore: Firestore | null = null;
let _auth: Auth | null = null;
let _hasServiceAccount = false;

export function initFirebaseAdmin(): { app: App; db: Firestore; auth: Auth } {
  if (_app && _firestore && _auth) {
    return { app: _app, db: _firestore, auth: _auth };
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    _app = existingApps[0];
  } else {
    // 1. Try FIREBASE_SERVICE_ACCOUNT_BASE64
    const base64Sa = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
    if (base64Sa) {
      try {
        const decoded = Buffer.from(base64Sa, 'base64').toString('utf-8');
        const sa = JSON.parse(decoded);
        _app = initializeApp({ credential: cert(sa) });
        _hasServiceAccount = true;
      } catch (err: any) {
        console.warn('[FIREBASE ADMIN] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', err?.message || err);
      }
    }

    // 2. Try individual FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + FIREBASE_PROJECT_ID
    if (!_app) {
      const projectId = (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        'gen-lang-client-0759593306'
      ).trim();
      const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
      let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();

      if (clientEmail && privateKey) {
        try {
          // Normalize line breaks in private key
          if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
          }
          privateKey = privateKey.replace(/\\n/g, '\n');

          _app = initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
          _hasServiceAccount = true;
        } catch (err: any) {
          console.warn('[FIREBASE ADMIN] Failed to initialize with cert credentials:', err?.message || err);
        }
      }
    }

    // 3. Fallback: Initialize with project ID (uses Application Default Credentials on GCP/Cloud Run or basic configuration)
    if (!_app) {
      const projectId = (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        'gen-lang-client-0759593306'
      ).trim();

      _app = initializeApp({ projectId });
    }
  }

  // Obtain Firestore instance (supports named database if configured)
  const dbId = (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    'ai-studio-peshawaronsitete-70e75457-6a23-4284-84ee-9bd0ef9c4555'
  ).trim();

  try {
    _firestore = dbId ? getFirestore(_app, dbId) : getFirestore(_app);
  } catch (err: any) {
    console.warn(`[FIREBASE ADMIN] Could not open named database '${dbId}', falling back to default:`, err?.message || err);
    _firestore = getFirestore(_app);
  }

  // Obtain Auth instance
  _auth = getAuth(_app);

  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0759593306').trim();
  console.log(`[FIREBASE ADMIN] Initialized. Project: ${projectId} | Named DB: ${dbId || '(default)'} | Service Account Auth: ${_hasServiceAccount}`);

  return { app: _app, db: _firestore, auth: _auth };
}

export function getAdminFirestore(): Firestore {
  if (!_firestore) {
    initFirebaseAdmin();
  }
  return _firestore!;
}

export function getAdminAuth(): Auth {
  if (!_auth) {
    initFirebaseAdmin();
  }
  return _auth!;
}

export function isFirebaseAdminWithServiceAccount(): boolean {
  return _hasServiceAccount;
}
