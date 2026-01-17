const express = require("express");
const router = express.Router();
// order.js के अंदर
const admin = require("./firebaseAdmin");
const orderRoutes = require("./order");

// 🔔 Order PAID → Notification
router.post("/orders/:orderId/paid", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate("deliveryBoy")
      .populate("wholesaler");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const payload = {
      notification: {
        title: "📦 New Order Received",
        body: `Order #${order._id} is ready`,
      }
    };

    // 🚚 Delivery Boy Notification
    if (order.deliveryBoy?.fcmToken) {
      await admin.messaging().sendToDevice(
        order.deliveryBoy.fcmToken,
        payload
      );
    }

    // 🏪 Wholesaler Notification
    if (order.wholesaler?.fcmToken) {
      await admin.messaging().sendToDevice(
        order.wholesaler.fcmToken,
        payload
      );
    }

    res.json({ success: true, message: "Notification sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
