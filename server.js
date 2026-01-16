require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const TEN_MIN = 10 * 60 * 1000;
const app = express();
app.use(cors());
const orderRoutes = require("./routes/order");
const admin = require("./firebaseAdmin");
app.use("/api", orderRoutes);


const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

let retailers = [];      // { retailerId, name, mobile, address, location }
let carts = {};          // { retailerId: [cartItems] }
let orders = [];         // all orders
let products = [];


/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected ✅"))
.catch(err => console.log("Mongo error ❌", err));

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
key_id: process.env.RAZORPAY_KEY_ID,
key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ================= USER ================= */
const userSchema = new mongoose.Schema({
role: String, // wholesaler | retailer | delivery
name: String,
mobile: String,
password: String,
fcmToken: String,   
shop_current_location: String,
location: {
  lat: Number,
  lng: Number
},  
vehicle: String,
vehicle_model: String,
vehicle_number: String
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({
  wholesalerId: String,
  productName: String,
  category: String,
  price: Number,
  detail: String,
  images: [String],
  shopName: String,
  mobile: String,
  address: String,

}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

/* ================= ORDER ================= */
const orderSchema = new mongoose.Schema({
  paymentId: String,
  image: { type: String },
  wholesalerId: String,
  wholesalerName: String,
  wholesalerMobile: String,
  wholesalerLocation: {
  lat: Number,
  lng: Number
},

  productId: String,
  productName: String,
  productImg: String,
  price: Number,

  retailerName: String,
  retailerMobile: String,
  retailerLocation: {
  lat: Number,
  lng: Number
},

  vehicleType: String,
  


  // ✅ DELIVERY BREAKUP (CORRECT PLACE)
  deliveryCharge: Number,           // total delivery
  retailerDeliveryPay: Number,      // retailer ka hissa
  wholesalerDeliveryPay: Number,    // wholesaler ka hissa

  totalAmount: Number,

  deliveryBoyId: String,
  deliveryBoyName: String,
  deliveryBoyMobile: String,

  deliveryCode: String,
  deliveryCodeTime: Date,

  description: String,
  status: { type: String, default: "paid" },
  statusHistory: [{ status: String, time: Number }]
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);



const DeliveryProfileSchema = new mongoose.Schema({
  deliveryBoyId: { type: String, required: true, unique: true },
  name: String,
  mobile: String,

  vehicle: String,
  vehicleNo: String,
  city: String,

  // ✅ LIVE LOCATION
  location: {
    lat: Number,
    lng: Number
  }

}, { timestamps: true });

const DeliveryProfile = mongoose.model("DeliveryProfile", DeliveryProfileSchema);

const crypto = require("crypto");
app.post(
  "/api/webhook/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"];

      const expected = crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

      if (expected !== signature) {
        return res.status(400).send("Invalid signature");
      }

      const event = JSON.parse(req.body.toString());

      if (event.event === "payment.captured") {

  const payment = event.payload.payment.entity;
  const notes = payment.notes || {};

  /* ================= CART PAYMENT ================= */
if (notes.products) {

  const products = JSON.parse(notes.products);

  for (const p of products) {

    const order = await Order.create({
      paymentId: payment.id,

      productId: p.productId,
      productName: p.productName,
      productImg: p.productImg || "",

      price: Number(p.price),

      wholesalerId: p.wholesalerId,
      wholesalerName: p.wholesalerName,
      wholesalerMobile: p.wholesalerMobile,
      wholesalerLocation: p.wholesalerLocation || null,

      retailerName: notes.retailerName,
      retailerMobile: notes.retailerMobile,
      retailerLocation: notes.retailerLocation || null,

      vehicleType: notes.vehicleType,

      deliveryCharge: Number(p.totalDelivery),
      retailerDeliveryPay: Number(p.retailerPays),
      wholesalerDeliveryPay: Number(p.wholesalerPays),

      totalAmount: Number(p.price) + Number(p.retailerPays),

      status: "paid",
      statusHistory: [{ status: "paid", time: Date.now() }]
    });

    /* 🔔 NOTIFICATION (SAFE) */
    const payload = {
      notification: {
        title: "📦 New Order Received",
        body: `Product: ${p.productName}`
      }
    };

    const wholesaler = await User.findById(p.wholesalerId);
    if (wholesaler?.fcmToken) {
      await admin.messaging().sendToDevice(wholesaler.fcmToken, payload);
    }
  }
}

  /* ================= DIRECT BUY ================= */
else {

  const order = await Order.create({
    paymentId: payment.id,

    productId: notes.productId,
    productName: notes.productName,
    productImg: notes.productImg || "",

    price: Number(notes.price),

    wholesalerId: notes.wholesalerId,
    wholesalerName: notes.wholesalerName,
    wholesalerMobile: notes.wholesalerMobile,
    wholesalerLocation: notes.wholesalerLocation || null,

    retailerName: notes.retailerName,
    retailerMobile: notes.retailerMobile,
    retailerLocation: notes.retailerLocation || null,

    vehicleType: notes.vehicleType,

    deliveryCharge: Number(notes.totalDelivery),
    retailerDeliveryPay: Number(notes.retailerPays),
    wholesalerDeliveryPay: Number(notes.wholesalerPays),

    totalAmount: Number(notes.price) + Number(notes.retailerPays),

    status: "paid",
    statusHistory: [{ status: "paid", time: Date.now() }]
  });

  /* 🔔 NOTIFICATION (SAFE) */
  const payload = {
    notification: {
      title: "📦 New Order Received",
      body: `Product: ${notes.productName}`
    }
  };

  const wholesaler = await User.findById(notes.wholesalerId);
  if (wholesaler?.fcmToken) {
    await admin.messaging().sendToDevice(wholesaler.fcmToken, payload);
  }


      res.json({ success: true });

    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).send("Webhook error");
    }
  }
);
app.post("/api/notifications/saveToken", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.json({ success:false });
    }

    await User.findByIdAndUpdate(userId, {
      fcmToken
    });

    res.json({ success:true });

  } catch (err) {
    console.error("Save token error:", err);
    res.status(500).json({ success:false });
  }
});

