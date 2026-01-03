pmrequire("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const TEN_MIN = 10 * 60 * 1000;
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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
image: String,
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
const crypto = require("crypto");

// Razorpay order create
app.post("/api/orders/pay-and-create", async (req,res)=>{
  try{
    const { amount } = req.body;
    if(!amount) return res.json({ success:false, message:"Amount required" });

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency:"INR",
      receipt:"rcpt_"+Date.now()
    });

    res.json({
      success:true,
      order,
      key:process.env.RAZORPAY_KEY_ID,
      amount:order.amount
    });

  }catch(err){
    console.error("Razorpay Create Order Error:", err);
    res.status(500).json({ success:false });
  }
});

// Razorpay payment verify
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderData } = req.body;

    if(!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderData){
      return res.json({ success:false, message:"Missing fields" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if(expected !== razorpay_signature){
      return res.json({ success:false, message:"Payment verification failed" });
    }

    // ✅ Payment verified → create order(s)
    const { productId, products, paymentId, vehicleType, retailerName, retailerMobile, retailerAddress, deliveryCharge } = orderData;

    if(productId){
      // Single product
      const product = await Product.findById(productId);
      if(!product) return res.json({ success:false, message:"Product not found" });

      const totalAmount = product.price + (deliveryCharge || 0);

      const order = await Order.create({
        paymentId,
        wholesalerId: product.wholesalerId,
        wholesalerName: product.shopName || "",
        wholesalerMobile: product.mobile || "",
        wholesalerAddress: product.address || "",

        productId: product._id,
        productName: product.productName,
        productImg: product.image,
        price: product.price,

        retailerName,
        retailerMobile,
        retailerAddress,

        vehicleType,
        deliveryCharge: deliveryCharge || 0,
        totalAmount,

        status: "paid",
        statusHistory:[{ status:"paid", time: Date.now() }]
      });

      return res.json({ success:true, order });

    } else if(products && products.length > 0){
      // Cart order
      const orders = [];

      for(const p of products){
        const product = await Product.findById(p._id);
        if(!product){
          // skip invalid product, but log
          console.warn("Product not found:", p._id);
          continue;
        }

        const itemTotal = product.price + (deliveryCharge || 0);

        const order = await Order.create({
          paymentId,
          wholesalerId: product.wholesalerId,
          wholesalerName: product.shopName || "",
          wholesalerMobile: product.mobile || "",
          wholesalerAddress: product.address || "",

          productId: product._id,
          productName: product.productName,
          productImg: product.image,
          price: product.price,

          retailerName,
          retailerMobile,
          retailerAddress,

          vehicleType,
          deliveryCharge: deliveryCharge || 0,
          totalAmount: itemTotal,

          status: "paid",
          statusHistory:[{ status:"paid", time: Date.now() }]
        });

        orders.push(order);
      }

      if(orders.length === 0){
        return res.json({ success:false, message:"No valid products to create order" });
      }

      return res.json({ success:true, orders });

    } else {
      return res.json({ success:false, message:"No products provided" });
    }

  } catch(err){
    console.error("Confirm Payment Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});
/* ================= DELIVERY ================= */

// 1️⃣ Delivery boy accepts the order
app.post("/api/orders/:id/delivery-accept", async (req,res)=>{
  try{
    const { deliveryBoyId, deliveryBoyName, deliveryBoyMobile } = req.body;
    if(!deliveryBoyId || !deliveryBoyName || !deliveryBoyMobile){
      return res.status(400).json({ success:false, message:"Delivery boy info required" });
    }

    const order = await Order.findById(req.params.id);
    if(!order) return res.json({ success:false, message:"Order not found" });

    // Only orders in "paid" status can be accepted
    if(order.status !== "paid"){
      return res.json({ success:false, message:"Order cannot be accepted" });
    }

    order.deliveryBoyId = deliveryBoyId;
    order.deliveryBoyName = deliveryBoyName;
    order.deliveryBoyMobile = deliveryBoyMobile;
    order.status = "delivery_accepted";
    order.statusHistory.push({ status:"delivery_accepted", time: Date.now() });

    await order.save();
    res.json({ success:true, message:"Order accepted for delivery" });

  }catch(err){
    console.error("Delivery Accept Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// 2️⃣ Generate 4-digit delivery code
app.post("/api/orders/generate-delivery-code/:orderId", async (req,res)=>{
  try{
    const order = await Order.findById(req.params.orderId);
    if(!order) return res.json({ success:false, message:"Order not found" });

    // Only allow if order is picked_up or code already generated
    if(!["picked_up","delivery_code_generated"].includes(order.status)){
      return res.json({ success:false, message:"Invalid order state for code generation" });
    }

    // Generate 4-digit code
    const code = Math.floor(1000 + Math.random()*9000).toString();
    order.deliveryCode = code;
    order.deliveryCodeTime = new Date();
    order.status = "delivery_code_generated";
    order.statusHistory.push({ status:"delivery_code_generated", time: Date.now() });

    await order.save();

    // TODO: Send code to retailer via SMS/push
    // sendToRetailer(order.retailerMobile, code);

    res.json({ success:true, message:"Delivery code generated", code });

  }catch(err){
    console.error("Generate Delivery Code Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// 3️⃣ Pickup the order by delivery boy
app.post("/api/orders/:id/pickup", async (req, res) => {
  try{
    const order = await Order.findById(req.params.id);
    if(!order) return res.json({ success:false, message:"Order not found" });

    // Only "paid" or "delivery_accepted" orders can be picked up
    if(!["paid","delivery_accepted"].includes(order.status)){
      return res.json({ success:false, message:"Order pickup not allowed" });
    }

    order.status = "picked_up";
    order.statusHistory.push({ status:"picked_up", time: Date.now() });
    await order.save();

    res.json({ success:true, message:"Order picked up successfully" });

  }catch(err){
    console.error("Pickup Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// 4️⃣ Verify delivery code and mark order as delivered
app.post("/api/orders/verify-delivery-code/:orderId", async (req,res)=>{
  try{
    const { code } = req.body;
    if(!code) return res.json({ success:false, message:"Code is required" });

    const order = await Order.findById(req.params.orderId);
    if(!order) return res.json({ success:false, message:"Order not found" });

    // Only allow verification if code generated
    if(order.status !== "delivery_code_generated"){
      return res.json({ success:false, message:"Order not ready for delivery" });
    }

    // Check expiry (10 min)
    const TEN_MIN = 10 * 60 * 1000;
    const expired = Date.now() - new Date(order.deliveryCodeTime).getTime() > TEN_MIN;

    if(expired){
      order.status = "picked_up";  // fallback to picked_up
      order.deliveryCode = null;
      order.deliveryCodeTime = null;
      order.statusHistory.push({ status:"code_expired", time: Date.now() });
      await order.save();

      return res.json({ success:false, message:"Delivery code expired. Generate new code." });
    }

    // Wrong code
    if(order.deliveryCode !== code){
      return res.json({ success:false, message:"Wrong delivery code" });
    }

    // ✅ Correct code → mark delivered
    order.status = "delivered";
    order.deliveryCode = null;
    order.deliveryCodeTime = null;
    order.statusHistory.push({ status:"delivered", time: Date.now() });
    await order.save();

    res.json({ success:true, message:"Order delivered successfully" });

  }catch(err){
    console.error("Verify Delivery Code Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// 5️⃣ Save / update delivery boy profile
app.post("/api/delivery/profile/save", async (req, res) => {
  try{
    const { deliveryBoyId } = req.body;
    if(!deliveryBoyId) return res.status(400).json({ success:false, message:"ID required" });

    const profile = await DeliveryProfile.findOneAndUpdate(
      { deliveryBoyId },
      req.body,
      { upsert:true, new:true }
    );

    res.json({ success:true, message:"Profile saved", profile });

  }catch(err){
    console.error("Delivery Profile Save Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

// 6️⃣ Get delivery boy profile
app.get("/api/delivery/profile/:id", async (req, res) => {
  try{
    const profile = await DeliveryProfile.findOne({ deliveryBoyId: req.params.id });
    res.json({ success:true, profile });
  }catch(err){
    console.error("Delivery Profile Get Error:", err);
    res.status(500).json({ success:false, message:"Server error" });
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
