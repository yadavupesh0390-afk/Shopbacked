import express from "express";
import Order from "../models/Order.js";
import Notification from "../models/Notification.js";
import { sendNotification } from "../utils/sendNotification.js";

const router = express.Router();

router.post("/payment-success", async (req, res) => {
  try {
    const { orderId } = req.body;

    // 1️⃣ Order find karo
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false });

    // 2️⃣ Order paid mark karo
    order.paymentStatus = "paid";
    await order.save();

    // 3️⃣ Wholesaler ka token lao
    const notify = await Notification.findOne({
      userId: order.wholesalerId
    });

    // 4️⃣ Notification bhejo
    if (notify?.fcmToken) {
      await sendNotification(
        notify.fcmToken,
        "💰 New Paid Order",
        `₹${order.price} ka order received`,
        {
          orderId: order._id.toString()
        }
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

export default router;
