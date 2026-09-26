import { v2 as cloudinary } from "cloudinary";

const connectCloudinary = () => {
  const { CLOUD_NAME, CLOUD_API_KEY, CLOUD_SECRET_KEY } = process.env;
  if (!CLOUD_NAME || !CLOUD_API_KEY || !CLOUD_SECRET_KEY) {
    throw new Error("Cloudinary credentials are missing. Set CLOUD_NAME, CLOUD_API_KEY and CLOUD_SECRET_KEY in backend/.env");
  }

  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: CLOUD_API_KEY,
    api_secret: CLOUD_SECRET_KEY,
    secure: true,
  });

  console.log("Cloudinary Connected");
};

export { cloudinary };
export default connectCloudinary;
