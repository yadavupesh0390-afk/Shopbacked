require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Image upload ke liye limit

/* ================= MONGO CONNECT ================= */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log("Mongo error",err));

/* ================= USER SCHEMA ================= */
const userSchema = new mongoose.Schema({
  role:String,

  /* COMMON */
  name:String,
  mobile:String,
  password:String,

  /* WHOLESALER / RETAILER */
  shop_current_location:String,

  /* DELIVERY BOY */
  alternate_mobile_optional:String,
  current_live_location:String, // {lat,lng,time}
  vehicle:String,
  vehicle_model:String,
  vehicle_number:String,

  /* ADMIN */
  full_name:String,
  official_mobile_number:String,
  login_mobile:String
},{timestamps:true});

const User = mongoose.model("User",userSchema);

/* ================= PRODUCT SCHEMA ================= */
const productSchema = new mongoose.Schema({
  wholesalerId: { type:String, required:true },
  productName: { type:String, required:true },
  price: { type:Number, required:true },
  detail: String,
  image: { type:String, required:true },
  shopName: String,
  mobile: String,
  address: String
},{timestamps:true});

const Product = mongoose.model("Product", productSchema);

/* ================= ORDER SCHEMA ================= */
const orderSchema = new mongoose.Schema({
  wholesalerId: { type:String, required:true },
  productId: String,
  productName: String,
  price: Number,
  productImg: String,
  retailerName: String,
  retailerMobile: String,
  txnId: String,
  proofImg: String,
  deliveryBoyId: String,
  status: { type:String, default:"pending" },
  statusTime: { type:Number, default:Date.now }
},{timestamps:true});

const Order = mongoose.model("Order", orderSchema);

/* ================= SIGNUP ================= */
app.post("/api/signup", async (req,res)=>{
  try{
    const data = req.body;
    const { role, password } = data;

    const mobile =
      data.mobile ||
      data.upi_mobile_number ||
      data.mobile_number ||
      data.login_mobile;

    if(!role || !password || !mobile){
      return res.json({success:false,message:"Missing required fields"});
    }

    const exists = await User.findOne({ mobile, role });
    if(exists){
      return res.json({success:false,message:"User already exists"});
    }

    const hashed = await bcrypt.hash(password,10);

    const user = new User({
      ...data,
      mobile,
      password:hashed
    });

    await user.save();

    const token = jwt.sign(
      {id:user._id,role:user.role},
      process.env.JWT_SECRET,
      {expiresIn:"7d"}
    );

    res.json({
      success:true,
      message:"Signup successful",
      token,
      userId:user._id
    });

  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= LOGIN ================= */
app.post("/api/login", async (req,res)=>{
  try{
    const { mobile, password, role } = req.body;

    if(!mobile || !password || !role){
      return res.json({success:false,message:"Missing fields"});
    }

    const user = await User.findOne({ mobile, role });
    if(!user){
      return res.json({success:false,message:"User not found"});
    }

    const ok = await bcrypt.compare(password,user.password);
    if(!ok){
      return res.json({success:false,message:"Wrong password"});
    }

    const token = jwt.sign(
      {id:user._id,role:user.role},
      process.env.JWT_SECRET,
      {expiresIn:"7d"}
    );

    res.json({
      success:true,
      message:"Login success",
      token,
      userId:user._id
    });

  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= ADD PRODUCT ================= */
app.post("/api/products", async (req,res)=>{
  try{
    const {
      wholesalerId,
      productName,
      price,
      detail,
      image,
      shopName,
      mobile,
      address
    } = req.body;

    if(!wholesalerId || !productName || !price || !image){
      return res.json({success:false,message:"Missing required fields"});
    }

    const product = await Product.create({
      wholesalerId,
      productName,
      price,
      detail,
      image,
      shopName,
      mobile,
      address
    });

    res.json({success:true,product});

  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= GET PRODUCTS BY WHOLESALER ================= */
app.get("/api/products/wholesaler/:wid", async (req,res)=>{
  try{
    const products = await Product.find({wholesalerId:req.params.wid}).sort({createdAt:-1});
    res.json({success:true,products});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= PLACE ORDER ================= */
app.post("/api/orders", async (req,res)=>{
  try{
    const {
      wholesalerId,
      productId,
      productName,
      price,
      productImg,
      retailerName,
      retailerMobile,
      txnId,
      proofImg
    } = req.body;

    if(!wholesalerId || !productName || !price || !retailerName || !retailerMobile){
      return res.json({success:false,message:"Missing fields"});
    }

    const order = await Order.create({
      wholesalerId,
      productId,
      productName,
      price,
      productImg,
      retailerName,
      retailerMobile,
      txnId,
      proofImg,
      status:"pending",
      statusTime:Date.now()
    });

    res.json({success:true,order});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= GET ORDERS BY WHOLESALER ================= */
app.get("/api/orders/wholesaler/:wid", async (req,res)=>{
  try{
    const orders = await Order.find({wholesalerId:req.params.wid}).sort({createdAt:-1});
    res.json({success:true,orders});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= GET ORDERS BY RETAILER ================= */
app.get("/api/orders/retailer/:mobile", async (req,res)=>{
  try{
    const orders = await Order.find({retailerMobile:req.params.mobile}).sort({createdAt:-1});
    res.json({success:true,orders});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= DELIVERY BOY LIVE LOCATION ================= */
app.post("/api/delivery/location", async (req,res)=>{
  try{
    const { deliveryBoyId, lat, lng } = req.body;
    if(!deliveryBoyId || !lat || !lng){
      return res.json({success:false,message:"Missing fields"});
    }

    const loc = {
      lat,
      lng,
      time: Date.now()
    };

    const user = await User.findByIdAndUpdate(deliveryBoyId,{
      current_live_location: loc
    },{new:true});

    res.json({success:true,message:"Location updated",location:loc});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= GET DELIVERY BOY LOCATION ================= */
app.get("/api/delivery/location/:id", async (req,res)=>{
  try{
    const user = await User.findById(req.params.id);
    if(!user) return res.json({success:false,message:"Delivery boy not found"});
    res.json({success:true,location:user.current_live_location});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= TEST ROUTE ================= */
app.get("/",(req,res)=>{
  res.send("Sabka Sathi Backend Running ✅");
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log("Server running on",PORT));
