import 'dotenv/config';
import { initFirebaseAdmin, getAdminFirestore, isFirebaseAdminWithServiceAccount } from '../server/firebaseAdmin';
import { getFullEmailSettings, saveEmailSettings, getSafeEmailSettings } from '../server/email/emailService';

async function verify() {
  console.log('=== VERIFYING REAL CLOUD FIRESTORE PERSISTENCE ===');

  // 1. Check Admin SDK initialization
  initFirebaseAdmin();
  const hasSa = isFirebaseAdminWithServiceAccount();
  console.log('A. Firebase Admin Service Account Authenticated:', hasSa ? 'PASS' : 'FAIL');
  if (!hasSa) {
    console.error('BLOCKER: Firebase Admin did not authenticate with Service Account');
    process.exit(1);
  }

  const db = getAdminFirestore();

  // 2. Direct read from settings/email
  console.log('\n--- Testing Read settings/email ---');
  const docRef = db.collection('settings').doc('email');
  const snapBefore = await docRef.get();
  console.log('B. Document exists before write:', snapBefore.exists);
  if (snapBefore.exists) {
    const d = snapBefore.data() || {};
    console.log('   Provider:', d.provider);
    console.log('   Admin email:', d.adminEmail);
    console.log('   Has Resend Key:', !!d.resendApiKey);
    console.log('   Has SMTP Password:', !!d.smtpPassword);
  }

  // 3. Write via saveEmailSettings
  console.log('\n--- Testing Write settings/email ---');
  const safeResult = await saveEmailSettings({
    provider: 'auto',
    senderEmail: 'TechFix Support <onboarding@resend.dev>',
    adminEmail: 'techfixpeshawar@gmail.com',
    resendApiKey: process.env.RESEND_API_KEY,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpUser: 'techfixpeshawar@gmail.com'
  });

  console.log('C. Safe settings after write:');
  console.log('   Provider:', safeResult.provider);
  console.log('   Admin Email:', safeResult.adminEmail);
  console.log('   Resend Key Configured:', safeResult.resendApiKeyConfigured);
  console.log('   Gmail App Password Configured:', safeResult.gmailAppPasswordConfigured);
  console.log('   SMTP Password Configured:', safeResult.smtpPasswordConfigured);

  // 4. Read back directly from Cloud Firestore to guarantee persistence
  console.log('\n--- Direct Firestore Read-Back Verification ---');
  const snapAfter = await docRef.get();
  if (!snapAfter.exists) {
    console.error('FAIL: Document settings/email does not exist after write');
    process.exit(1);
  }
  const savedData = snapAfter.data() || {};
  const hasSavedResend = !!(savedData.resendApiKey && savedData.resendApiKey.startsWith('re_'));
  const hasSavedSmtp = !!(savedData.smtpPassword && savedData.smtpPassword.length === 16);
  const correctAdmin = savedData.adminEmail === 'techfixpeshawar@gmail.com';

  console.log('D. settings/email Firestore read-back:');
  console.log('   Exists in Firestore:', snapAfter.exists ? 'PASS' : 'FAIL');
  console.log('   Resend API Key Stored in Firestore:', hasSavedResend ? 'PASS' : 'FAIL');
  console.log('   SMTP Password Stored in Firestore:', hasSavedSmtp ? 'PASS' : 'FAIL');
  console.log('   Admin Email Stored in Firestore:', correctAdmin ? 'PASS' : 'FAIL');
  console.log('   Updated At Timestamp:', savedData.updatedAt || 'NONE');

  // 5. Test secret preservation when blank fields submitted
  console.log('\n--- Testing Secret Preservation on Blank Fields ---');
  const preservedResult = await saveEmailSettings({
    // Leave keys blank
    provider: 'auto',
    adminEmail: 'techfixpeshawar@gmail.com'
  });
  const snapPreserved = await docRef.get();
  const preservedData = snapPreserved.data() || {};
  const stillHasResend = !!(preservedData.resendApiKey && preservedData.resendApiKey.startsWith('re_'));
  const stillHasSmtp = !!(preservedData.smtpPassword && preservedData.smtpPassword.length === 16);

  console.log('E. Secret preservation:');
  console.log('   Resend Key Preserved:', stillHasResend ? 'PASS' : 'FAIL');
  console.log('   SMTP Password Preserved:', stillHasSmtp ? 'PASS' : 'FAIL');

  // 6. Test booking persistence in Firestore
  console.log('\n--- Testing Booking Cloud Firestore Persistence ---');
  const testBookingId = `PSH-VERIFY-${Date.now().toString(36).toUpperCase()}`;
  const testBookingRef = db.collection('bookings').doc(testBookingId);
  await testBookingRef.set({
    id: testBookingId,
    fullName: 'Live Cloud Firestore Verification',
    phone: '03001234567',
    serviceRequired: 'Hardware Diagnostics',
    area: 'Hayatabad',
    status: 'NEW',
    createdAt: new Date().toISOString()
  });

  const bookingSnap = await testBookingRef.get();
  console.log('F. Booking persistence in Cloud Firestore:', bookingSnap.exists ? 'PASS' : 'FAIL');

  // Clean up test booking
  await testBookingRef.delete();
  console.log('   Test booking cleaned up: PASS');

  if (hasSa && snapAfter.exists && hasSavedResend && hasSavedSmtp && correctAdmin && stillHasResend && stillHasSmtp && bookingSnap.exists) {
    console.log('\n======================================================');
    console.log('ALL CLOUD FIRESTORE PERSISTENCE TESTS PASSED 100%!');
    console.log('======================================================');
    process.exit(0);
  } else {
    console.error('\nONE OR MORE CHECKS FAILED');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('FATAL EXCEPTION:', err);
  process.exit(1);
});
