// firebaseAdmin.js
const admin = require("firebase-admin");

// ENV variable me JSON string ke roop me service account rakha hai
// Isliye parse karna zaruri hai
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("❌ FIREBASE_SERVICE_ACCOUNT environment variable missing!");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("✅ Firebase Admin initialized successfully");

module.exports = admin;
