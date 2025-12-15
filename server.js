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
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log("Mongo error",err));

/* ================= USER ================= */
const userSchema = new mongoose.Schema({
  role:String,
  name:String,
  mobile:String,
  password:String,

  shop_current_location:String,

  alternate_mobile_optional:String,
  current_live_location:Object,
  vehicle:String,
  vehicle_model:String,
  vehicle_number:String,

  full_name:String,
  official_mobile_number:String,
  login_mobile:String
},{timestamps:true});

const User = mongoose.model("User",userSchema);

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({
  wholesalerId:String, // FULL MONGO ID
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
  wholesalerId:String,
  productId:String,
  productName:String,
  price:Number,
  productImg:String,

  retailerName:String,
  retailerMobile:String,
  txnId:String,
  proofImg:String,

  deliveryBoyId:String,

  status:{ type:String, default:"pending" },
  statusHistory:[{
    status:String,
    time:Number
  }]
},{timestamps:true});

const Order = mongoose.model("Order",orderSchema);

/* ================= AUTH ================= */
app.post("/api/signup", async(req,res)=>{
  try{
    const { role, password } = req.body;
    const mobile =
      req.body.mobile ||
      req.body.upi_mobile_number ||
      req.body.mobile_number ||
      req.body.login_mobile;

    if(!role || !password || !mobile)
      return res.json({success:false,message:"Missing fields"});

    const exists = await User.findOne({mobile,role});
    if(exists)
      return res.json({success:false,message:"User exists"});

    const hashed = await bcrypt.hash(password,10);
    const user = await User.create({...req.body,mobile,password:hashed});

    const token = jwt.sign(
      {id:user._id,role:user.role},
      process.env.JWT_SECRET,
      {expiresIn:"7d"}
    );

    res.json({success:true,token,userId:user._id});
  }catch(err){
    res.status(500).json({success:false});
  }
});

/* ================= LOGIN ================= */
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

/* ================= ADD PRODUCT ================= */
app.post("/api/products", async(req,res)=>{
  const p = await Product.create(req.body);
  res.json({success:true,product:p});
});

/* ================= GET PRODUCTS (SHORT ID) ================= */
app.get("/api/products/wholesaler/:shortId", async(req,res)=>{
  const sid = req.params.shortId.toLowerCase();
  const products = await Product.find({
    wholesalerId:{ $regex:"^"+sid, $options:"i" }
  });
  res.json({success:true,products});
});

/* ================= PLACE ORDER ================= */
app.post("/api/orders", async(req,res)=>{
  const order = await Order.create({
    ...req.body,
    status:"pending",
    statusHistory:[{status:"pending",time:Date.now()}]
  });
  res.json({success:true,order});
});

/* ================= WHOLESALER CONFIRM ================= */
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

/* ================= ASSIGN DELIVERY ================= */
app.post("/api/orders/:id/assign-delivery", async(req,res)=>{
  const {deliveryBoyId} = req.body;
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      deliveryBoyId,
      status:"assigned_to_delivery",
      $push:{statusHistory:{status:"assigned_to_delivery",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* ================= DELIVERY ACCEPT ================= */
app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status:"delivery_accepted",
      $push:{statusHistory:{status:"delivery_accepted",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* ================= PICKUP ================= */
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

/* ================= DELIVERED ================= */
app.post("/api/orders/:id/delivered", async(req,res)=>{
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status:"delivered",
      $push:{statusHistory:{status:"delivered",time:Date.now()}}
    },
    {new:true}
  );
  res.json({success:true,order:o});
});

/* ================= GET ORDERS ================= */
app.get("/api/orders/wholesaler/:wid", async(req,res)=>{
  const o = await Order.find({wholesalerId:req.params.wid});
  res.json({success:true,orders:o});
});

app.get("/api/orders/retailer/:mobile", async(req,res)=>{
  const o = await Order.find({retailerMobile:req.params.mobile});
  res.json({success:true,orders:o});
});

/* ================= SERVER ================= */
app.get("/",(_,res)=>res.send("Backend Running ✅"));
const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log("Server running",PORT));