// distance calculation in KM
const axios = require("axios");

async function getRoadDistanceTime(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

  const res = await axios.get(url);

  if (!res.data.routes || !res.data.routes.length) {
    throw new Error("OSRM route not found");
  }

  const route = res.data.routes[0];

  return {
    distanceKm: route.distance / 1000,     // meters → km
    timeMinutes: route.duration / 60       // seconds → minutes
  };
}

// delivery calculation
function calculateDeliveryCharge({
  orderAmount,
  vehicleType,
  distanceKm,
  timeMinutes
}) {

  // ❌ Minimum order
  if (orderAmount < 1) {
    return { error: "Minimum order ₹100 required" };
  }

  // ================= VEHICLE RATES =================
  let perKm = 0;
  let perMin = 0;
  const otherCharge = 5;

  if (vehicleType === "two_wheeler") {
    perKm = 2;
    perMin = 2.25;
  }
  if (vehicleType === "three_wheeler") {
    perKm = 3.3;
    perMin = 5;
  }
  if (vehicleType === "four_wheeler") {
    perKm = 6;
    perMin = 2;
  }

  // ================= DELIVERY BASE =================
  const baseDelivery =
    (distanceKm * perKm * 2) +
    (timeMinutes * perMin * 2) +
    otherCharge;

  // ================= 5000+ ORDER (OPTION 2) =================
  if (orderAmount > 5000) {
    return {
      totalDelivery: Math.ceil(baseDelivery),
      retailerPays: 0,
      wholesalerPays: Math.ceil(baseDelivery),
      retailerPercent: 0
    };
  }

  // ================= RETAILER % =================
  let retailerPercent = 0;

  if (orderAmount >= 100 && orderAmount <= 500) retailerPercent = 70;
  else if (orderAmount <= 3000) retailerPercent = 50;
  else if (orderAmount <= 5000) retailerPercent = 30;

  const retailerPays = Math.ceil(baseDelivery * retailerPercent / 100);
  const wholesalerPays = Math.ceil(baseDelivery - retailerPays);

  return {
    totalDelivery: Math.ceil(baseDelivery),
    retailerPays,
    wholesalerPays,
    retailerPercent
  };
}


