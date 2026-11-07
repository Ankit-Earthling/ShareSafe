import mongoose from 'mongoose'

const storedFileSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  storageKey: { type: String, required: true, unique: true, select: false },
  storageProvider: { type: String, enum: ['local', 'b2'], default: 'local', required: true, select: false },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  scanStatus: { type: String, enum: ['pending', 'clean', 'suspicious', 'infected', 'failed'], default: 'clean', required: true, index: true },
  storageAccounted: { type: Boolean, default: true, required: true },
}, { timestamps: true, versionKey: false })

export default mongoose.model('StoredFile', storedFileSchema)
