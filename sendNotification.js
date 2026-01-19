const admin = require('./firebaseAdmin'); // firebaseAdmin.js import

const registrationToken = 'c4Xju8zMwk3FDSXu4nuaht:APA91bGpLVEE...'; // Wholesaler FCM token

const message = {
  notification: {
    title: 'Payment Received',
    body: 'Your payment was successful!',
  },
  token: registrationToken,
};

admin.messaging().send(message)
  .then(response => console.log('✅ FCM sent:', response))
  .catch(err => console.log('❌ FCM error:', err));
