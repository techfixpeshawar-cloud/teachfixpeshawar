import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getAdminFirestore } from '../server/firebaseAdmin.js';
import { extractCustomerEmail } from '../src/utils/emailNormalization.js';

async function testLiveFirestore() {
  const fsDb = getAdminFirestore();
  if (!fsDb) {
    console.error('❌ Firestore Admin instance could not be initialized.');
    process.exit(1);
  }

  console.log('--- INSPECTING LIVE FIRESTORE RECORDS ---');
  const reqSnap = await fsDb.collection('requests').get();
  console.log(`Total requests docs: ${reqSnap.size}`);

  let withEmail = 0;
  let withoutEmail = 0;
  const sampleWithEmail = [];
  const sampleWithoutEmail = [];

  reqSnap.docs.forEach((doc) => {
    const data = doc.data();
    const email = extractCustomerEmail(data);
    if (email) {
      withEmail++;
      if (sampleWithEmail.length < 5) {
        sampleWithEmail.push({ id: doc.id, name: data.fullName || data.name, email });
      }
    } else {
      withoutEmail++;
      if (sampleWithoutEmail.length < 5) {
        sampleWithoutEmail.push({ id: doc.id, name: data.fullName || data.name });
      }
    }
  });

  console.log(`Records with customer email: ${withEmail}`);
  console.log(`Records without customer email: ${withoutEmail}`);
  console.log('\nSample records with valid customer email:');
  console.table(sampleWithEmail);

  if (sampleWithoutEmail.length > 0) {
    console.log('\nHistorical records without customer email (created before email capture):');
    console.table(sampleWithoutEmail);
  }

  console.log('\n✅ Live Firestore verification completed successfully.');
  process.exit(0);
}

testLiveFirestore().catch((err) => {
  console.error('Error during Firestore test:', err);
  process.exit(1);
});
