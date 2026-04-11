const router       = require('express').Router();
const { authMiddleware } = require('../middleware/auth');
const { getConnection, getChatModels } = require('../db');

router.use(authMiddleware);

// ── Rate limit: 30 tin nhắn/phút mỗi tài khoản ───────
const rateLimitMap = new Map(); // userId → { count, resetAt }

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    // Reset mỗi 1 phút
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }

  if (entry.count >= 30) return false;

  entry.count++;
  return true;
}

// Dọn dẹp Map mỗi 5 phút để tránh memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

async function models(req) {
  const conn = await getConnection(req.user.grade);
  return getChatModels(conn);
}

// ── Tạo conversation mới ──────────────────────────────
router.post('/conversations', async (req, res) => {
  try {
    const { Conversation } = await models(req);
    const conv = await Conversation.create({
      userId: req.user.id,
      title:  req.body.title || 'Hội thoại mới',
    });
    res.status(201).json(conv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Danh sách conversations ───────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const { Conversation } = await models(req);
    const convs = await Conversation.find({ userId: req.user.id })
      .sort({ updatedAt: -1 }).lean();
    res.json(convs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Đổi tên conversation ──────────────────────────────
router.patch('/conversations/:id', async (req, res) => {
  try {
    const { Conversation } = await models(req);
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Thiếu title' });
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { title: title.slice(0, 80) },
      { new: true }
    );
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ ok: true, title: conv.title });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Xoá conversation ──────────────────────────────────
router.delete('/conversations/:id', async (req, res) => {
  try {
    const { Conversation, Message } = await models(req);
    const conv = await Conversation.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });
    await Message.deleteMany({ conversationId: conv._id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lấy messages ──────────────────────────────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { Conversation, Message } = await models(req);
    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });
    const msgs = await Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean();
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lưu 1 tin nhắn ───────────────────────────────────
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    // Kiểm tra rate limit trước
    if (!checkRateLimit(req.user.id)) {
      return res.status(429).json({ error: 'Bạn nhắn tin quá nhanh! Vui lòng chờ một chút rồi thử lại.' });
    }

    const { Conversation, Message } = await models(req);
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'Thiếu dữ liệu' });

    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });

    const msg = await Message.create({ conversationId: conv._id, role, content });
    await Conversation.findByIdAndUpdate(conv._id, { updatedAt: new Date() });
    res.status(201).json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Proxy AI → SiliconFlow ────────────────────────────
const { Readable } = require('stream');
const SILICONFLOW_URL = 'https://api.siliconflow.com/v1/chat/completions';
const AI_MODEL        = 'zai-org/GLM-5.1';

// Bản đồ lỗi HTTP → thông báo tiếng Việt
const SF_ERRORS = {
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'API key không hợp lệ. Vui lòng kiểm tra cấu hình.',
  404: 'Model AI không tồn tại.',
  429: 'Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây.',
  503: 'Dịch vụ AI tạm thời không khả dụng. Thử lại sau.',
  504: 'AI phản hồi quá lâu, vui lòng thử lại.',
};

router.post('/ai', async (req, res) => {
  try {
    // Rate limit
    if (!checkRateLimit(req.user.id)) {
      return res.status(429).json({ error: 'Bạn nhắn tin quá nhanh! Vui lòng chờ một chút rồi thử lại.' });
    }

    const { messages, max_tokens = 2048, temperature = 0.7, stream = true } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Thiếu dữ liệu messages' });
    }

    // Payload gửi lên SiliconFlow theo docs
const payload = {
  model: AI_MODEL,
  messages,
  stream: true, // Luôn ưu tiên stream để học sinh thấy chữ chạy ngay, đỡ sốt ruột
  max_tokens: 4096, // Đủ cho các bài văn dài hoặc giải code Python/Node.js
  temperature: 0.6, // Giảm xuống một chút để tăng độ chuẩn xác
  top_p: 0.85,      // Hơi khắt khe hơn 0.9 để tập trung vào các từ vựng chất lượng
  top_k: 50,        // Tăng nhẹ để model có vốn từ phong phú cho môn Văn
  frequency_penalty: 0.2, 
  presence_penalty: 0.2,
  thinking_budget: 2048, // Tăng lên để giải quyết các bài toán "xoắn não"
  n: 1,
};

    const sfRes = await fetch(SILICONFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // Xử lý lỗi HTTP từ SiliconFlow
    if (!sfRes.ok) {
      const msg = SF_ERRORS[sfRes.status] || `Lỗi AI (${sfRes.status}). Vui lòng thử lại.`;
      return res.status(sfRes.status).json({ error: msg });
    }

    // Pipe Web Stream → Node.js response (streaming SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // tắt buffer nginx nếu có

    const nodeStream = Readable.fromWeb(sfRes.body);
    nodeStream.pipe(res);

    // Dọn dẹp nếu client ngắt kết nối
    req.on('close', () => nodeStream.destroy());

  } catch (err) {
    console.error('[AI Proxy Error]', err.message);
    res.status(500).json({ error: 'Lỗi server nội bộ. Vui lòng thử lại.' });
  }
});

module.exports = router;
