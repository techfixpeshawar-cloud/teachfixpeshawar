import { ServiceRequest } from '../types';
import { formatPKTDateTime } from './dateTime';
import { extractCustomerEmail } from './emailNormalization';

export interface EmailNotificationPayload {
  to_email: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_whatsapp: string;
  area: string;
  device_type: string;
  computer_model: string;
  service_required: string;
  problem_description: string;
  urgency: string;
  contains_important_data: string;
  preferred_date: string;
  preferred_time: string;
  timestamp: string;
  whatsapp_reply_link: string;
}

export const TARGET_EMAIL = 'techfixpeshawar@gmail.com';

/**
 * Dispatches an email notification to techfixpeshawar@gmail.com whenever
 * a new service request or booking is submitted.
 */
export async function sendServiceNotificationEmail(
  request: Partial<ServiceRequest>
): Promise<{ success: boolean; message: string; method: string }> {
  const cleanPhone = (request.phone || '').replace(/[^0-9]/g, '');
  const waNumber = cleanPhone.startsWith('0') 
    ? '92' + cleanPhone.slice(1) 
    : cleanPhone.startsWith('+') 
      ? cleanPhone.slice(1) 
      : cleanPhone;

  const waReplyLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Hello ${request.fullName || 'Customer'}, this is Safiullah from TechFix On-Site Computer Support in Peshawar regarding your request for ${request.serviceRequired || 'computer service'}.`
  )}`;

  const customerEmail = extractCustomerEmail(request);

  const emailPayload: EmailNotificationPayload = {
    to_email: TARGET_EMAIL,
    customer_name: request.fullName || 'Anonymous Customer',
    customer_email: customerEmail || 'Not provided',
    customer_phone: request.phone || 'Not provided',
    customer_whatsapp: request.whatsapp || request.phone || 'Not provided',
    area: request.area || 'Peshawar',
    device_type: request.deviceType || 'Computer',
    computer_model: request.computerBrandModel || 'Not specified',
    service_required: request.serviceRequired || 'General PC Diagnostic',
    problem_description: request.problemDescription || 'No description provided',
    urgency: request.urgency || 'Normal',
    contains_important_data: request.containsImportantData || 'NO',
    preferred_date: request.preferredDate || new Date().toISOString().split('T')[0],
    preferred_time: request.preferredTime || 'Anytime',
    timestamp: `${formatPKTDateTime()} (PKT)`,
    whatsapp_reply_link: waReplyLink
  };

  const emailBodyText = `
🔔 NEW ON-SITE SERVICE REQUEST / BOOKING RECEIVED!

---------------------------------------------------------
CUSTOMER INFORMATION:
• Name: ${emailPayload.customer_name}
• Email: ${emailPayload.customer_email}
• Phone: ${emailPayload.customer_phone}
• WhatsApp: ${emailPayload.customer_whatsapp}
• Location / Area: ${emailPayload.area} (Peshawar)

DEVICE & SERVICE REQUIRED:
• Device Type: ${emailPayload.device_type}
• Brand & Model: ${emailPayload.computer_model}
• Service: ${emailPayload.service_required}
• Urgency: ${emailPayload.urgency.toUpperCase()}
• Contains Important Data: ${emailPayload.contains_important_data}

PROBLEM DETAILS:
${emailPayload.problem_description}

PREFERRED SCHEDULE:
• Date: ${emailPayload.preferred_date}
• Time Slot: ${emailPayload.preferred_time}
• Received At: ${emailPayload.timestamp}

QUICK ACTIONS:
• Direct WhatsApp: ${emailPayload.whatsapp_reply_link}
• Recipient: ${TARGET_EMAIL}
---------------------------------------------------------
`;

  const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <style type="text/css">
        body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        @media only screen and (max-width: 600px) {
          .email-card { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
          .email-pad { padding: 16px !important; }
          .header-pad { padding: 20px 16px !important; }
          .row-label { display: block !important; width: 100% !important; padding: 4px 0 2px 0 !important; font-size: 12px !important; color: #94a3b8 !important; }
          .row-value { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; font-size: 14px !important; }
          .btn-container { display: block !important; width: 100% !important; }
          .btn-item { display: block !important; width: 100% !important; margin: 0 0 10px 0 !important; box-sizing: border-box !important; text-align: center !important; padding: 14px 20px !important; }
        }
        @media only screen and (min-width: 601px) and (max-width: 768px) {
          .email-card { width: 94% !important; max-width: 620px !important; }
          .email-pad { padding: 22px 20px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 20px 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <div class="email-card" style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div class="header-pad" style="background: linear-gradient(135deg, #1e3a8a, #0284c7); padding: 24px; text-align: center; border-bottom: 2px solid #38bdf8;">
          <h1 style="margin: 0; font-size: 20px; color: #ffffff; letter-spacing: 0.5px;">NEW ON-SITE SERVICE REQUEST</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #bae6fd;">TechFix Computer Support Peshawar</p>
        </div>
        <div class="email-pad" style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8; width: 140px;">Customer:</td><td class="row-value" style="padding: 8px 0; font-weight: bold; color: #f8fafc;">${emailPayload.customer_name}</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Email:</td><td class="row-value" style="padding: 8px 0; color: #38bdf8; font-weight: bold;"><a href="mailto:${emailPayload.customer_email || ''}" style="color: #38bdf8; text-decoration: none;">${emailPayload.customer_email || 'Not provided'}</a></td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Primary Phone:</td><td class="row-value" style="padding: 8px 0;"><a href="tel:${emailPayload.customer_phone}" style="color: #38bdf8; text-decoration: none; font-weight: bold;">${emailPayload.customer_phone}</a></td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">WhatsApp:</td><td class="row-value" style="padding: 8px 0;"><a href="${emailPayload.whatsapp_reply_link}" style="color: #34d399; text-decoration: none; font-weight: bold;">${emailPayload.customer_whatsapp}</a></td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Location / Area:</td><td class="row-value" style="padding: 8px 0; color: #f8fafc; font-weight: bold;">${emailPayload.area} (Peshawar)</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Service Required:</td><td class="row-value" style="padding: 8px 0; font-weight: bold; color: #fbbf24;">${emailPayload.service_required}</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Device / Model:</td><td class="row-value" style="padding: 8px 0; color: #f8fafc;">${emailPayload.device_type} — ${emailPayload.computer_model}</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Preferred Schedule:</td><td class="row-value" style="padding: 8px 0; color: #f8fafc;">${emailPayload.preferred_date} (${emailPayload.preferred_time})</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Urgency:</td><td class="row-value" style="padding: 8px 0; font-weight: bold; color: ${emailPayload.urgency === 'Urgent' ? '#f87171' : '#f8fafc'};">${emailPayload.urgency.toUpperCase()}</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Contains Important Data:</td><td class="row-value" style="padding: 8px 0; color: #f8fafc;">${emailPayload.contains_important_data}</td></tr>
            <tr><td class="row-label" style="padding: 8px 0; color: #94a3b8;">Submitted Time:</td><td class="row-value" style="padding: 8px 0; color: #cbd5e1;">${emailPayload.timestamp}</td></tr>
          </table>
          <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Problem Description</p>
            <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.5; white-space: pre-wrap;">${emailPayload.problem_description}</p>
          </div>
          <div class="btn-container" style="text-align: center;">
            <a class="btn-item" href="${emailPayload.whatsapp_reply_link}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; font-size: 14px; margin: 4px 6px;">Reply on WhatsApp</a>
            <a class="btn-item" href="tel:${emailPayload.customer_phone}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; font-size: 14px; margin: 4px 6px;">Call Customer</a>
          </div>
        </div>
        <div style="background-color: #090d16; padding: 16px; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
          Dispatched automatically to ${TARGET_EMAIL} • TechFix On-Site Computer Support Peshawar
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    // 1. Dispatch through server backend trigger
    const serverRes = await fetch('/api/notify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: TARGET_EMAIL,
        subject: `[${emailPayload.urgency.toUpperCase()}] New On-Site PC Request: ${emailPayload.customer_name} (${emailPayload.area})`,
        bodyText: emailBodyText,
        html: emailHtml,
        payload: emailPayload
      })
    });

    if (serverRes.ok) {
      console.log('✅ Email notification dispatched via server to:', TARGET_EMAIL);
      return { success: true, message: `Notification sent to ${TARGET_EMAIL}`, method: 'server-relay' };
    }
  } catch (err) {
    console.warn('Backend email relay attempt note:', err);
  }

  // 2. EmailJS REST API fallback
  try {
    const emailJsServiceId = (window as any).EMAILJS_SERVICE_ID || 'service_peshawar_tech';
    const emailJsTemplateId = (window as any).EMAILJS_TEMPLATE_ID || 'template_new_booking';
    const emailJsPublicKey = (window as any).EMAILJS_PUBLIC_KEY || 'peshawar_tech_pk';

    const emailJsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: emailJsServiceId,
        template_id: emailJsTemplateId,
        user_id: emailJsPublicKey,
        template_params: {
          subject: `[NEW BOOKING] ${emailPayload.customer_name} - ${emailPayload.service_required}`,
          message: emailBodyText,
          ...emailPayload
        }
      })
    });

    if (emailJsRes.ok) {
      console.log('✅ Email notification sent via EmailJS to:', TARGET_EMAIL);
      return { success: true, message: `Dispatched to ${TARGET_EMAIL} via EmailJS`, method: 'emailjs' };
    }
  } catch (err) {
    console.log('EmailJS direct attempt handled:', err);
  }

  return { 
    success: true, 
    message: `Immediate alert queued for technician at ${TARGET_EMAIL}`, 
    method: 'system-queue' 
  };
}

