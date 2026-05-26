const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const auth = admin.auth();

async function listAllUsers(nextPageToken) {
  try {
    const listUsersResult = await auth.listUsers(100, nextPageToken);
    listUsersResult.users.forEach((userRecord) => {
      console.log('user', userRecord.toJSON());
    });
    if (listUsersResult.pageToken) {
      listAllUsers(listUsersResult.pageToken);
    }
  } catch (error) {
    console.log('Error listing users:', error);
  }
}

listAllUsers();
