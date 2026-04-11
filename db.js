const mongoose = require('mongoose');

// ── Cấu hình DB ───────────────────────────────────────
// DB học sinh: chứa toàn bộ tài khoản học sinh + admin
// DB khối 6-9: chỉ chứa conversations + messages
const DB_CONFIG = {
  students: process.env.MONGODB_HSNBK,  // DB danh sách học sinh
  6: process.env.MONGODB_KHOI6,
  7: process.env.MONGODB_KHOI7,
  8: process.env.MONGODB_KHOI8,
  9: process.env.MONGODB_KHOI9,
};

const connections = {};

/**
 * Lấy connection theo key ('students', 6, 7, 8, 9)
 * Tái dùng connection nếu đã kết nối rồi
 */
async function getConnection(key) {
  const uri = DB_CONFIG[key];
  if (!uri) throw new Error(`Không có DB config cho: ${key}`);

  if (connections[key] && connections[key].readyState === 1) {
    return connections[key];
  }

  const conn = await mongoose.createConnection(uri).asPromise();
  connections[key] = conn;
  console.log(`✅  DB [${key}] connected`);
  return conn;
}

/**
 * Lấy models chat (Conversation + Message) từ DB khối
 */
function getChatModels(conn) {
  const Conversation = conn.models.Conversation || conn.model('Conversation', require('./models/Conversation').schema);
  const Message      = conn.models.Message      || conn.model('Message',      require('./models/Message').schema);
  return { Conversation, Message };
}

/**
 * Lấy User model từ DB học sinh
 */
function getUserModel(conn) {
  return conn.models.User || conn.model('User', require('./models/User').schema);
}

module.exports = { getConnection, getChatModels, getUserModel };
