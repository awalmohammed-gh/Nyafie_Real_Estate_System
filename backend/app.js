import express from "express"
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initializeBackend } from "./config/initialize.js";
import seoRoutes from "./routes/seoRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
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
import contactRoutes from "./routes/contactRoutes.js";
import { listConversations } from "./controllers/chatController.js";
import { protectCustomer } from "./middleware/authMiddleware.js";
import { allowedOrigins, limits, originCheck, rejectOperatorKeys, securityHeaders } from "./middleware/security.js";


// Exported without a listener: Vercel imports the app; server.js starts local development.
export const createApp = ({ initialize = initializeBackend } = {}) => {
  const app = express();

  //middleware
  app.disable("x-powered-by");
  // Behind a reverse proxy (Render, Railway, Nginx...) set TRUST_PROXY=1 so rate limits see real client IPs
  if (process.env.VERCEL) app.set("trust proxy", 1);
  else if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use("/api", securityHeaders);
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins().includes(origin)), credentials: true }));
  // Individual image uploads are <= 3 MB; listing saves contain only cloud URLs.
  app.use(express.json({ limit: "4mb" }));
  app.use(rejectOperatorKeys);
  app.use(cookieParser());
  app.use("/api", originCheck);


  // One connection/bootstrap promise is reused across concurrent function requests.
  app.use(async (_req, res, next) => {
    try { await initialize(); next(); }
    catch (error) {
      console.error("Backend initialization failed:", error.message);
      res.status(503).json({ success: false, message: "Service is temporarily unavailable. Please try again." });
    }
  });

  //api endpoints
  app.use("/api", limits.api);
  app.get("/api/health", (_req, res) => res.json({ success: true, service: "HomeBase" }));

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
  app.use("/api/contact", contactRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.get("/api/messages", protectCustomer, listConversations("customer")); // conversations the user started

  app.use("/api", (req, res) => res.status(404).json({ success: false, message: "Endpoint not found." }));

  app.use(seoRoutes);

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


  return app;
};

export default createApp();
