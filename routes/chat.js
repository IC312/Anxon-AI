const router       = require('express').Router();
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ── Tạo conversation mới ──────────────────────────────
router.post('/conversations', async (req, res) => {
  try {
    const conv = await Conversation.create({
      userId: req.user.id,
      title:  req.body.title || 'Hội thoại mới',
    });
    res.status(201).json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Danh sách conversations của học sinh ──────────────
router.get('/conversations', async (req, res) => {
  try {
    const convs = await Conversation.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(convs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Xoá conversation ──────────────────────────────────
router.delete('/conversations/:id', async (req, res) => {
  try {
    const conv = await Conversation.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });
    await Message.deleteMany({ conversationId: conv._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lấy messages của conversation ────────────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });
    const msgs = await Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean();
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lưu 1 tin nhắn (user hoặc assistant) ─────────────
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'Thiếu dữ liệu' });

    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
    if (!conv) return res.status(404).json({ error: 'Không tìm thấy' });

    const msg = await Message.create({ conversationId: conv._id, role, content });

    // Cập nhật title từ tin nhắn đầu tiên của user
    if (role === 'user') {
      const count = await Message.countDocuments({ conversationId: conv._id });
      if (count === 1) {
        await Conversation.findByIdAndUpdate(conv._id, {
          title: content.slice(0, 60),
          updatedAt: new Date(),
        });
      } else {
        await Conversation.findByIdAndUpdate(conv._id, { updatedAt: new Date() });
      }
    }

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
