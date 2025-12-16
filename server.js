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
  current_live_location:{lat:Number,lng:Number},
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
  wholesalerId:String,
  productId:String,
  productName:String,
  price:Number,
  productImg:String,
  retailerName:String,
  retailerMobile:String,
  retailerShop:String,
  retailerAddress:String,
  txnId:String,
  proofImg:String,
  vehicleRequired:String, // two/three/four
  deliveryBoyId:String,
  status:{ type:String, default:"pending" },
  statusHistory:[{status:String,time:Number}],
  pickupCode:String
},{timestamps:true});

const Order = mongoose.model("Order",orderSchema);

/* ================= AUTH ================= */
app.post("/api/signup", async(req,res)=>{
  try{
    const { role, password } = req.body;
    const mobile = req.body.mobile || req.body.login_mobile;
    if(!role || !password || !mobile)
      return res.json({success:false,message:"Missing fields"});
    const exists = await User.findOne({mobile,role});
    if(exists) return res.json({success:false,message:"User exists"});
    const hashed = await bcrypt.hash(password,10);
    const user = await User.create({...req.body,mobile,password:hashed});
    const token = jwt.sign({id:user._id,role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
    res.json({success:true,token,userId:user._id});
  }catch(err){res.status(500).json({success:false});}
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

/* ================= LOCATION UPDATE ================= */
app.post("/api/delivery/location", async(req,res)=>{
  const {deliveryBoyId,lat,lng} = req.body;
  await User.findByIdAndUpdate(deliveryBoyId,{current_live_location:{lat,lng}});
  res.json({success:true});
});

/* ================= ADD PRODUCT ================= */
app.post("/api/products", async(req,res)=>{
  const p = await Product.create(req.body);
  res.json({success:true,product:p});
});

/* ================= GET PRODUCTS ================= */
app.get("/api/products/wholesaler/:wid", async(req,res)=>{
  const products = await Product.find({wholesalerId:req.params.wid});
  res.json({success:true,products,success:true});
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
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status:"confirmed_by_wholesaler",
      $push:{statusHistory:{status:"confirmed_by_wholesaler",time:Date.now()}}
    },
    {new:true}
  );

  // Send to all delivery boys matching vehicle
  const deliveryBoys = await User.find({role:"delivery"});
  deliveryBoys.forEach(db=>{
    io.to(db._id.toString()).emit("newOrder", order);
  });

  res.json({success:true,order});
});

/* ================= DELIVERY ACTIONS ================= */
app.post("/api/orders/:id/assign-delivery", async(req,res)=>{
  const {deliveryBoyId} = req.body;
  const o = await Order.findByIdAndUpdate(req.params.id,{
    deliveryBoyId,
    status:"delivery_assigned",
    $push:{statusHistory:{status:"delivery_assigned",time:Date.now()}}
  },{new:true});
  io.to(deliveryBoyId).emit("newOrder", o);
  res.json({success:true,order:o});
});

app.post("/api/orders/:id/delivery-accept", async(req,res)=>{
  const o = await Order.findByIdAndUpdate(req.params.id,{
    status:"delivery_accepted",
    $push:{statusHistory:{status:"delivery_accepted",time:Date.now()}}
  },{new:true});
  io.to(o.deliveryBoyId).emit("updateOrder", o);
  res.json({success:true,order:o});
});

app.post("/api/orders/:id/pickup", async(req,res)=>{
  const pickupCode = Math.random().toString(36).substring(2,8).toUpperCase();
  const o = await Order.findByIdAndUpdate(req.params.id,{
    status:"picked_up",
    pickupCode,
    $push:{statusHistory:{status:"picked_up",time:Date.now()}}
  },{new:true});

  // Send code to retailer (simulate)
  console.log("Pickup code for retailer:", pickupCode);

  io.to(o.deliveryBoyId).emit("updateOrder", o);
  res.json({success:true,order:o});
});

app.post("/api/orders/:id/delivered", async(req,res)=>{
  const {enteredCode} = req.body;
  const o = await Order.findById(req.params.id);
  if(o.pickupCode!==enteredCode) return res.json({success:false,message:"Invalid code"});
  o.status="delivered";
  o.statusHistory.push({status:"delivered",time:Date.now()});
  await o.save();
  io.to(o.deliveryBoyId).emit("updateOrder", o);
  res.json({success:true,order:o});
});

/* ================= GET AVAILABLE ORDERS FOR DELIVERY ================= */
app.get("/api/orders/delivery/available", async(req,res)=>{
  const orders = await Order.find({status:"confirmed_by_wholesaler"});
  res.json({success:true,orders});
});

/* ================= SOCKET.IO ================= */
io.on("connection", socket=>{
  console.log("New connection:", socket.id);

  socket.on("join", userId=>{
    socket.join(userId);
  });

});

const PORT = process.env.PORT || 5000;
server.listen(PORT,()=>console.log("Server running",PORT));
