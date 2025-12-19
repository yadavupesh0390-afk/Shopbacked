require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected ✅"))
.catch(err=>console.log("Mongo error ❌",err));

/* ================= USER ================= */
const userSchema = new mongoose.Schema({
  role:String,
  name:String,
  mobile:String,
  password:String,
  shop_current_location:String,
  vehicle:String
},{timestamps:true});

const User = mongoose.model("User",userSchema);

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({
  wholesalerId:String,   // ✅ FULL MONGO ID
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
  wholesalerId:String,   // ✅ FULL MONGO ID
  wholesalerName:String,
  wholesalerMobile:String,
  wholesalerAddress:String,

  productId:String,
  productName:String,
  price:Number,
  productImg:String,

  retailerName:String,
  retailerMobile:String,
  retailerAddress:String,

  vehicleType:String,

  deliveryBoyId:String,
  deliveryBoyName:String,
  deliveryBoyMobile:String,

  deliveryCode:String,
  deliveryCodeTime:Date,

  status:{ type:String, default:"pending" },
  statusHistory:[{ status:String, time:Number }]
},{timestamps:true});

const Order = mongoose.model("Order",orderSchema);

/* ================= AUTH ================= */
app.post("/api/signup", async(req,res)=>{
  const {role,mobile,password} = req.body;
  if(!role || !mobile || !password)
    return res.json({success:false});

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

/* ➕ ADD PRODUCT */
app.post("/api/products", async(req,res)=>{
  const p = await Product.create(req.body);
  res.json({success:true,product:p});
});

/* 📦 GET PRODUCTS (WHOLESALER DASHBOARD) */
app.get("/api/products/wholesaler/:wid", async(req,res)=>{
  const products = await Product.find({wholesalerId:req.params.wid})
                                .sort({createdAt:-1});
  res.json({success:true,products});
});

/* ================= ORDERS ================= */

/* 🛒 PLACE ORDER */
app.post("/api/orders", async(req,res)=>{
  const order = await Order.create({
    ...req.body,
    status:"pending",
    statusHistory:[{status:"pending",time:Date.now()}]
  });
  res.json({success:true,order});
});

/* ✅ WHOLESALER CONFIRM */
app.post("/api/orders/:id/confirm", async(req,res)=>{
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status:"confirmed_by_wholesaler",
      $push:{statusHistory:{status:"confirmed_by_wholesaler",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* 🚚 DELIVERY ACCEPT */
app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const {deliveryBoyId,deliveryBoyName,deliveryBoyMobile} = req.body;
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      deliveryBoyId,
      deliveryBoyName,
      deliveryBoyMobile,
      status:"delivery_accepted",
      $push:{statusHistory:{status:"delivery_accepted",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* 📦 PICKUP */
app.post("/api/orders/:id/pickup", async(req,res)=>{
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status:"picked_up",
      $push:{statusHistory:{status:"picked_up",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* 🔐 GENERATE DELIVERY CODE (ONE TIME) */
app.post("/api/orders/generate-delivery-code/:id", async(req,res)=>{
  const order = await Order.findById(req.params.id);
  if(!order) return res.json({success:false});

  if(order.deliveryCode)
    return res.json({success:true,already:true});

  order.deliveryCode = Math.floor(100000 + Math.random()*900000).toString();
  order.deliveryCodeTime = new Date();
  order.status = "delivery_code_generated";
  order.statusHistory.push({
    status:"delivery_code_generated",
    time:Date.now()
  });

  await order.save();
  res.json({success:true});
});

/* 🔓 VERIFY DELIVERY CODE */
app.post("/api/orders/verify-delivery-code/:id", async(req,res)=>{
  const {code} = req.body;
  const order = await Order.findById(req.params.id);
  if(!order) return res.json({success:false});

  if(order.deliveryCode !== code)
    return res.json({success:false});

  order.status = "delivered";
  order.statusHistory.push({
    status:"delivered",
    time:Date.now()
  });
  await order.save();

  res.json({success:true});
});

/* 📄 GET ORDERS */

/* WHOLESALER */
app.get("/api/orders/wholesaler/:wid", async(req,res)=>{
  const o = await Order.find({wholesalerId:req.params.wid})
                       .sort({createdAt:-1});
  res.json({success:true,orders:o});
});

/* RETAILER */
app.get("/api/orders/retailer/:mobile", async(req,res)=>{
  const o = await Order.find({retailerMobile:req.params.mobile})
                       .sort({createdAt:-1});
  res.json({success:true,orders:o});
});

/* DELIVERY */
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
