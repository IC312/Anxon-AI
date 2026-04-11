const mongoose = require('mongoose');

const convSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:  { type: String, default: 'Hội thoại mới' },
}, { timestamps: true });

// Tự động xóa conversation không dùng sau 1 năm
convSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('Conversation', convSchema);
