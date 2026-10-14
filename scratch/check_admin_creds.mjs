import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const BASE_URL = process.env.TEST_BASE_URL || 'https://teachfixpeshawar.vercel.app';

async function main() {
  // Try the known working password first — avoids 401 noise in Vercel logs
  const pwd = process.env.ADMIN_PASSWORD || 'safi2025';
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  });
  const json = await res.json();
  if (res.ok && json.token) {
    console.log(`✅ Admin login successful. Token: ${json.token.slice(0, 30)}...`);
  } else {
    console.error(`❌ Admin login failed: ${json.error || res.status}`);
  }
}

main().catch(console.error);
