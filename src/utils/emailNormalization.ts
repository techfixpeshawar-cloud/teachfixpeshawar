/**
 * Canonical Customer Email Normalization Utility
 * 
 * Normalizes customer emails across all legacy and current field variants:
 * - email
 * - customerEmail
 * - emailAddress
 * - customer_email
 * - clientEmail
 * - contactEmail
 * - userEmail
 * 
 * Enforces valid format, excludes placeholder/dummy strings, and
 * prevents accidental fallback to administrator emails as customer email.
 */

export const KNOWN_ADMIN_EMAILS = [
  'techfixpeshawar@gmail.com'
];

/**
 * Validates whether a string is a structurally sound email address
 */
export function isValidEmailFormat(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(trimmed)) return false;
  
  const lower = trimmed.toLowerCase();
  const invalidPlaceholders = [
    'not provided',
    'no email',
    'none',
    'null',
    'undefined',
    'n/a',
    'na@',
    '@test.',
    '@example.'
  ];
  if (invalidPlaceholders.some(p => lower.includes(p))) return false;

  return true;
}

/**
 * Extracts and normalizes customer email from any supported record or payload.
 * Returns a trimmed valid email string, or an empty string '' if not provided.
 * Never invents an address or falls back to admin email as a default.
 */
export function extractCustomerEmail(record: any): string {
  if (!record || typeof record !== 'object') return '';

  const candidates = [
    record.email,
    record.customerEmail,
    record.emailAddress,
    record.customer_email,
    record.clientEmail,
    record.contactEmail,
    record.userEmail
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (isValidEmailFormat(trimmed)) {
        return trimmed;
      }
    }
  }

  return '';
}

/**
 * Resolves customer email across linked entities (request, serviceRequest, inquiry, customer profile)
 */
export function resolveCustomerEmail(
  primaryRecord: any,
  linkedSources?: {
    serviceRequest?: any;
    inquiry?: any;
    customer?: any;
    booking?: any;
  }
): { email: string; source: string } {
  // 1. Check primary record first
  const primaryEmail = extractCustomerEmail(primaryRecord);
  if (primaryEmail) {
    return { email: primaryEmail, source: 'primary' };
  }

  if (linkedSources) {
    // 2. Check linked serviceRequest or booking doc
    if (linkedSources.serviceRequest) {
      const srvEmail = extractCustomerEmail(linkedSources.serviceRequest);
      if (srvEmail) return { email: srvEmail, source: 'serviceRequests' };
    }
    if (linkedSources.booking) {
      const bookEmail = extractCustomerEmail(linkedSources.booking);
      if (bookEmail) return { email: bookEmail, source: 'bookings' };
    }

    // 3. Check linked inquiry
    if (linkedSources.inquiry) {
      const inqEmail = extractCustomerEmail(linkedSources.inquiry);
      if (inqEmail) return { email: inqEmail, source: 'inquiries' };
    }

    // 4. Check linked customer profile
    if (linkedSources.customer) {
      const custEmail = extractCustomerEmail(linkedSources.customer);
      if (custEmail) return { email: custEmail, source: 'customers' };
    }
  }

  return { email: '', source: 'none' };
}
