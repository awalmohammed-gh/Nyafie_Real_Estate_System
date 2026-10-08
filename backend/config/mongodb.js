import mongoose from "mongoose";

let connecting;
mongoose.connection.on("error", (error) => console.error("MongoDB error:", error.message));

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to backend/.env");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    connecting = mongoose.connect(uri, {
      ...(process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {}),
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
    }).then(() => mongoose.connection).finally(() => { connecting = undefined; });
  }
  return connecting;
};

export default connectDB;
