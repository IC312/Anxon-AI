const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true },  // tên đăng nhập
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['student', 'admin'], default: 'student' },
  fullName:     { type: String, required: true, trim: true },  // tên hiển thị
  className:    { type: String, default: '', trim: true },     // e.g. "10A1"
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
