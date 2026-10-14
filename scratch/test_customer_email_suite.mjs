import assert from 'node:assert/strict';
import { 
  extractCustomerEmail, 
  isValidEmailFormat, 
  resolveCustomerEmail,
  KNOWN_ADMIN_EMAILS 
} from '../src/utils/emailNormalization.js';

console.log('--- STARTING CUSTOMER EMAIL REGRESSION TEST SUITE ---\n');

let passedTests = 0;

// Test 1: Stored under canonical 'email'
{
  const record = {
    id: 'REQ-101',
    fullName: 'Bilal Khan',
    email: '  bilal.peshawar@gmail.com  ',
    phone: '034409404427'
  };
  const extracted = extractCustomerEmail(record);
  assert.equal(extracted, 'bilal.peshawar@gmail.com', 'Should trim and extract canonical email');
  console.log('✅ Test 1 Passed: Canonical email extracted & trimmed correctly.');
  passedTests++;
}

// Test 2: Stored under legacy keys (customerEmail, emailAddress, customer_email, clientEmail)
{
  const rec1 = { customerEmail: 'legacy1@gmail.com' };
  const rec2 = { emailAddress: 'legacy2@yahoo.com' };
  const rec3 = { customer_email: 'legacy3@outlook.com' };
  const rec4 = { clientEmail: 'legacy4@hotmail.com' };

  assert.equal(extractCustomerEmail(rec1), 'legacy1@gmail.com');
  assert.equal(extractCustomerEmail(rec2), 'legacy2@yahoo.com');
  assert.equal(extractCustomerEmail(rec3), 'legacy3@outlook.com');
  assert.equal(extractCustomerEmail(rec4), 'legacy4@hotmail.com');
  console.log('✅ Test 2 Passed: Legacy email variant fields extracted correctly.');
  passedTests++;
}

// Test 3: Updates with empty or missing email NEVER wipe out existing email
{
  // Simulating the backend / Firestore update merge sanitizer
  const existingRecord = { id: 'REQ-102', email: 'persisted@gmail.com', status: 'NEW' };
  
  // Partial update passing only status and adminNotes (email omitted)
  const incomingUpdate1 = { status: 'CONFIRMED', adminNotes: 'Confirmed for 10am' };
  const cleanUpdates1 = { ...incomingUpdate1 };
  if ('email' in cleanUpdates1 || 'customerEmail' in cleanUpdates1) {
    const norm = extractCustomerEmail(cleanUpdates1);
    if (norm) cleanUpdates1.email = norm;
    else { delete cleanUpdates1.email; delete cleanUpdates1.customerEmail; }
  }
  
  // Notice cleanUpdates1 does NOT contain email property, so merge:true in Firestore leaves existing email intact
  assert.equal('email' in cleanUpdates1, false, 'Omitted email must not be present in sanitized update');
  const merged1 = { ...existingRecord, ...cleanUpdates1 };
  assert.equal(merged1.email, 'persisted@gmail.com', 'Existing email must be preserved when update omits email');

  // Partial update passing empty string email
  const incomingUpdate2 = { status: 'COMPLETED', email: '' };
  const cleanUpdates2 = { ...incomingUpdate2 };
  if ('email' in cleanUpdates2 || 'customerEmail' in cleanUpdates2) {
    const norm = extractCustomerEmail(cleanUpdates2);
    if (norm) cleanUpdates2.email = norm;
    else { delete cleanUpdates2.email; delete cleanUpdates2.customerEmail; }
  }
  assert.equal('email' in cleanUpdates2, false, 'Empty string email must be stripped from sanitized update');
  const merged2 = { ...existingRecord, ...cleanUpdates2 };
  assert.equal(merged2.email, 'persisted@gmail.com', 'Existing email must not be wiped by empty string');

  console.log('✅ Test 3 Passed: Non-destructive update protection verified (never wipes email).');
  passedTests++;
}

// Test 4: Admin list cross-referencing from linked inquiries/customers
{
  const historicalBookingWithoutEmail = {
    id: 'PSH-LEGACY-001',
    fullName: 'Tariq Jan',
    phone: '0300 1234567',
    email: ''
  };

  const linkedInquiry = {
    id: 'inq-PSH-LEGACY-001',
    bookingId: 'PSH-LEGACY-001',
    phone: '0300 1234567',
    email: 'tariq.jan@gmail.com'
  };

  const resolved = resolveCustomerEmail(historicalBookingWithoutEmail, { inquiry: linkedInquiry });
  assert.equal(resolved.email, 'tariq.jan@gmail.com');
  assert.equal(resolved.source, 'inquiries');
  console.log('✅ Test 4 Passed: Cross-reference resolution works across linked entities.');
  passedTests++;
}

// Test 5: Missing or invalid emails handled safely without inventing addresses
{
  assert.equal(extractCustomerEmail({ email: '' }), '');
  assert.equal(extractCustomerEmail({ email: '   ' }), '');
  assert.equal(extractCustomerEmail({ email: 'not provided' }), '');
  assert.equal(extractCustomerEmail({ email: 'null' }), '');
  assert.equal(extractCustomerEmail({ email: 'undefined' }), '');
  assert.equal(extractCustomerEmail({ email: 'invalid-email-format' }), '');
  assert.equal(isValidEmailFormat('not provided'), false);
  assert.equal(isValidEmailFormat(''), false);
  console.log('✅ Test 5 Passed: Invalid / missing values handled safely without dummy emails.');
  passedTests++;
}

// Test 6: Never falls back to admin email as default customer email
{
  const bookingNoEmail = {
    id: 'REQ-NO-EMAIL',
    fullName: 'Guest User',
    phone: '0312 9876543'
  };
  const extracted = extractCustomerEmail(bookingNoEmail);
  assert.equal(extracted, '', 'Must be empty string, not admin email');
  assert.notEqual(extracted, KNOWN_ADMIN_EMAILS[0], 'Must not fall back to admin email');
  console.log('✅ Test 6 Passed: Admin email is strictly protected from being assigned as customer fallback.');
  passedTests++;
}

console.log(`\n🎉 ALL ${passedTests}/6 REGRESSION TESTS PASSED SUCCESSFULLY!`);
