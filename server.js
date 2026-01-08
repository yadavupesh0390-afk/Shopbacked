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

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);




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
shop_current_location: String,
vehicle: String,
vehicle_model: String,
vehicle_number: String
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({
wholesalerId: String,
productName: String,
price: Number,
detail: String,
images: [String],   // ⭐ multiple images,
shopName: String,
mobile: String,
address: String
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

/* ================= ORDER ================= */
const orderSchema = new mongoose.Schema({
paymentId: String,
wholesalerId: String,
wholesalerName: String,
wholesalerMobile: String,
wholesalerAddress: String,
productId: String,
productName: String,
productImg: String,
price: Number,
retailerName: String,
retailerMobile: String,
retailerAddress: String,
vehicleType: String,
deliveryCharge: Number,
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

/* ================= CART ================= */
const cartSchema = new mongoose.Schema({
retailerId: String,
items: Array
}, { timestamps: true });

const Cart = mongoose.model("Cart", cartSchema);

const DeliveryProfileSchema = new mongoose.Schema({
deliveryBoyId: { type: String, required: true, unique: true },
name: String,
mobile: String,
vehicle: String,
vehicleNo: String,
city: String
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
      await Order.create({
        paymentId: payment.id,

        productId: p.productId,
        productName: p.productName,
        price: Number(p.price),

        wholesalerId: p.wholesalerId,
        wholesalerName: p.wholesalerName,
        wholesalerMobile: p.wholesalerMobile,
        wholesalerAddress: p.wholesalerAddress,

        retailerName: notes.retailerName,
        retailerMobile: notes.retailerMobile,
        retailerAddress: notes.retailerAddress,

        vehicleType: notes.vehicleType,
        deliveryCharge: Number(notes.deliveryCharge),
        totalAmount: Number(p.price) + Number(notes.deliveryCharge),

        status: "paid",
        statusHistory: [
          { status: "paid", time: Date.now() }
        ]
      });
    }
  }

  /* ================= DIRECT BUY ================= */
  else {

    await Order.create({
      paymentId: payment.id,

      productId: notes.productId,
      productName: notes.productName,
      price: Number(notes.price),

      wholesalerId: notes.wholesalerId,
      wholesalerName: notes.wholesalerName,
      wholesalerMobile: notes.wholesalerMobile,
      wholesalerAddress: notes.wholesalerAddress,

      retailerName: notes.retailerName,
      retailerMobile: notes.retailerMobile,
      retailerAddress: notes.retailerAddress,

      vehicleType: notes.vehicleType,
      deliveryCharge: Number(notes.deliveryCharge),
      totalAmount: Number(notes.price) + Number(notes.deliveryCharge),

      status: "paid",
      statusHistory: [
        { status: "paid", time: Date.now() }
      ]
    });
  }
}

      res.json({ success: true });

    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).send("Webhook error");
    }
  }
);



app.use(express.json({ limit: "10mb" }));


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
app.post("/api/products", async (req,res)=>{
const body = {...req.body, wholesalerId:req.body.wholesalerId.toLowerCase()};
const p = await Product.create(body);
res.json({success:true, product:p});
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
app.post("/api/wholesalers/saveProfile", async (req,res)=>{
try{
const { wholesalerId, shopName, mobile, address } = req.body;
if(!wholesalerId || !mobile) return res.status(400).json({success:false,msg:"Missing info"});

const user = await User.findByIdAndUpdate(wholesalerId,{
name: shopName,
mobile,
shop_current_location: address
},{new:true});

if(!user) return res.json({success:false,msg:"User not found"});    

res.json({success:true, profile:{    
    shopName:user.name,    
    mobile:user.mobile,    
    address:user.shop_current_location    
}});

}catch(err){ console.log(err); res.status(500).json({success:false}); }

});

app.get("/api/wholesalers/profile/:id", async (req,res)=>{
try{
const user = await User.findById(req.params.id);
if(!user) return res.json({success:false});
res.json({success:true, profile:{
shopName:user.name,
mobile:user.mobile,
address:user.shop_current_location
}});
}catch(err){ console.log(err); res.status(500).json({success:false}); }
});

// Retailer profile
app.post("/api/retailers/saveProfile", async (req,res)=>{
try{
const { retailerId, name, mobile, address } = req.body;
if(!retailerId || !mobile) return res.json({success:false});

const user = await User.findByIdAndUpdate(retailerId,{
name, mobile, shop_current_location: address
},{new:true});

if(!user) return res.json({success:false,msg:"User not found"});    
res.json({success:true, profile:{    
    name:user.name, mobile:user.mobile, address:user.shop_current_location    
}});

}catch(err){ console.log(err); res.status(500).json({success:false}); }

});

app.get("/api/retailers/profile/:id", async (req,res)=>{
try{
const user = await User.findById(req.params.id);
if(!user) return res.json({success:false});
res.json({success:true, profile:{
name:user.name, mobile:user.mobile, address:user.shop_current_location
}});
}catch(err){ console.log(err); res.status(500).json({success:false}); }
});

/* ================= CART ================= */
app.post("/api/cart/save", async (req,res)=>{
const { retailerId, items } = req.body;
if(!retailerId) return res.json({success:false});
let cart = await Cart.findOne({retailerId});
if(cart){ cart.items = items; await cart.save(); }
else{ cart = await Cart.create({retailerId, items}); }
res.json({success:true, cart});
});

app.get("/api/cart/:retailerId", async (req,res)=>{
const cart = await Cart.findOne({retailerId:req.params.retailerId});
res.json({success:true, cart});
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
const { deliveryBoyId } = req.body;

if (!deliveryBoyId) {
return res.status(400).json({ success: false, message: "ID required" });
}

const profile = await DeliveryProfile.findOneAndUpdate(
{ deliveryBoyId },
req.body,
{ upsert: true, new: true }
);

res.json({
success: true,
message: "Profile saved",
profile
});

} catch (err) {
console.error("Profile Save Error:", err);
res.status(500).json({ success: false });
}
});

app.get("/api/delivery/profile/:id", async (req, res) => {
try {
const profile = await DeliveryProfile.findOne({
deliveryBoyId: req.params.id
});

res.json({
success: true,
profile
});

} catch (err) {
console.error("Profile Get Error:", err);
res.status(500).json({ success: false });
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
