const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

async function upgradeUsers() {
    try {
        const emails = ['jvarela2528@gmail.com', 'angelcurbelosales@gmail.com'];
        
        for (const email of emails) {
            try {
                // Fetch the user from Auth to get their UID
                const userRecord = await auth.getUserByEmail(email);
                console.log(`Found user ${email} with UID: ${userRecord.uid}`);
                
                // Update their document in Firestore
                const userRef = db.collection('users').doc(userRecord.uid);
                
                // Set role to 'master' which has maximum privileges across the board
                await userRef.set({
                    role: 'master',
                    clientId: 'master',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                console.log(`✅ Successfully upgraded ${email} to 'master' role in Firestore.`);
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    console.log(`⚠️ User ${email} not found in Firebase Auth.`);
                } else {
                    console.error(`Error upgrading ${email}:`, err);
                }
            }
        }
    } catch (e) {
        console.error("Global error:", e);
    }
}

upgradeUsers();
