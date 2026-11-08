import { Router } from "express";
import { searchPlaces } from "../controllers/geoController.js";

const router = Router();

router.get("/search", searchPlaces); // ?q, purpose=place|address, optional latitude/longitude bias (public)

export default router;