app.use(express.json({ limit: "10mb" }));

const cartRoutes = require("./cart");

app.use("/api/cart", cartRoutes);
/* ================= AUTH ================= */
app.post("/api/signup", async (req,res)=>{
try{
let {
role,
password,
mobile,
mobile_number,
upi_mobile_number
} = req.body;

// 🔁 FRONTEND FALLBACK SUPPORT  
mobile = mobile || mobile_number || upi_mobile_number;  

if(!role || !mobile || !password){  
  return res.json({  
    success:false,  
    message:"Missing required fields"  
  });  
}  

const exists = await User.findOne({ mobile, role });  
if(exists){  
  return res.json({  
    success:false,  
    message:"User already exists"  
  });  
}  

const hashed = await bcrypt.hash(password,10);  

const user = await User.create({  
  role,  
  mobile,  
  password: hashed,  

  // optional fields  
  name: req.body.name || "",  
  shop_current_location:  
    req.body.shop_current_location ||  
    req.body.current_live_location ||  
    ""  
});  

const token = jwt.sign(  
  { id:user._id, role:user.role },  
  process.env.JWT_SECRET,  
  { expiresIn:"7d" }  
);  

res.json({  
  success:true,  
  token,  
  userId:user._id  
});

}catch(err){
console.error("Signup Error:", err);
res.status(500).json({ success:false });
}
});

app.post("/api/delivery/calculate", async (req, res) => {
  try {
    const {
      orderAmount,
      vehicleType,
      retailerLocation,
      wholesalerLocation
    } = req.body;

    if (!retailerLocation || !wholesalerLocation) {
      return res.json({ success:false, error:"Location missing" });
    }

    // ✅ ROAD DISTANCE + TIME (OSRM)
    const { distanceKm, timeMinutes } =
      await getRoadDistanceTime(retailerLocation, wholesalerLocation);

    // ✅ FINAL DELIVERY
    const delivery = calculateDeliveryCharge({
      orderAmount,
      vehicleType,
      distanceKm,
      timeMinutes
    });

    if (delivery.error) {
      return res.json({ success:false, message: delivery.error });
    }

    res.json({
      success:true,
      distanceKm: Number(distanceKm.toFixed(2)),
      timeMinutes: Math.ceil(timeMinutes),
      ...delivery
    });

  } catch (err) {
    console.error("Delivery calc error:", err.message);
    res.json({ success:false, error:"Route calculation failed" });
  }
});

app.post("/api/cart/save", (req,res)=>{
  const { retailerId, item } = req.body;
  if(!carts[retailerId]) carts[retailerId] = [];
  carts[retailerId].push(item);
  res.json({ success:true });
});
app.delete("/api/cart/remove", (req,res)=>{
  const { retailerId, productId } = req.body;
  if(carts[retailerId]){
    carts[retailerId] = carts[retailerId].filter(i=>i.productId !== productId);
  }
  res.json({ success:true });
});


app.get("/api/cart/:retailerId", (req,res)=>{
  res.json({ items: carts[req.params.retailerId] || [] });
});




