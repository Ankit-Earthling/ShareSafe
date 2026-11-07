import mongoose from 'mongoose'

const shareLinkSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  file: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', required: true, index: true },
  permission: { type: String, enum: ['allowDownload', 'viewOnly'], default: 'allowDownload', required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  tokenSeed: { type: String, required: true, select: false },
  passwordHash: { type: String, select: false },
  expiresAt: { type: Date, required: true, index: true },
  maxAccesses: { type: Number, required: true, min: 1, max: 1000 },
  accessCount: { type: Number, required: true, default: 0, min: 0 },
  accessHistory: [{ _id: false, accessedAt: { type: Date, required: true } }],
  revokedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false })

export default mongoose.model('ShareLink', shareLinkSchema)
