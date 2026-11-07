import mongoose from 'mongoose'
import { env } from '../config/env.js'

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    unique: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    required: true,
  },
  storageQuotaBytes: { type: Number, required: true, default: env.defaultStorageQuotaBytes, min: 1 },
  usedStorageBytes: { type: Number, required: true, default: 0, min: 0 },
}, {
  timestamps: true,
  versionKey: false,
})

const User = mongoose.model('User', userSchema)

export default User
