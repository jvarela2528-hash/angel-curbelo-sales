const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkUsers() {
    try {
        const snapshot = await db.collection('users').get();
        console.log('Total users in DB:', snapshot.size);
        snapshot.forEach(doc => {
            console.log(doc.id, '=>', doc.data());
        });
    } catch (e) {
        console.error('Error:', e);
    }
}

checkUsers();
