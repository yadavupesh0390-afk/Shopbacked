const admin = require('firebase-admin');
const path = require('path');

// JSON key ka path (server root me hai)
const serviceAccount = require(path.resolve(__dirname, 'serviceAccountKey.json'));

// Firebase Admin initialize
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
