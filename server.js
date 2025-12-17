require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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
  // Wholesaler Info
  wholesalerId: { type: String, required: true },
  wholesalerName: { type: String, required: true },
  wholesalerMobile: { type: String, required: true },
  wholesalerAddress: { type: String, required: true },

  // Product Info
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  price: { type: Number, required: true },
  productImg: { type: String, required: true },

  // Retailer Info
  retailerName: { type: String, required: true },
  retailerMobile: { type: String, required: true },
  retailerAddress: { type: String, required: true },

  // Payment & Vehicle
  txnId: { type: String, required: true },
  proofImg: { type: String, required: true },
  vehicleType: { type: String, enum: ["two_wheeler", "three_wheeler", "four_wheeler"], required: true },

  // Delivery Boy Info
  deliveryBoyId: { type: String, default: null },
  deliveryBoyName: { type: String, default: null },
  deliveryBoyMobile: { type: String, default: null },

  // Order Status
  status: { type: String, default: "pending" }, // pending, confirmed_by_wholesaler, assigned_to_delivery, delivery_accepted, picked_up, delivered
  statusHistory: [{
    status: String,
    time: Number
  }],

  // Auto Generated Delivery Code
  deliveryCode: { type: String, default: null }

}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);

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
    console.log(err);
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

/* ================= GET PRODUCTS ================= */
app.get("/api/products/wholesaler/:shortId", async(req,res)=>{
  const sid = req.params.shortId.toLowerCase();
  const products = await Product.find({
    wholesalerId:{ $regex:"^"+sid, $options:"i" }
  });
  res.json({success:true,products});
});

/* ================= PLACE ORDER ================= */
app.post("/api/orders", async (req, res) => {
  try {
    const order = await Order.create({
      ...req.body,
      status: "pending",
      statusHistory: [{ status: "pending", time: Date.now() }]
    });

    // Notify delivery boys
    io.emit("newOrder", order);

    res.json({ success: true, order });

  } catch (err) {
    console.error("ORDER ERROR ❌", err.message);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
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

  // Notify delivery boys about new confirmed order
  io.emit("order_confirmed", o);

  res.json({success:true,order:o});
});

/* ================= ASSIGN DELIVERY ================= */
app.post("/api/orders/:id/assign-delivery", async(req,res)=>{
  const {deliveryBoyId, deliveryBoyName, deliveryBoyMobile} = req.body;
  const deliveryCode = Math.floor(100000 + Math.random() * 900000).toString();

  const o = await Order.findByIdAndUpdate(
    req.params.id,
    {
      deliveryBoyId,
      deliveryBoyName,
      deliveryBoyMobile,
      deliveryCode,
      status:"assigned_to_delivery",
      $push:{statusHistory:{status:"assigned_to_delivery",time:Date.now()}}
    },
    {new:true}
  );

  io.emit("delivery_assigned", o);
  res.json({success:true,order:o});
});

/* ================= DELIVERY ACCEPT ================= */
app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const { deliveryBoyId, deliveryBoyName, deliveryBoyMobile } = req.body;

  const order = await Order.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "confirmed_by_wholesaler" // ⚠️ only once
    },
    {
      deliveryBoyId,
      deliveryBoyName,
      deliveryBoyMobile,
      status: "delivery_accepted",
      $push:{
        statusHistory:{
          status:"delivery_accepted",
          time:Date.now()
        }
      }
    },
    { new:true }
  );

  if(!order){
    return res.json({success:false,message:"Already accepted"});
  }

  // 🔔 Retailer ko notify
  io.emit("delivery_assigned_to_retailer", order);

  res.json({success:true,order});
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

  io.emit("order_picked", o);
  res.json({success:true,order:o});
});

/* ================= DELIVERED ================= */
app.post("/api/orders/:id/delivered", async(req,res)=>{
  const {deliveryCode} = req.body;
  const order = await Order.findById(req.params.id);
  if(order.deliveryCode !== deliveryCode)
    return res.json({success:false,message:"Invalid delivery code"});

  order.status = "delivered";
  order.statusHistory.push({status:"delivered",time:Date.now()});
  await order.save();

  io.emit("order_delivered", order);
  res.json({success:true,order});
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

app.get("/api/orders/delivery/:deliveryBoyId", async(req,res)=>{
  const { deliveryBoyId } = req.params;

  const orders = await Order.find({
    $or:[
      { status:"confirmed_by_wholesaler", deliveryBoyId: null },
      { deliveryBoyId }
    ]
  }).sort({createdAt:-1});

  res.json({ success:true, orders });
});

/* ================= SOCKET.IO ================= */
io.on("connection", socket=>{
  console.log("New client connected:", socket.id);

  socket.on("disconnect", ()=>{
    console.log("Client disconnected:", socket.id);
  });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
server.listen(PORT,()=>console.log("Server running on port",PORT));
