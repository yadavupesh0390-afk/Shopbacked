import admin from "./firebase.js";

export async function sendNotification(token, title, body, data = {}) {
  if (!token) return;

  const message = {
    token,
    notification: {
      title,
      body
    },
    data
  };

  try {
    await admin.messaging().send(message);
    console.log("✅ Notification sent");
  } catch (err) {
    console.error("❌ Notification error", err.message);
  }
}
