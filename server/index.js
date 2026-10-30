
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const userMedicineRoutes = require("./routes/userMedicine.routes");
const vendorRoutes = require("./routes/vendor.routes.js");
const orderRoutes = require("./routes/order.routes");

const { connectDB } = require("./config/db");

const medicineDetailsRoutes = require("./routes/medicineDetails");
// Initialize express app
const app = express();
const PORT = process.env.PORT || 5002;

// Middlewares
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://offline-pole-cannon-journals.trycloudflare.com",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/user-medicines", userMedicineRoutes);
app.use("/api/medicine-details", medicineDetailsRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/orders", orderRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "Server is running" });
});

// Connect to MongoDB
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
