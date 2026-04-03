/**
 * Tạo tài khoản admin lần đầu:
 *   node scripts/create-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');

const ADMIN_NAME     = 'Admin';        // ← tên đăng nhập admin
const ADMIN_PASSWORD = 'Admin@123456'; // ← đổi mật khẩu mạnh hơn

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅  Kết nối MongoDB thành công');

  const exists = await User.findOne({ role: 'admin' });
  if (exists) {
    console.log('⚠️   Admin đã tồn tại:', exists.fullName);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.create({
    username: 'admin',
    passwordHash,
    fullName: ADMIN_NAME,
    className: '',
    role: 'admin',
  });

  console.log('🎉  Tạo admin thành công!');
  console.log('    Tên     :', ADMIN_NAME);
  console.log('    Password:', ADMIN_PASSWORD);
  console.log('    Lớp     : (để trống khi đăng nhập)');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
