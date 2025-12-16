require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* ===== MONGO ===== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("Mongo error", err));

/* ===== USER SCHEMA ===== */
const userSchema = new mongoose.Schema({
  role: String,
  name: String,
  mobile: String,
  password: String,
  shop_current_location: String,
  current_live_location: { lat: Number, lng: Number },
  vehicle: String,
  vehicle_model: String,
  vehicle_number: String,
  full_name: String,
  official_mobile_number: String,
  login_mobile: String
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

/* ===== PRODUCT SCHEMA ===== */
const productSchema = new mongoose.Schema({
  wholesalerId: String,
  productName: String,
  price: Number,
  detail: String,
  image: String,
  shopName: String,
  mobile: String,
  address: String
}, { timestamps: true });
const Product = mongoose.model("Product", productSchema);

/* ===== ORDER SCHEMA ===== */
const orderSchema = new mongoose.Schema({
  wholesalerId: String,
  productId: String,
  productName: String,
  price: Number,
  productImg: String,
  retailerName: String,
  retailerMobile: String,
  txnId: String,
  proofImg: String,
  deliveryBoyId: String,
  status: { type: String, default: "pending" },
  statusHistory: [{ status: String, time: Number }],
  wheelerType: String,
  pickupCode: String
}, { timestamps: true });
const Order = mongoose.model("Order", orderSchema);

/* ===== AUTH ===== */
app.post("/api/signup", async (req, res) => {
  try {
    const { role, password } = req.body;
    const mobile = req.body.mobile || req.body.login_mobile || req.body.upi_mobile_number;

    if (!role || !password || !mobile)
      return res.json({ success: false, message: "Missing fields" });

    const exists = await User.findOne({ mobile, role });
    if (exists) return res.json({ success: false, message: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ ...req.body, mobile, password: hashed });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, userId: user._id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

app.post("/api/login", async (req, res) => {
  const { mobile, password, role } = req.body;
  const user = await User.findOne({ mobile, role });
  if (!user) return res.json({ success: false });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ success: false });

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, userId: user._id });
});

/* ===== ADD PRODUCT ===== */
app.post("/api/products", async (req, res) => {
  const p = await Product.create(req.body);
  res.json({ success: true, product: p });
});

app.get("/api/products/wholesaler/:wid", async (req, res) => {
  const products = await Product.find({ wholesalerId: req.params.wid });
  res.json({ success: true, products });
});

/* ===== PLACE ORDER ===== */
app.post("/api/orders", async (req, res) => {
  const order = await Order.create({
    ...req.body,
    status: "pending",
    statusHistory: [{ status: "pending", time: Date.now() }]
  });
  res.json({ success: true, order });
});

/* ===== WHOLESALER CONFIRM ===== */
app.post("/api/orders/:id/confirm", async (req, res) => {
  const { wheelerType } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: "confirmed_by_wholesaler",
      wheelerType,
      $push: { statusHistory: { status: "confirmed_by_wholesaler", time: Date.now() } }
    },
    { new: true }
  );

  // Notify all delivery boys
  io.emit("new_order", order);

  res.json({ success: true, order });
});

/* ===== ASSIGN / ACCEPT / PICKUP / DELIVERED ===== */
app.post("/api/orders/:id/assign-delivery", async (req, res) => {
  const { deliveryBoyId } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      deliveryBoyId,
      status: "delivery_assigned",
      $push: { statusHistory: { status: "delivery_assigned", time: Date.now() } }
    },
    { new: true }
  );
  io.to(deliveryBoyId).emit("assigned_order", order);
  res.json({ success: true, order });
});

app.post("/api/orders/:id/delivery-accept", async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: "delivery_accepted",
      $push: { statusHistory: { status: "delivery_accepted", time: Date.now() } }
    },
    { new: true }
  );
  io.to(order.deliveryBoyId).emit("order_update", order);
  res.json({ success: true, order });
});

app.post("/api/orders/:id/pickup", async (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: "picked_up",
      pickupCode: code,
      $push: { statusHistory: { status: "picked_up", time: Date.now() } }
    },
    { new: true }
  );
  io.to(order.deliveryBoyId).emit("order_update", order);
  io.to(order.retailerMobile).emit("pickup_code", { code, order });
  res.json({ success: true, order });
});

app.post("/api/orders/:id/delivered", async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: "delivered",
      $push: { statusHistory: { status: "delivered", time: Date.now() } }
    },
    { new: true }
  );
  io.to(order.deliveryBoyId).emit("order_update", order);
  io.to(order.retailerMobile).emit("order_delivered", order);
  res.json({ success: true, order });
});

/* ===== GET ORDERS ===== */
app.get("/api/orders/wholesaler/:wid", async (req, res) => {
  const orders = await Order.find({ wholesalerId: req.params.wid });
  res.json({ success: true, orders });
});

app.get("/api/orders/retailer/:mobile", async (req, res) => {
  const orders = await Order.find({ retailerMobile: req.params.mobile });
  res.json({ success: true, orders });
});

/* ===== SERVER + SOCKET.IO ===== */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {
  console.log("Socket connected:", socket.id);

  socket.on("register", userId => {
    socket.join(userId);
    console.log("User joined room:", userId);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on port", PORT));
