process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION AT:', reason?.stack || reason);
});

import app from '../server.js';
import http from 'http';

let server: http.Server;
const BASE_URL = 'http://localhost:5199';

async function runTests() {
  console.log('🚀 Starting TechFix Production Integration Test Suite...\n');

  server = app.listen(5199);
  await new Promise(resolve => setTimeout(resolve, 800));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Admin Authentication with Password
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Admin Authentication & Security ---');
    const wrongAuthRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' })
    });
    assert(wrongAuthRes.status === 401, 'Invalid password is rejected with HTTP 401');

    const adminPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || '';
    const authRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });
    assert(authRes.status === 200, 'Admin login with password succeeds (HTTP 200)');
    const authData = await authRes.json();
    assert(typeof authData.token === 'string' && authData.token.startsWith('techfix_sess_'), 'Cryptographic session token issued');
    const token = authData.token;

    // -------------------------------------------------------------
    // Test 2: Save Email Credentials & Verification of Secret Hygiene
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Admin Settings & Secret Hygiene ---');
    const saveSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        settings: {
          emailProvider: 'auto',
          resendApiKey: 're_mock_test_key_abc123456789012345678',
          resendFromEmail: 'TechFix Support <onboarding@resend.dev>',
          resendTargetEmail: 'techfixpeshawar@gmail.com',
          gmailUser: 'techfixpeshawar@gmail.com',
          gmailAppPassword: 'abcd efgh ijkl mnop'
        }
      })
    });
    assert(saveSettingsRes.status === 200, 'Saving email settings returns HTTP 200');
    const savedData = await saveSettingsRes.json();
    assert(savedData.success === true, 'Response reports success: true');
    assert(savedData.settings.resendApiKeyConfigured === true, 'resendApiKeyConfigured is true');
    assert(savedData.settings.gmailAppPasswordConfigured === true, 'gmailAppPasswordConfigured is true');
    assert(savedData.settings.resendApiKey === undefined, 'Raw Resend API key is NEVER leaked in response');
    assert(savedData.settings.gmailAppPassword === undefined, 'Raw Gmail password is NEVER leaked in response');

    // -------------------------------------------------------------
    // Test 3: Fetch Admin Settings (GET /api/admin/settings)
    // -------------------------------------------------------------
    const getSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(getSettingsRes.status === 200, 'GET /api/admin/settings returns HTTP 200');
    const retrievedSettings = await getSettingsRes.json();
    assert(retrievedSettings.settings.resendApiKeyConfigured === true, 'Settings persist: resendApiKeyConfigured is true');
    assert(retrievedSettings.settings.gmailAppPasswordConfigured === true, 'Settings persist: gmailAppPasswordConfigured is true');
    assert(retrievedSettings.settings.resendApiKey === undefined, 'GET endpoint does NOT leak Resend key to browser');
    assert(retrievedSettings.settings.gmailAppPassword === undefined, 'GET endpoint does NOT leak Gmail password to browser');

    // -------------------------------------------------------------
    // Test 4: Preserve Saved Credentials When Form Submits Empty String
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Secret Preservation on Blank Input ---');
    const blankMergeRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        settings: {
          emailProvider: 'auto',
          resendApiKey: '', // User did not re-type key
          gmailAppPassword: '', // User did not re-type password
          businessHours: '9:00 AM – 9:00 PM (Daily)'
        }
      })
    });
    assert(blankMergeRes.status === 200, 'Saving settings with blank credential fields returns HTTP 200');
    const blankMergeData = await blankMergeRes.json();
    assert(blankMergeData.settings.resendApiKeyConfigured === true, 'Previously saved Resend key was PRESERVED');
    assert(blankMergeData.settings.gmailAppPasswordConfigured === true, 'Previously saved Gmail password was PRESERVED');

    // -------------------------------------------------------------
    // Test 5: Customer Booking & Duplicate Suppression
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Customer Bookings & De-duplication ---');
    const testPhone = `0300${Math.floor(1000000 + Math.random() * 9000000)}`;
    const testEmail = `customer.test.${Date.now()}@example.com`;
    const bookingRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Dr. Tariq Khan',
        phone: testPhone,
        email: testEmail,
        area: 'University Town',
        deviceType: 'Laptop',
        computerBrandModel: 'Dell XPS 15',
        serviceRequired: 'Hardware Diagnostics & Repair',
        problemDescription: 'Laptop screen flickering and overheating rapidly.',
        preferredDate: 'Tomorrow',
        preferredTime: 'Morning (10 AM - 1 PM)',
        urgency: 'Normal'
      })
    });
    assert(bookingRes.status === 201, 'Booking submission returns HTTP 201');
    const bookingData = await bookingRes.json();
    assert(bookingData.success === true, 'Booking created successfully');
    assert(bookingData.booking && typeof bookingData.booking.id === 'string', 'Booking Reference ID generated');
    const createdBookingId = bookingData.booking.id;

    // Duplicate check: Same contact immediately submitted
    const duplicateRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Dr. Tariq Khan',
        phone: testPhone,
        email: testEmail,
        area: 'University Town',
        serviceRequired: 'Hardware Diagnostics & Repair',
        problemDescription: 'Duplicate test request'
      })
    });
    assert(duplicateRes.status === 409, 'Duplicate submission within 10 mins rejected with HTTP 409');
    const duplicateData = await duplicateRes.json();
    assert(duplicateData.duplicate === true, 'Response indicates duplicate request');

    // -------------------------------------------------------------
    // Test 6: Admin Booking Confirmation & Customer Email Dispatch
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Admin Booking Confirmation ---');
    const confirmRes = await fetch(`${BASE_URL}/api/admin/bookings/${encodeURIComponent(createdBookingId)}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        scheduledTime: 'Tomorrow at 11:30 AM',
        sendEmail: true
      })
    });
    assert(confirmRes.status === 200, 'Confirm booking returns HTTP 200');
    const confirmData = await confirmRes.json();
    assert(confirmData.success === true, 'Confirmation marked success: true');
    assert(confirmData.booking.status === 'CONFIRMED', 'Booking status transitioned to CONFIRMED');
    assert(confirmData.emailDelivery !== undefined, 'Email delivery attempt tracked and reported');

    // -------------------------------------------------------------
    // Test 7: GET /api/admin/data Collections & Sanitization
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Full Admin Data Overlay ---');
    const adminDataRes = await fetch(`${BASE_URL}/api/admin/data`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(adminDataRes.status === 200, 'GET /api/admin/data returns HTTP 200');
    const adminData = await adminDataRes.json();
    assert(Array.isArray(adminData.bookings), 'adminData.bookings is an array');
    const hasCreatedBooking = adminData.bookings.some((b: any) => b.id === createdBookingId);
    assert(hasCreatedBooking, 'Created booking exists in admin dashboard bookings list');
    assert(adminData.settings.resendApiKey === undefined, 'adminData.settings has NO raw Resend key');
    assert(adminData.settings.gmailAppPassword === undefined, 'adminData.settings has NO raw Gmail password');

    // -------------------------------------------------------------
    // Test 8: Booking Deletion
    // -------------------------------------------------------------
    console.log('\n--- Test Group 7: Booking Deletion ---');
    const deleteRes = await fetch(`${BASE_URL}/api/admin/bookings/${encodeURIComponent(createdBookingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(deleteRes.status === 200, 'Booking deletion returns HTTP 200');

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} PASSED | ${failed} FAILED`);
    console.log(`========================================\n`);

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
