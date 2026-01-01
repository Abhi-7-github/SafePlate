import mongoose from 'mongoose';

export async function connectMongoIfConfigured() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) return { connected: false, reason: 'MONGO_URI not set' };

  await mongoose.connect(mongoUri);
  return { connected: true };
}
