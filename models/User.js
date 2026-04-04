const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  cccd:         { type: String, unique: true, sparse: true, trim: true }, // học sinh
  username:     { type: String, unique: true, sparse: true, trim: true }, // admin
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['student', 'admin'], default: 'student' },
  fullName:     { type: String, required: true, trim: true },
  className:    { type: String, default: '', trim: true },
  gender:       { type: String, default: '' },    // Nam / Nữ
  dob:          { type: String, default: '' },    // DD/MM/YYYY
  mustChangePassword: { type: Boolean, default: true }, // phải đổi pw lần đầu
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
