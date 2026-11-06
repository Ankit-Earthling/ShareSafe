import mongoose from 'mongoose'

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  return mongoose.connection
}

export function databaseIsConnected() {
  return mongoose.connection.readyState === 1
}