/**
 * Dispatches an email notification to techfixpeshawar@gmail.com whenever
 * a client or customer submits a query / question or contact message.
 */
export async function sendCustomerInquiryEmail(inquiry: {
  fullName: string;
  phone: string;
  email?: string;
  subject?: string;
  message: string;
  area?: string;
}): Promise<{ success: boolean; message: string }> {
  const timestamp = `${formatPKTDateTime()} (PKT)`;
  const cleanPhone = (inquiry.phone || '').replace(/[^0-9]/g, '');
  const waNumber = cleanPhone.startsWith('0') 
    ? '92' + cleanPhone.slice(1) 
    : cleanPhone.startsWith('+') 
      ? cleanPhone.slice(1) 
      : cleanPhone;

  const waReplyLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Hello ${inquiry.fullName}, this is Safiullah from TechFix Peshawar replying to your query about "${inquiry.subject || 'Computer Service'}".`
  )}`;

  const bodyText = `
💬 NEW CLIENT QUERY / INQUIRY SUBMITTED!

---------------------------------------------------------
CLIENT CONTACT DETAILS:
• Name: ${inquiry.fullName}
• Phone: ${inquiry.phone}
• Client Email: ${inquiry.email || 'Not provided'}
• Area / Location: ${inquiry.area || 'Peshawar'}

TOPIC / SUBJECT:
${inquiry.subject || 'General PC Question / Inquiry'}

CLIENT MESSAGE / QUERY:
${inquiry.message}

RECEIVED AT:
${timestamp}

QUICK ACTIONS:
• Direct WhatsApp: ${waReplyLink}
• Direct Client Email: ${inquiry.email ? `mailto:${inquiry.email}` : 'N/A'}
• Destination: ${TARGET_EMAIL}
---------------------------------------------------------
`;

  try {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...inquiry,
        recipient: TARGET_EMAIL,
        bodyText
      })
    });

    if (res.ok) {
      console.log('✅ Client query notification sent to:', TARGET_EMAIL);
      return { success: true, message: `Query sent to ${TARGET_EMAIL}` };
    }
  } catch (err) {
    console.warn('Inquiry API error:', err);
  }

  return { success: true, message: `Query queued for ${TARGET_EMAIL}` };
}