app.get("/api/products/by-category/:category", async (req, res) => {
  try {
    const category = req.params.category;

    const products = await Product.find({ category });

    // 🔥 Collect wholesaler IDs
    const wholesalerIds = [
      ...new Set(products.map(p => p.wholesalerId))
    ];

    // 🔥 Fetch wholesalers with location
    const wholesalers = await User.find({
      _id: { $in: wholesalerIds }
    }).select("location");

    // 🔥 Map wholesalerId -> location
    const locationMap = {};
    wholesalers.forEach(w => {
      locationMap[w._id] = w.location;
    });

    // 🔥 Attach live location to products
    const finalProducts = products.map(p => ({
      ...p.toObject(),
      wholesalerLocation: locationMap[p.wholesalerId] || null
    }));

    res.json({ success: true, products: finalProducts });

  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});



/* ================= CATEGORY ================= */
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  wholesalerId: { type: String, required: true }
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);


app.post("/api/login", async (req,res)=>{
const { mobile, password, role } = req.body;
const user = await User.findOne({mobile, role});
if(!user) return res.json({success:false});

const ok = await bcrypt.compare(password, user.password);
if(!ok) return res.json({success:false});

const token = jwt.sign({id:user._id, role:user.role}, process.env.JWT_SECRET, {expiresIn:"7d"});

res.json({success:true, token, userId:user._id});

});

/* ================= PRODUCTS ================= */
/* ================= PRODUCTS ================= */
app.post("/api/products", async (req, res) => {
  try {
    const product = await Product.create({
      ...req.body,
      wholesalerId: req.body.wholesalerId.toLowerCase()
    });

    res.json({ success: true, product });

  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/products/wholesaler/:id", async (req,res)=>{
try{
const id = req.params.id.trim();
const products = await Product.find({
wholesalerId: { $regex: "^"+id, $options:"i" }
}).sort({createdAt:-1});
res.json({success:true, products});
}catch(err){
console.log(err);
res.json({success:false});
}
});
// GET PRODUCT BY ID
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});



// UPDATE PRODUCT
// ✅ UPDATE PRODUCT (FINAL – MULTIPLE IMAGE SUPPORT)
app.put("/api/products/:id", async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      {
        productName: req.body.productName,
        price: req.body.price,
        detail: req.body.detail,
        images: req.body.images   // ✅ CORRECT FIELD
      },
      { new: true }
    );

    if (!updated) {
      return res.json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, product: updated });

  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ success: false });
  }
});


