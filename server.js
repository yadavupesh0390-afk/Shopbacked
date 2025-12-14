// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = "sabkasathi_secret";

// ===== MIDDLEWARE =====
app.use(cors());
app.use(bodyParser.json());

// ===== MONGODB ATLAS =====
mongoose.connect(
  'mongodb+srv://yadavupesh39_db_user:SHJAjSJTIUfPiWyk@cluster0.uapmdte.mongodb.net/sabka_sathi?retryWrites=true&w=majority',
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log("MongoDB error:", err));

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  password: String,
  role: String,
  extra: Object
});
const User = mongoose.model('User', userSchema);

// ===== SIGNUP =====
app.post('/api/signup', async (req, res) => {
  const { name, mobile, password, role, ...rest } = req.body;
  if(!name || !mobile || !password || !role)
    return res.json({ success: false, message: "Missing fields" });

  const existing = await User.findOne({ mobile, role });
  if(existing) return res.json({ success: false, message: "User already exists" });

  const hash = await bcrypt.hash(password, 10);
  const user = new User({ name, mobile, password: hash, role, extra: rest });
  await user.save();

  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, userId: user._id });
});

// ===== LOGIN =====
app.post('/api/login', async (req, res) => {
  const { mobile, password, role } = req.body;
  if(!mobile || !password || !role)
    return res.json({ success: false, message: "Missing fields" });

  const user = await User.findOne({ mobile, role });
  if(!user) return res.json({ success: false, message: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if(!match) return res.json({ success: false, message: "Incorrect password" });

  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, userId: user._id });
});

// ===== GET PROFILE =====
app.get('/api/me', async (req,res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if(!token) return res.json({ success: false, message: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    res.json({ success: true, user });
  } catch(err) {
    res.json({ success: false, message: "Invalid token" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
