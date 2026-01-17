import express from "express";
import Wholesaler from "./server.js";
import admin from "./firebaseAdmin.js";

const router = express.Router();

router.post("/saveToken", async (req,res)=>{
  const { userId, role, fcmToken } = req.body;
  if(!userId || !fcmToken) return res.status(400).json({success:false});

  const user = await Wholesaler.findByIdAndUpdate(userId,{ fcmToken });
  console.log("✅ TOKEN SAVED:", fcmToken);

  res.json({success:true});
});

export default router;
