const express = require("express");
const router = express.Router();

const orderRoutes = require("./order");            // ✅ correct path
              // fcmToken yahin se aayega
const admin = require("./firebaseAdmin");           // firebase admin

router.post("/payment-success", async (req, res) => {
  try {
    const { orderId } = req.body;

    // 1️⃣ Order find karo
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 2️⃣ Order paid mark karo
    order.status = "paid";
    order.statusHistory.push({
      status: "paid",
      time: Date.now()
    });
    await order.save();

    // 3️⃣ Wholesaler ka FCM token lao
    const wholesaler = await User.findById(order.wholesalerId);

    // 4️⃣ Notification bhejo
    if (wholesaler && wholesaler.fcmToken) {
      const message = {
        token: wholesaler.fcmToken,
        notification: {
          title: "💰 New Paid Order",
          body: `₹${order.price} ka order received`
        },
        data: {
          orderId: order._id.toString()
        }
      };

      await admin.messaging().send(message);
      console.log("✅ Notification sent to wholesaler");
    } else {
      console.log("⚠️ Wholesaler FCM token missing");
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Payment success error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;   // ⭐ MOST IMPORTANT
