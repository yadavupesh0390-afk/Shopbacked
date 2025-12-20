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
.then(()=>console.log("MongoDB connected ✅"))
.catch(err=>console.log("Mongo error ❌",err));

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

  wholesalerId:String,
  wholesalerName:String,
  wholesalerMobile:String,
  wholesalerAddress:String,

  productId:String,
  productName:String,
  productImg:String,
  price:Number,

  retailerName:String,
  retailerMobile:String,
  retailerAddress:String,

  vehicleType:String,
  deliveryCharge:Number,
  totalAmount:Number,

  deliveryBoyId:String,
  deliveryBoyName:String,
  deliveryBoyMobile:String,

  deliveryCode:String,
  deliveryCodeTime:Date,

  status:{ type:String, default:"paid" },
  description:String,

  statusHistory:[{ status:String, time:Number }]
},{timestamps:true});

const Order = mongoose.model("Order",orderSchema);

/* ================= AUTH ================= */
app.post("/api/signup", async(req,res)=>{
  try{
    const {role,mobile,password} = req.body;
    if(!role||!mobile||!password) return res.json({success:false});

    const exists = await User.findOne({mobile,role});
    if(exists) return res.json({success:false});

    const hashed = await bcrypt.hash(password,10);
    const user = await User.create({...req.body,password:hashed});

    const token = jwt.sign(
      {id:user._id,role:user.role},
      process.env.JWT_SECRET,
      {expiresIn:"7d"}
    );

    res.json({success:true,token,userId:user._id});
  }catch(e){
    res.json({success:false});
  }
});

app.post("/api/login", async(req,res)=>{
  const {mobile,password,role} = req.body;
  const user = await User.findOne({mobile,role});
  if(!user) return res.json({success:false});

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.json({success:false});

  const token = jwt.sign(
    {id:user._id,role:user.role},
    process.env.JWT_SECRET,
    {expiresIn:"7d"}
  );

  res.json({success:true,token,userId:user._id});
});

/* ================= PRODUCTS ================= */
app.post("/api/products", async(req,res)=>{
  const p = await Product.create(req.body);
  res.json({success:true,product:p});
});

app.get("/api/products/wholesaler/:id", async(req,res)=>{
  const products = await Product.find({wholesalerId:req.params.id})
                                .sort({createdAt:-1});
  res.json({success:true,products});
});

/* ================= PAYMENT CREATE ================= */
app.post("/api/orders/pay-and-create", async(req,res)=>{
  try{
    const order = await razorpay.orders.create({
      amount:req.body.amount*100,
      currency:"INR",
      receipt:"rcpt_"+Date.now()
    });

    res.json({
      success:true,
      order,
      key:process.env.RAZORPAY_KEY_ID
    });
  }catch(err){
    console.log(err);
    res.json({success:false});
  }
});

/* ================= CONFIRM AFTER PAYMENT ================= */
app.post("/api/orders/confirm-after-payment", async(req,res)=>{
  try{
    const {
      productId,
      paymentId,
      vehicleType,
      retailerName,
      retailerMobile,
      retailerAddress,
      wholesalerId,
      wholesalerName,
      wholesalerMobile,
      wholesalerAddress,
      description
    } = req.body;

    const product = await Product.findById(productId);
    if(!product) return res.json({success:false});

    let deliveryCharge = 0;
    if(vehicleType==="two_wheeler") deliveryCharge=1;
    else if(vehicleType==="three_wheeler") deliveryCharge=50;
    else if(vehicleType==="four_wheeler") deliveryCharge=80;

    const totalAmount = product.price + deliveryCharge;

    const order = await Order.create({
      productId,
      productName:product.productName,
      productImg:product.image,
      price:product.price,

      wholesalerId,
      wholesalerName,
      wholesalerMobile,
      wholesalerAddress,

      retailerName,
      retailerMobile,
      retailerAddress,

      vehicleType,
      deliveryCharge,
      totalAmount,

      paymentId,
      description,

      status:"paid",
      statusHistory:[{status:"paid",time:Date.now()}]
    });

    res.json({success:true,order});
  }catch(err){
    console.log(err);
    res.json({success:false});
  }
});

/* ================= DELIVERY FLOW ================= */
app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const {deliveryBoyId,deliveryBoyName,deliveryBoyMobile} = req.body;

  await Order.findByIdAndUpdate(req.params.id,{
    deliveryBoyId,
    deliveryBoyName,
    deliveryBoyMobile,
    status:"delivery_accepted",
    $push:{statusHistory:{status:"delivery_accepted",time:Date.now()}}
  });

  res.json({success:true});
});

app.post("/api/orders/generate-delivery-code/:id", async(req,res)=>{
  const order = await Order.findById(req.params.id);
  if(!order) return res.json({success:false});

  if(!order.deliveryCode){
    order.deliveryCode = Math.floor(100000+Math.random()*900000).toString();
    order.deliveryCodeTime = new Date();
    order.status = "out_for_delivery";
    order.statusHistory.push({status:"out_for_delivery",time:Date.now()});
    await order.save();
  }

  res.json({success:true});
});

app.post("/api/orders/verify-delivery-code/:id", async(req,res)=>{
  const order = await Order.findById(req.params.id);
  if(!order || order.deliveryCode!==req.body.code)
    return res.json({success:false});

  order.status="delivered";
  order.statusHistory.push({status:"delivered",time:Date.now()});
  await order.save();

  res.json({success:true});
});

/* ================= GET ORDERS ================= */
app.get("/api/orders/retailer/:mobile", async(req,res)=>{
  const orders = await Order.find({retailerMobile:req.params.mobile})
                            .sort({createdAt:-1});
  res.json({success:true,orders});
});

app.get("/api/orders/wholesaler/:wid", async(req,res)=>{
  const orders = await Order.find({wholesalerId:req.params.wid})
                            .sort({createdAt:-1});
  res.json({success:true,orders});
});

app.get("/api/orders/delivery/:id", async(req,res)=>{
  const orders = await Order.find({
    $or:[
      {status:"paid"},
      {deliveryBoyId:req.params.id}
    ]
  }).sort({createdAt:-1});

  res.json({success:true,orders});
});

/* ================= SERVER ================= */
app.get("/",(_,res)=>res.send("Backend Running ✅"));
const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log("Server running on",PORT));
