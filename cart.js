const express = require("express");
const app = express();

app.use(express.json());              // ✅ MUST



/* ================== SCHEMA ================== */
const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productName: String,
  price: Number,
  image: String,

  wholesalerId: String,
  shopName: String,
  mobile: String,
  address: String,

  quantity: { type: Number, default: 1 }
});

const cartSchema = new mongoose.Schema(
  {
    retailerId: { type: String, required: true, unique: true },
    items: [cartItemSchema]
  },
  { timestamps: true }
);

// 🔥 FIX IS HERE
const Cart =
  mongoose.models.Cart || mongoose.model("Cart", cartSchema);

/* ================== ROUTES ================== */

// ✅ ADD TO CART
router.post("/save", async (req, res) => {
  try {
    const { retailerId, item } = req.body;

    if (!retailerId || !item?.productId) {
      return res.json({ success: false, message: "Invalid data" });
    }

    let cart = await Cart.findOne({ retailerId });

    if (!cart) {
      cart = new Cart({ retailerId, items: [item] });
    } else {
      const index = cart.items.findIndex(
        i => i.productId.toString() === item.productId.toString()
      );

      if (index > -1) {
        cart.items[index].quantity += 1;
      } else {
        cart.items.push(item);
      }
    }

    await cart.save();
    res.json({ success: true });

  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ✅ GET CART
router.get("/:retailerId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ retailerId: req.params.retailerId });
    res.json({
      success: true,
      items: cart ? cart.items : []
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ❌ REMOVE ITEM
router.delete("/remove", async (req, res) => {
  try {
    const { retailerId, productId } = req.body;

    const cart = await Cart.findOne({ retailerId });
    if (!cart) return res.json({ success: false });

    cart.items = cart.items.filter(
      i => i.productId.toString() !== productId
    );

    await cart.save();
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 🧹 CLEAR CART
router.delete("/clear/:retailerId", async (req, res) => {
  try {
    await Cart.deleteOne({ retailerId: req.params.retailerId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
