require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log("Mongo error",err));

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ================= USER ================= */
const userSchema = new mongoose.Schema({
  role:String,
  name:String,
  mobile:String,
  password:String,
  shop_current_location:String,
  vehicle:String,
  vehicle_model:String,
  vehicle_number:String
},{timestamps:true});
const User = mongoose.model("User",userSchema);

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({
  wholesalerId:String,
  productName:String,
  price:Number,
  detail:String,
  image:String,
  shopName:String,
  mobile:String,
  address:String
},{timestamps:true});
const Product = mongoose.model("Product",productSchema);

/* ================= ORDER ================= */
const orderSchema = new mongoose.Schema({
  paymentOrderId:String,
  paymentId:String,
  deliveryCode:String,
  deliveryCodeTime:Date,
  wholesalerId:String,
  wholesalerName:String,
  wholesalerMobile:String,
  wholesalerAddress:String,
  productId:String,
  productName:String,
  price:Number,
  deliveryCharge:Number,
  totalAmount:Number,
  productImg:String,
  retailerName:String,
  retailerMobile:String,
  retailerAddress:String,
  vehicleType:String,
  deliveryBoyId:String,
  deliveryBoyName:String,
  deliveryBoyMobile:String,
  status:{ type:String, default:"pending" },
  statusHistory:[{ status:String, time:Number }]
},{timestamps:true});
const Order = mongoose.model("Order",orderSchema);

/* ================= AUTH ================= */
app.post("/api/signup", async(req,res)=>{
  const {role,mobile,password} = req.body;
  if(!role || !mobile || !password) return res.json({success:false});

  const exists = await User.findOne({mobile,role});
  if(exists) return res.json({success:false});

  const hashed = await bcrypt.hash(password,10);
  const user = await User.create({...req.body,password:hashed});

  const token = jwt.sign({id:user._id,role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
  res.json({success:true,token,userId:user._id});
});

app.post("/api/login", async(req,res)=>{
  const {mobile,password,role} = req.body;
  const user = await User.findOne({mobile,role});
  if(!user) return res.json({success:false});

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.json({success:false});

  const token = jwt.sign({id:user._id,role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
  res.json({success:true,token,userId:user._id});
});

/* ================= PRODUCTS ================= */
app.post("/api/products", async(req,res)=>{
  const p = await Product.create(req.body);
  res.json({success:true,product:p});
});

app.get("/api/products/wholesaler/:id", async(req,res)=>{
  const id = req.params.id.toLowerCase();
  const products = await Product.find({wholesalerId:{ $regex:"^"+id }}).sort({createdAt:-1});
  res.json({success:true,products});
});

/* ================= PAYMENT ================= */
app.post("/api/orders/pay-and-create", async(req,res)=>{
  try{
    const { amount } = req.body;
    const order = await razorpay.orders.create({amount: amount*100, currency:"INR", receipt:"rcpt_"+Date.now()});
    res.json({success:true,order, key:process.env.RAZORPAY_KEY_ID});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false});
  }
});

/* ================= ORDER CONFIRM AFTER PAYMENT ================= */
app.post("/api/orders/confirm-after-payment", async(req,res)=>{
  try{
    const {
      productId,vehicleType,paymentId,
      retailerName,retailerMobile,retailerAddress,
      wholesalerId,wholesalerName,wholesalerMobile,wholesalerAddress
    } = req.body;

    const product = await Product.findById(productId);
    if(!product) return res.json({success:false});

    let deliveryCharge = 0;
    switch(vehicleType){
      case "two_wheeler": deliveryCharge=1; break;
      case "three_wheeler": deliveryCharge=50; break;
      case "four_wheeler": deliveryCharge=80; break;
    }

    const totalAmount = product.price + deliveryCharge;

    const order = await Order.create({
      productId, vehicleType, paymentId,
      retailerName, retailerMobile, retailerAddress,
      wholesalerId, wholesalerName, wholesalerMobile, wholesalerAddress,
      price: product.price,
      deliveryCharge,
      totalAmount,
      productName: product.productName,
      productImg: product.image,
      status:"confirmed_by_wholesaler",
      statusHistory:[
        {status:"paid",time:Date.now()},
        {status:"confirmed_by_wholesaler",time:Date.now()}
      ]
    });

    res.json({success:true,order});
  }catch(err){ console.log(err); res.json({success:false}); }
});

/* ================= DELIVERY FLOW ================= */
app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const {deliveryBoyId,deliveryBoyName,deliveryBoyMobile} = req.body;
  await Order.findByIdAndUpdate(req.params.id,{
    deliveryBoyId,deliveryBoyName,deliveryBoyMobile,
    status:"delivery_accepted",
    $push:{statusHistory:{status:"delivery_accepted",time:Date.now()}}
  });
  res.json({success:true});
});

app.post("/api/orders/:id/pickup", async(req,res)=>{
  await Order.findByIdAndUpdate(req.params.id,{
    status:"picked_up",
    $push:{statusHistory:{status:"picked_up",time:Date.now()}}
  });
  res.json({success:true});
});

app.post("/api/orders/generate-delivery-code/:id", async(req,res)=>{
  const order = await Order.findById(req.params.id);
  if(!order) return res.json({success:false});
  if(order.deliveryCode) return res.json({success:true,already:true});

  order.deliveryCode = Math.floor(100000+Math.random()*900000).toString();
  order.deliveryCodeTime = new Date();
  order.status = "delivery_code_generated";
  order.statusHistory.push({status:"delivery_code_generated",time:Date.now()});
  await order.save();
  res.json({success:true});
});

app.post("/api/orders/verify-delivery-code/:id", async(req,res)=>{
  const {code} = req.body;
  const order = await Order.findById(req.params.id);
  if(!order) return res.json({success:false});
  if(order.deliveryCode!==code) return res.json({success:false});

  order.status="delivered";
  order.statusHistory.push({status:"delivered",time:Date.now()});
  await order.save();
  res.json({success:true});
});

/* ================= GET ORDERS ================= */
app.get("/api/orders/wholesaler/:wid", async(req,res)=>{
  const o = await Order.find({wholesalerId:req.params.wid}).sort({createdAt:-1});
  res.json({success:true,orders:o});
});
app.get("/api/orders/retailer/:mobile", async(req,res)=>{
  const o = await Order.find({retailerMobile:req.params.mobile}).sort({createdAt:-1});
  res.json({success:true,orders:o});
});
app.get("/api/orders/delivery/:id", async(req,res)=>{
  const o = await Order.find({
    $or:[
      {status:"confirmed_by_wholesaler"},
      {deliveryBoyId:req.params.id}
    ]
  }).sort({createdAt:-1});
  res.json({success:true,orders:o});
});

/* ================= SERVER ================= */
app.get("/",(_,res)=>res.send("Backend Running ✅"));
const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log("Server running on",PORT));
