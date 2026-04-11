/**
 * Tạo tài khoản admin lần đầu:
 *   node scripts/create-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');

const ADMIN_USERNAME = 'admin';        // ← dùng làm "CCCD" khi đăng nhập
const ADMIN_PASSWORD = 'Admin@123456'; // ← đổi thành mật khẩu mạnh!
const ADMIN_NAME     = 'Quản Trị Viên';

async function main() {
  await mongoose.connect(process.env.MONGODB_HSNBK);
  console.log('✅  Kết nối MongoDB thành công');

  const exists = await User.findOne({ username: ADMIN_USERNAME });
  if (exists) { console.log('⚠️  Admin đã tồn tại'); process.exit(0); }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.create({
    username: ADMIN_USERNAME,
    passwordHash,
    fullName: ADMIN_NAME,
    role: 'admin',
    mustChangePassword: false,
  });

  console.log('🎉  Tạo admin thành công!');
  console.log('    Nhập vào ô CCCD:', ADMIN_USERNAME);
  console.log('    Mật khẩu       :', ADMIN_PASSWORD);
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
