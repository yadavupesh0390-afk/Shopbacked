import express from "express";
import Notification from "../models/Notification.js";

const router = express.Router();

router.post("/saveToken", async (req, res) => {
  try {
    const { userId, role, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ success: false });
    }

    await Notification.findOneAndUpdate(
      { userId },
      { userId, role, fcmToken },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

export default router;
