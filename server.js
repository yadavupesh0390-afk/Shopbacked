require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

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

  /* DELIVERY */
  alternate_mobile_optional:String,
  current_live_location:String,
  vehicle:String,
  vehicle_model:String,
  vehicle_number:String,

  /* ADMIN */
  full_name:String,
  official_mobile_number:String,
  login_mobile:String
},{timestamps:true});

const User = mongoose.model("User",userSchema);

/* ================= SIGNUP ================= */
app.post("/api/signup", async (req,res)=>{
  try{
    const data = req.body;
    const { role, password } = data;

    // 🔑 mobile detection (frontend compatible)
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
    res.status(500).json({success:false,message:"Server error"});
  }
});

/* ================= TEST ================= */
app.get("/",(req,res)=>{
  res.send("Sabka Sathi Backend Running ✅");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log("Server running on",PORT));
