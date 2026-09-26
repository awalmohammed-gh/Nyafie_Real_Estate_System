import express from "express"
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import { ensureAdmin } from "./utils/ensureAdmin.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import propertyRoutes from "./routes/propertyRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import inquiryRoutes from "./routes/inquiryRoutes.js";
import planRoutes from "./routes/planRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import settingRoutes from "./routes/settingRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { listConversations } from "./controllers/chatController.js";
import { protect } from "./middleware/authMiddleware.js";


//app config
const app = express()
const port = process.env.PORT || 4000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

if (!process.env.JWT_KEY) {
   console.error("JWT_KEY is not set in backend/.env");
   process.exit(1);
}


//middleware
// Property photos arrive as compressed data URIs, so allow larger JSON bodies
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());
app.use(cors({ origin: clientUrl, credentials: true }));


//database & media storage
try {
   await connectDB()
   connectCloudinary()
   await ensureAdmin()
} catch (error) {
   console.error("Startup failed:", error.message);
   process.exit(1);
}


//api endpoints
app.get('/' , (req , res)=>{
   res.send('HomeBase API is running')
})

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/conversations", chatRoutes);
app.get("/api/messages", protect, listConversations("customer")); // conversations the user started

app.use("/api", (req, res) => res.status(404).json({ success: false, message: "Endpoint not found." }));

// Errors: users get a safe message, details stay in the server log
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
   if (err.status && err.status < 500) {
      return res.status(err.status).json({ success: false, message: err.message });
   }
   if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: Object.values(err.errors)[0]?.message || "Invalid data." });
   }
   if (err.type === "entity.too.large") {
      return res.status(413).json({ success: false, message: "Upload is too large. Try fewer or smaller photos." });
   }
   console.error(err);
   res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});


//listen to server
app.listen(port, () =>console.log(`listen to server on ${port} http://localhost:${port}`));
