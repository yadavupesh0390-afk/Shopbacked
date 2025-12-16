const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let orders = []; // In-memory orders (Demo purpose)
let deliveryBoys = {}; // Connected delivery boy sockets

// ======= Socket.io =======
io.on("connection", socket => {
  console.log("Socket connected: ", socket.id);

  // Delivery boy register
  socket.on("registerDeliveryBoy", id => {
    deliveryBoys[id] = socket.id;
    console.log("Delivery boy registered:", id);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (let id in deliveryBoys) {
      if (deliveryBoys[id] === socket.id) delete deliveryBoys[id];
    }
    console.log("Socket disconnected:", socket.id);
  });
});

// ======= API =======

// Place order (Retailer)
app.post("/api/orders", (req, res) => {
  const order = { 
    _id: uuidv4(),
    ...req.body, 
    status: "pending",
    autoCode: null 
  };
  orders.push(order);
  res.json({ success: true, order });
});

// Wholesaler confirm order
app.post("/api/orders/:id/confirm", (req, res) => {
  const order = orders.find(o => o._id === req.params.id);
  if (!order) return res.status(404).json({ success: false });
  order.status = "confirmed_by_wholesaler";

  // Notify all delivery boys
  for (let socketId of Object.values(deliveryBoys)) {
    io.to(socketId).emit("newOrder", order);
  }
  res.json({ success: true, order });
});

// Delivery boy accept order
app.post("/api/orders/:id/accept", (req, res) => {
  const order = orders.find(o => o._id === req.params.id);
  if (!order) return res.status(404).json({ success: false });
  order.status = "delivery_accepted";
  order.deliveryBoy = req.body.deliveryBoy;

  res.json({ success: true, order });
});

// Pickup
app.post("/api/orders/:id/pickup", (req, res) => {
  const order = orders.find(o => o._id === req.params.id);
  if (!order) return res.status(404).json({ success: false });
  order.status = "pickup";

  // Generate auto-code for retailer
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  order.autoCode = code;

  // Notify retailer via socket
  io.emit("orderPicked", {
    retailerMobile: order.retailerMobile,
    productName: order.productName,
    code
  });

  res.json({ success: true, order });
});

// Deliver
app.post("/api/orders/:id/deliver", (req, res) => {
  const order = orders.find(o => o._id === req.params.id);
  if (!order) return res.status(404).json({ success: false });
  order.status = "delivered";
  res.json({ success: true, order });
});

// Get orders by delivery boy
app.get("/api/orders/delivery/:deliveryBoyId", (req, res) => {
  const data = orders.filter(o => !o.deliveryBoy || o.deliveryBoy === req.params.deliveryBoyId);
  res.json({ orders: data });
});

// Get retailer orders
app.get("/api/orders/retailer/:mobile", (req, res) => {
  const data = orders.filter(o => o.retailerMobile === req.params.mobile);
  res.json({ orders: data });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