// GET categories by wholesaler
// GET categories for a wholesaler
app.get("/api/categories/wholesaler/:wid", async (req, res) => {
  try {
    const wid = req.params.wid.trim().toLowerCase();

    const categories = await Category.find({
      wholesalerId: { $regex: `^${wid}$`, $options: "i" }
    }).sort({ createdAt: -1 });

    if (!categories.length) {
      return res.json({ success: true, categories: [], message: "No categories found" });
    }

    res.json({ success: true, categories });

  } catch (err) {
    console.error("Fetch categories error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// POST a new category (optional)
// POST a new category
app.post("/api/categories", async (req, res) => {
  try {
    let { name, wholesalerId } = req.body;

    if (!name || !wholesalerId) {
      return res.status(400).json({ success: false, message: "Missing category name or wholesalerId" });
    }

    // Clean inputs
    name = name.trim();
    wholesalerId = wholesalerId.trim().toLowerCase();

    // Check if category already exists for this wholesaler
    const exists = await Category.findOne({ name, wholesalerId });
    if (exists) {
      return res.json({ success: true, category: exists, message: "Category already exists" });
    }

    const category = await Category.create({ name, wholesalerId });
    res.json({ success: true, category });

  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// DELETE PRODUCT
app.delete("/api/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.json({ success: false, message: "Product not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= PROFILE ================= */

// Wholesaler profile
app.post("/api/wholesalers/saveProfile", async (req, res) => {
  try {
    const {
      wholesalerId,
      shopName,
      mobile,
      address,
      location        // ✅ NEW (lat, lng)
    } = req.body;

    if (!wholesalerId || !mobile) {
      return res.status(400).json({
        success: false,
        msg: "Missing info"
      });
    }

    // 🔹 Prepare update object safely
    const updateData = {
      name: shopName,
      mobile,
      shop_current_location: address
    };

    // ✅ location optional hai
    if (
      location &&
      typeof location.lat === "number" &&
      typeof location.lng === "number"
    ) {
      updateData.location = {
        lat: location.lat,
        lng: location.lng
      };
    }

    const user = await User.findByIdAndUpdate(
      wholesalerId,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.json({
        success: false,
        msg: "User not found"
      });
    }

    res.json({
      success: true,
      profile: {
        shopName: user.name,
        mobile: user.mobile,
        address: user.shop_current_location,
        location: user.location || null   // ✅ send back
      }
    });

  } catch (err) {
    console.error("Save wholesaler profile error:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/wholesalers/profile/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      profile: {
        shopName: user.name,
        mobile: user.mobile,
        address: user.shop_current_location,

        // ✅ NEW FIELD
        location: user.location || null
      }
    });

  } catch (err) {
    console.error("Get wholesaler profile error:", err);
    res.status(500).json({ success: false });
  }
});

// Retailer profile
app.post("/api/retailers/saveProfile", async (req, res) => {
  try {
    const { retailerId, name, mobile, address, location } = req.body;

    if (!retailerId || !mobile) {
      return res.status(400).json({
        success:false,
        message:"Retailer ID and mobile required"
      });
    }

    const updateData = {};

    if (name && name.trim()) updateData.name = name.trim();
    if (mobile && mobile.trim()) updateData.mobile = mobile.trim();
    if (address && address.trim()) updateData.shop_current_location = address.trim();

    if (
      location &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lng)
    ) {
      updateData.location = {
        lat: Number(location.lat),
        lng: Number(location.lng)
      };
    }

    const user = await User.findByIdAndUpdate(
      retailerId,
      { $set: updateData },
      { new:true }
    );

    if(!user){
      return res.status(404).json({ success:false });
    }

    res.json({
      success:true,
      profile:{
        name: user.name,
        mobile: user.mobile,
        address: user.shop_current_location,
        location: user.location || null
      }
    });

  } catch(err){
    console.error(err);
    res.status(500).json({ success:false });
  }
});
app.get("/api/retailers/profile/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if(!user) return res.json({ success:false, msg:"User not found" });

    res.json({
      success: true,
      profile: {
        name: user.name || "",
        mobile: user.mobile || "",
        address: user.shop_current_location || "",
        location: user.location || null   // 🔹 Important
      }
    });

  } catch(err) {
    console.error("Get retailer profile error:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});



/* ================= PAYMENT ================= */
app.post("/api/orders/pay-and-create", async (req, res) => {
  try {
    const { amount, notes } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
      notes
    });

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      order
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});


/* ================= DELIVERY ================= */
app.post("/api/orders/:id/delivery-accept", async (req,res)=>{
try{
  const { deliveryBoyId } = req.body;

  const profile = await DeliveryProfile.findOne({ deliveryBoyId });

  if(!profile){
    return res.json({ success:false, message:"Delivery profile not found" });
  }

  await Order.findByIdAndUpdate(req.params.id,{
    deliveryBoyId,
    deliveryBoyName: profile.name,
    deliveryBoyMobile: profile.mobile,
    status:"delivery_accepted",
    $push:{
      statusHistory:{
        status:"delivery_accepted",
        time:Date.now()
      }
    }
  });

  res.json({ success:true });

}catch(err){
  console.error(err);
  res.status(500).json({ success:false });
}
});


app.post("/api/orders/generate-delivery-code/:orderId", async (req,res)=>{
  try {
    const order = await Order.findById(req.params.orderId);
if(!order){
  return res.status(404).json({ success:false, message:"Order not found" });
}

// 🔥 MUST CONDITIONS
if (order.status !== "picked_up") {
  return res.json({ success:false, message:"Order not picked up yet" });
}

if (!order.deliveryBoyId) {
  return res.json({ success:false, message:"Delivery boy not assigned" });
}
    

    // 🔹 Delivery boy profile
    const profile = await DeliveryProfile.findOne({
      deliveryBoyId: order.deliveryBoyId
    });

    if(profile){
      order.deliveryBoyName = profile.name;
      order.deliveryBoyMobile = profile.mobile;
    }

    // 🔹 Generate code
    const code = Math.floor(1000 + Math.random()*9000).toString();
    order.deliveryCode = code;
    order.deliveryCodeTime = new Date();
    order.status = "delivery_code_generated";
    order.statusHistory.push({
      status:"delivery_code_generated",
      time:Date.now()
    });

    await order.save();

    // 🔹 SEND SMS
    if(order.retailerMobile){
      const toNumber = order.retailerMobile.startsWith("+")
        ? order.retailerMobile
        : "+91" + order.retailerMobile;

      const msg = `
🚚 DELIVERY VERIFICATION

🔐 Code: ${code}
👤 Delivery Boy: ${order.deliveryBoyName || "Delivery Partner"}
📞 Mobile: ${order.deliveryBoyMobile || "N/A"}
⏰ Time: ${new Date().toLocaleString()}

⚠️ Code valid for 10 minutes
`;

      try{
        await client.messages.create({
          body: msg,
          from: process.env.TWILIO_NUMBER,
          to: toNumber
        });
        console.log("✅ SMS sent to retailer");
      }catch(smsErr){
        console.error("❌ SMS failed:", smsErr.message);
      }
    }

    res.json({
      success:true,
      deliveryBoyName: order.deliveryBoyName,
      deliveryBoyMobile: order.deliveryBoyMobile
    });

  } catch(err){
    console.error("Generate code error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});
/* ================= PICKUP ORDER ================= */
app.post("/api/orders/:id/pickup", async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.json({ success: false, message: "Delivery boy id missing" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    // ❌ Sirf paid ya delivery_accepted order pickup ho sakta hai
    if (order.status !== "delivery_accepted" && order.status !== "paid") {
      return res.json({ success: false, message: "Order pickup not allowed" });
    }

    // 🔥 DELIVERY BOY PROFILE FETCH
const boy = await DeliveryProfile.findOne({ deliveryBoyId });
if (!boy) {
  return res.json({ success: false, message: "Delivery boy not found" });
}

// ✅ CORRECT ID SAVE
order.deliveryBoyId = boy.deliveryBoyId;   // ⭐ FIX
order.deliveryBoyName = boy.name;
order.deliveryBoyMobile = boy.mobile;

// ✅ STATUS UPDATE
order.status = "picked_up";
order.statusHistory.push({
  status: "picked_up",
  time: new Date()
});

await order.save();

    res.json({
      success: true,
      message: "Order picked up successfully",
      deliveryBoyName: boy.name
    });

  } catch (err) {
    console.error("Pickup Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
app.post("/api/orders/verify-delivery-code/:orderId", async (req,res)=>{
try{
const { code } = req.body;
const order = await Order.findById(req.params.orderId);

if(!order){  
  return res.json({ success:false, message:"Order not found" });  
}  

if(order.status !== "delivery_code_generated"){  
  return res.json({ success:false, message:"Order not ready for delivery" });  
}  

// ⏱️ 10 minute expiry  
const TEN_MIN = 10 * 60 * 1000;  
const expired = Date.now() - new Date(order.deliveryCodeTime).getTime() > TEN_MIN;  

// ❌ CODE EXPIRED  
if(expired){  
  order.status = "picked_up";          // 🔥 AUTO FIX  
  order.deliveryCode = null;  
  order.deliveryCodeTime = null;  

  order.statusHistory.push({  
    status:"code_expired",  
    time:new Date()  
  });  

  await order.save();  

  return res.json({  
    success:false,  
    message:"Delivery code expired. Generate new code."  
  });  
}  

// ❌ WRONG CODE  
if(order.deliveryCode !== code){  
  return res.json({ success:false, message:"Wrong delivery code" });  
}  

// ✅ CORRECT CODE → DELIVERED  
order.status = "delivered";  
order.deliveryCode = null;  
order.deliveryCodeTime = null;  

order.statusHistory.push({  
  status:"delivered",  
  time:new Date()  
});  

await order.save();  

res.json({ success:true, message:"Order delivered successfully" });

}catch(err){
console.error(err);
res.status(500).json({ success:false, message:"Server error" });
}
});
app.post("/api/delivery/profile/save", async (req, res) => {
  try {
    const {
      deliveryBoyId,
      name,
      mobile,
      vehicle,
      vehicleNo,
      city,
      location
    } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success:false,
        message:"ID required"
      });
    }

    const updateData = {
      name,
      mobile,
      vehicle,
      vehicleNo,
      city
    };

    if (
      location &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lng)
    ) {
      updateData.location = {
        lat: Number(location.lat),
        lng: Number(location.lng)
      };
    }

    const profile = await DeliveryProfile.findOneAndUpdate(
      { deliveryBoyId },
      { $set: updateData },
      { upsert:true, new:true }
    );

    res.json({
      success:true,
      message:"Profile saved",
      profile
    });

  } catch(err){
    console.error("Profile Save Error:", err);
    res.status(500).json({ success:false });
  }
});

app.get("/api/delivery/profile/:id", async (req, res) => {
  try {
    const profile = await DeliveryProfile.findOne({
      deliveryBoyId: req.params.id
    });

    if(!profile){
      return res.json({ success:false });
    }

    res.json({
      success:true,
      profile: {
        name: profile.name,
        mobile: profile.mobile,
        vehicle: profile.vehicle,
        vehicleNo: profile.vehicleNo,
        city: profile.city,

        // ✅ SEND LOCATION
        location: profile.location || null
      }
    });

  } catch (err) {
    console.error("Profile Get Error:", err);
    res.status(500).json({ success:false });
  }
});

/* ================= GET ORDERS (AUTO HIDE DELIVERED AFTER 10 MIN) ================= */

/* ===== RETAILER ===== */
app.get("/api/orders/retailer/:mobile", async (req,res)=>{
const now = Date.now();

const orders = await Order.find({
retailerMobile: req.params.mobile,
$or: [
{ status: { $ne: "delivered" } },
{
status: "delivered",
statusHistory: {
$elemMatch: {
status: "delivered",
time: { $gte: now - TEN_MIN }
}
}
}
]
}).sort({ createdAt:-1 });

res.json({ success:true, orders });
});

/* ===== WHOLESALER ===== */
app.get("/api/orders/wholesaler/:wid", async (req,res)=>{
const now = Date.now();

const orders = await Order.find({
wholesalerId: req.params.wid.toLowerCase(),
$or: [
{ status: { $ne: "delivered" } },
{
status: "delivered",
statusHistory: {
$elemMatch: {
status: "delivered",
time: { $gte: now - TEN_MIN }
}
}
}
]
}).sort({ createdAt:-1 });

res.json({ success:true, orders });
});

/* ===== DELIVERY BOY ===== */
app.get("/api/orders/delivery/:id", async (req,res)=>{
const now = Date.now();

const orders = await Order.find({
$and:[
{
$or:[
{ status:"paid" },
{ status:"delivery_accepted" },
{ status:"picked_up" },
{ status:"delivery_code_generated" },
{
status:"delivered",
statusHistory:{
$elemMatch:{
status:"delivered",
time:{ $gte: now - TEN_MIN }
}
}
}
]
},
{
$or:[
{ deliveryBoyId:req.params.id },
{ deliveryBoyId:{ $exists:false } }
]
}
]
}).sort({ createdAt:-1 });

res.json({ success:true, orders });
});
/* ================= SERVER ================= */
app.get("/", (_,res)=>res.send("Backend Running ✅"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
