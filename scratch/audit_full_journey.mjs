import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import assert from 'node:assert/strict';
import { getAdminFirestore } from '../server/firebaseAdmin.ts';
import { extractCustomerEmail } from '../src/utils/emailNormalization.ts';

console.log('================================================================');
console.log(' FULL REAL-WORLD WEBSITE & FIREBASE INTEGRITY AUDIT TEST SUITE ');
console.log('================================================================\n');

const BASE_URL = process.env.TEST_BASE_URL || 'https://teachfixpeshawar.vercel.app';
console.log(`Auditing target: ${BASE_URL}\n`);

async function runAudit() {
  const auditReport = [];

  function record(section, name, status, evidence, error = null) {
    auditReport.push({ section, name, status, evidence, error });
    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${symbol} [${section}] ${name}: ${evidence}`);
    if (error) console.error('   Error details:', error);
  }

  // -------------------------------------------------------------
  // STEP 0: Admin Authentication via API
  // -------------------------------------------------------------
  let adminToken = null;
  const adminCandidates = [process.env.ADMIN_PASSWORD, process.env.ADMIN_SECRET, 'safi2025'].filter(Boolean);
  for (const pwd of adminCandidates) {
    try {
      const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const loginData = await loginRes.json();
      if (loginRes.ok && loginData.token) {
        adminToken = loginData.token;
        break;
      }
    } catch (e) {}
  }

  if (adminToken) {
    record('Authentication', 'Admin Login', 'PASS', `Successfully authenticated via /api/admin/login. Token: ${adminToken.slice(0, 25)}...`);
  } else {
    record('Authentication', 'Admin Login', 'FAIL', 'Could not obtain admin token from /api/admin/login');
  }

  // -------------------------------------------------------------
  // STEP 1: Audit Public Endpoints & Asset Availability
  // -------------------------------------------------------------
  console.log('\n--- PHASE 2: AUDITING PUBLIC ENDPOINTS & ASSETS ---');
  
  // 1.1 /api/data
  try {
    const res = await fetch(`${BASE_URL}/api/data`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(data.services) && data.services.length > 0);
    record('Public Assets', 'GET /api/data', 'PASS', `HTTP 200, returned ${data.services.length} services, ${data.faqs?.length || 0} FAQs.`);
  } catch (err) {
    record('Public Assets', 'GET /api/data', 'FAIL', 'Failed to fetch /api/data', err.message);
  }

  // 1.2 Technician portraits
  try {
    const res1 = await fetch(`${BASE_URL}/uploads/technician-portrait-1789213477063.jpg`);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('content-type'), 'image/jpeg');
    record('Public Assets', 'Technician Portrait 1', 'PASS', 'HTTP 200 image/jpeg for 1789213477063');

    const res2 = await fetch(`${BASE_URL}/uploads/technician-portrait-1791302429231.jpg`);
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('content-type'), 'image/jpeg');
    record('Public Assets', 'Technician Portrait 2', 'PASS', 'HTTP 200 image/jpeg for 1791302429231');
  } catch (err) {
    record('Public Assets', 'Technician Portraits', 'FAIL', 'Portrait request failed', err.message);
  }

  // -------------------------------------------------------------
  // STEP 2: Input Validation Testing
  // -------------------------------------------------------------
  console.log('\n--- PHASE 3: INPUT VALIDATION TESTING ---');

  // 2.1 Missing Name
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '034409404427', problemDescription: 'Test computer problem', email: 'valid@example.com' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error.includes('Name'), `Expected name error, got: ${data.error}`);
    record('Validation', 'Missing Customer Name', 'PASS', `Rejected with HTTP 400: "${data.error}"`);
  } catch (err) {
    record('Validation', 'Missing Customer Name', 'FAIL', 'Validation did not reject correctly', err.message);
  }

  // 2.2 Invalid Pakistani Phone
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Test User', phone: '12345', problemDescription: 'Test computer problem', email: 'valid@example.com' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error.toLowerCase().includes('phone') || data.error.includes('03'), `Expected phone error, got: ${data.error}`);
    record('Validation', 'Invalid Phone Format', 'PASS', `Rejected with HTTP 400: "${data.error}"`);
  } catch (err) {
    record('Validation', 'Invalid Phone Format', 'FAIL', 'Validation did not reject correctly', err.message);
  }

  // 2.3 Short / Blank Problem Description
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Test User', phone: '034409404427', problemDescription: 'a', email: 'valid@example.com' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error.toLowerCase().includes('problem') || data.error.toLowerCase().includes('describe'), `Expected description error, got: ${data.error}`);
    record('Validation', 'Short Problem Description', 'PASS', `Rejected with HTTP 400: "${data.error}"`);
  } catch (err) {
    record('Validation', 'Short Problem Description', 'FAIL', 'Validation did not reject correctly', err.message);
  }

  // 2.4 Missing / Invalid Customer Email
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Test User', phone: '034409404427', problemDescription: 'Valid computer problem description', email: 'invalid-email-address' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error.toLowerCase().includes('email'), `Expected email error, got: ${data.error}`);
    record('Validation', 'Invalid Customer Email', 'PASS', `Rejected with HTTP 400: "${data.error}"`);
  } catch (err) {
    record('Validation', 'Invalid Customer Email', 'FAIL', 'Validation did not reject correctly', err.message);
  }

  // -------------------------------------------------------------
  // STEP 3: Complete Customer Inquiry & Booking Workflow
  // -------------------------------------------------------------
  console.log('\n--- PHASE 3 & 4: LIVE WORKFLOW & FIRESTORE INTEGRITY ---');

  const testUniqueId = `TEST-AUDIT-${Date.now()}`;
  const testPayload = {
    id: testUniqueId,
    fullName: 'TEST-AUDIT Verification Client',
    email: 'techfix.test.audit@gmail.com',
    phone: '034409404427',
    whatsapp: '034409404427',
    area: 'Hayatabad Phase 3',
    deviceType: 'Laptop',
    computerBrandModel: 'Dell Latitude 7490 Test Rig',
    serviceRequired: 'Windows Startup & Boot Repair',
    problemDescription: 'Automated full-project audit verifying real-time Firestore persistence and data integrity.',
    urgency: 'Urgent',
    containsImportantData: 'YES',
    preferredDate: '2026-10-15',
    preferredTime: 'Morning (10:00 AM – 1:00 PM)'
  };

  let createdBookingId = null;

  // 3.1 Submit Booking
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const data = await res.json();
    assert.equal(res.status, 201);
    assert.ok(data.booking);
    assert.equal(data.booking.id, testUniqueId);
    createdBookingId = data.booking.id;
    record('Workflow', 'Submit Service Request', 'PASS', `HTTP 201 Created. Tracking ID: ${createdBookingId}`);
  } catch (err) {
    record('Workflow', 'Submit Service Request', 'FAIL', 'Submission failed', err.message);
  }

  // 3.2 Verify Direct Firestore Persistence
  const fsDb = getAdminFirestore();
  if (createdBookingId && fsDb) {
    try {
      const docSnap = await fsDb.collection('requests').doc(createdBookingId).get();
      assert.ok(docSnap.exists, 'Document must exist in Firestore/requests');
      const docData = docSnap.data();

      // Verify every field was persisted
      assert.equal(docData.fullName, testPayload.fullName);
      assert.equal(docData.email, testPayload.email);
      assert.equal(docData.phone, '+9234409404427'); // Normalized Pakistani format
      assert.equal(docData.area, testPayload.area);
      assert.equal(docData.deviceType, testPayload.deviceType);
      assert.equal(docData.computerBrandModel, testPayload.computerBrandModel);
      assert.equal(docData.serviceRequired, testPayload.serviceRequired);
      assert.equal(docData.urgency, 'Urgent');
      assert.equal(docData.containsImportantData, 'YES');
      assert.equal(docData.status, 'NEW');

      record('Firestore Integrity', 'Read-back from Firestore/requests', 'PASS', 
        `All 10 fields match exactly. Normalized Email: "${docData.email}", Phone: "${docData.phone}"`
      );
    } catch (err) {
      record('Firestore Integrity', 'Read-back from Firestore/requests', 'FAIL', 'Field mismatch or read failure', err.message);
    }
  }

  // 3.3 Test Idempotency / Duplicate Prevention
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.isDuplicate, true);
    record('Workflow', 'Duplicate Submission Guard', 'PASS', 'Correctly detected rapid duplicate submission and returned isDuplicate: true.');
  } catch (err) {
    record('Workflow', 'Duplicate Submission Guard', 'FAIL', 'Duplicate guard failed', err.message);
  }

  // -------------------------------------------------------------
  // STEP 4: Admin Panel Data & Operations
  // -------------------------------------------------------------
  console.log('\n--- PHASE 6: AUDITING ADMIN DATA & LIFECYCLE ACTIONS ---');

  if (adminToken) {
    // 4.1 Fetch Admin Data
    try {
      const res = await fetch(`${BASE_URL}/api/admin/data`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.bookings));
      
      const found = data.bookings.find(b => b.id === createdBookingId);
      assert.ok(found, 'Created booking must be present in admin bookings list');
      assert.equal(found.email, testPayload.email, 'Admin booking must have normalized customer email');
      record('Admin Panel', 'GET /api/admin/data', 'PASS', `Booking found in admin feed with email: ${found.email}`);
    } catch (err) {
      record('Admin Panel', 'GET /api/admin/data', 'FAIL', 'Admin data fetch or verification failed', err.message);
    }

    // 4.2 Update Booking Details (Status & Notes)
    try {
      const res = await fetch(`${BASE_URL}/api/admin/bookings/${createdBookingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          status: 'CONTACTED',
          adminNotes: 'Auditor checked customer requirements.'
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.booking.status, 'CONTACTED');
      assert.equal(data.booking.email, testPayload.email, 'Email must NOT be wiped by partial status update');

      // Confirm in Firestore directly
      const verifySnap = await fsDb.collection('requests').doc(createdBookingId).get();
      const verifyData = verifySnap.data();
      assert.equal(verifyData.status, 'CONTACTED');
      assert.equal(verifyData.email, testPayload.email, 'Firestore email must stay intact');
      record('Admin Panel', 'PUT /api/admin/bookings/:id', 'PASS', 'Status updated to CONTACTED without wiping customer email.');
    } catch (err) {
      record('Admin Panel', 'PUT /api/admin/bookings/:id', 'FAIL', 'Update failed or wiped email', err.message);
    }

    // 4.3 Confirm Appointment (Channel: WhatsApp / Schedule Slot)
    try {
      const scheduledSlot = '2026-10-15 (Morning 10:00 AM)';
      const res = await fetch(`${BASE_URL}/api/admin/bookings/${createdBookingId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          scheduledTime: scheduledSlot,
          sendEmail: false
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.booking.status, 'CONFIRMED');
      assert.equal(data.booking.scheduledTime, scheduledSlot);
      assert.equal(data.booking.email, testPayload.email, 'Email must remain intact after confirmation');

      record('Admin Panel', 'POST /api/admin/bookings/:id/confirm', 'PASS', `Appointment confirmed with slot: "${scheduledSlot}".`);
    } catch (err) {
      record('Admin Panel', 'POST /api/admin/bookings/:id/confirm', 'FAIL', 'Confirmation failed', err.message);
    }
  } else {
    record('Admin Panel', 'Admin Operations', 'FAIL', 'Skipped due to missing admin token');
  }

  // -------------------------------------------------------------
  // STEP 5: Clean up Test Record
  // -------------------------------------------------------------
  if (createdBookingId && fsDb) {
    try {
      await Promise.all([
        fsDb.collection('requests').doc(createdBookingId).delete(),
        fsDb.collection('serviceRequests').doc(createdBookingId).delete(),
        fsDb.collection('bookings').doc(createdBookingId).delete(),
        fsDb.collection('inquiries').doc(`inq-${createdBookingId}`).delete().catch(() => {}),
        fsDb.collection('inquiries').doc(`INQ-${createdBookingId.replace(/^(PSH-|REQ-)/, '')}`).delete().catch(() => {})
      ]);
      record('Cleanup', 'Purge Test Record from Firestore', 'PASS', `Cleaned test document ${createdBookingId} from all collections.`);
    } catch (err) {
      record('Cleanup', 'Purge Test Record from Firestore', 'WARN', 'Cleanup failed', err.message);
    }
  }

  console.log('\n================================================================');
  console.log(' AUDIT SUMMARY');
  console.log('================================================================');
  const passes = auditReport.filter(r => r.status === 'PASS').length;
  const fails = auditReport.filter(r => r.status === 'FAIL').length;
  const warns = auditReport.filter(r => r.status === 'WARN').length;
  console.log(`Total Checks: ${auditReport.length} | Passed: ${passes} | Failed: ${fails} | Warnings: ${warns}`);

  return { passes, fails, warns, report: auditReport };
}

runAudit().then(res => {
  if (res.fails > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
