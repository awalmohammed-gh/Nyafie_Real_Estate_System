import express from "express"
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import { ensureAdmin } from "./utils/ensureAdmin.js";
import { checkPaystackConfig } from "./utils/paystack.js";
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
import offerRoutes from "./routes/offerRoutes.js";
import rentalRoutes from "./routes/rentalRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import saleRequestRoutes from "./routes/saleRequestRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import { listConversations } from "./controllers/chatController.js";
import { protectCustomer } from "./middleware/authMiddleware.js";
import { allowedOrigins, checkJwtKey, limits, originCheck, rejectOperatorKeys, securityHeaders } from "./middleware/security.js";


//app config
const app = express()
const port = process.env.PORT || 4000;

if (!process.env.JWT_KEY) {
   console.error("JWT_KEY is not set in backend/.env");
   process.exit(1);
}
if (!checkJwtKey()) process.exit(1); // production refuses a short, guessable signing key


//middleware
app.disable("x-powered-by");
// Behind a reverse proxy (Render, Railway, Nginx...) set TRUST_PROXY=1 so rate limits see real client IPs
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(securityHeaders);
app.use(cors({ origin: allowedOrigins(), credentials: true }));
app.use("/api", limits.api);
// Photos arrive as compressed data URIs, so only the endpoints that take images accept large bodies
const IMAGE_UPLOADS = /^\/api\/(properties(\/[a-f\d]{24})?|admin\/properties(\/[a-f\d]{24})?|agents\/(application|profile)|admin\/settings\/[a-z]+)$/i;
const largeJson = express.json({ limit: "30mb" });
const smallJson = express.json({ limit: "1mb" });
app.use((req, res, next) => (["POST", "PUT"].includes(req.method) && IMAGE_UPLOADS.test(req.path) ? largeJson : smallJson)(req, res, next));
app.use(rejectOperatorKeys);
app.use(cookieParser());
app.use("/api", originCheck);


//database & media storage
try {
   await connectDB()
   connectCloudinary()
   await ensureAdmin()
   checkPaystackConfig()
} catch (error) {
   console.error("Startup failed:", error.message);
   process.exit(1);
}


//api endpoints
app.get('/' , (req , res)=>{
   res.send('HomeBase API is running')
})

// Brute-force and abuse limits on sensitive endpoints (before the routes they protect)
app.post("/api/auth/admin/login", limits.adminLogin);
app.post(["/api/auth/login", "/api/auth/customer/login", "/api/auth/agent/login"], limits.login);
app.post(["/api/auth/register", "/api/auth/customer/register", "/api/auth/agent/register"], limits.register);
app.put(["/api/auth/me/password", "/api/auth/customer/me/password", "/api/auth/agent/me/password", "/api/auth/admin/me/password", "/api/admin/account"], limits.password);
app.use(["/api/payments", "/api/subscriptions/initialize", "/api/subscriptions/verify"], limits.payments);
app.post(["/api/inquiries", "/api/offers", "/api/rentals", "/api/sale-requests", "/api/conversations", "/api/properties/:id/reviews"], limits.contact);

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
app.use("/api/offers", offerRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/sale-requests", saleRequestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reviews", reviewRoutes);
app.get("/api/messages", protectCustomer, listConversations("customer")); // conversations the user started

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
