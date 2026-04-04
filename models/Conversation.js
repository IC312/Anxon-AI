const mongoose = require('mongoose');

const convSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:  { type: String, default: 'Hội thoại mới' },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', convSchema);
