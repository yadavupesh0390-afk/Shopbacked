const express = require("express");
const router = express.Router();   // ⭐ MOST IMPORTANT

const admin = require("./firebaseAdmin");
const Order = require("./Order"); // 👈 model ka correct path

// 🔔 Order PAID → Notification
router.post("/orders/:orderId/paid", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const payload = {
      notification: {
        title: "📦 New Order Received",
        body: `Order #${order._id} is ready`,
      }
    };

    // 🚚 Delivery Boy
    if (order.deliveryBoyFcmToken) {
      await admin.messaging().sendToDevice(
        order.deliveryBoyFcmToken,
        payload
      );
    }

    // 🏪 Wholesaler
    if (order.wholesalerFcmToken) {
      await admin.messaging().sendToDevice(
        order.wholesalerFcmToken,
        payload
      );
    }

    res.json({ success: true, message: "Notification sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;   // ⭐ MOST IMPORTANT
