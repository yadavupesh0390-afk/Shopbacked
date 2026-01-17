import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: String,
  role: String,
  fcmToken: String,
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Notification", notificationSchema);
