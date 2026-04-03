const router       = require('express').Router();
const User         = require('../models/User');
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const { adminMiddleware } = require('../middleware/auth');

router.use(adminMiddleware);

// ── Thống kê tổng quan ────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className).filter(Boolean))];
    const [totalConvs, totalMsgs] = await Promise.all([
      Conversation.countDocuments(),
      Message.countDocuments(),
    ]);
    res.json({
      totalStudents: students.length,
      totalClasses:  classes.length,
      totalConvs,
      totalMsgs,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Danh sách lớp (distinct) ──────────────────────────
router.get('/classes', async (_req, res) => {
  try {
    const students = await User.find({ role: 'student', className: { $ne: '' } }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className))].sort();
    res.json(classes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Học sinh trong 1 lớp ─────────────────────────────
router.get('/classes/:className/students', async (req, res) => {
  try {
    const students = await User.find({
      role: 'student',
      className: req.params.className,
    }).select('-passwordHash').sort({ fullName: 1 }).lean();

    const result = await Promise.all(students.map(async s => {
      const convIds  = await Conversation.distinct('_id', { userId: s._id });
      const convCount = convIds.length;
      const msgCount  = await Message.countDocuments({ conversationId: { $in: convIds } });
      return { ...s, convCount, msgCount };
    }));

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Conversations của 1 học sinh ──────────────────────
router.get('/users/:userId/conversations', async (req, res) => {
  try {
    const convs = await Conversation.find({ userId: req.params.userId })
      .sort({ updatedAt: -1 }).lean();
    const result = await Promise.all(convs.map(async c => {
      const msgCount = await Message.countDocuments({ conversationId: c._id });
      return { ...c, msgCount };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Messages của 1 conversation ───────────────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const msgs = await Message.find({ conversationId: req.params.id })
      .sort({ createdAt: 1 }).lean();
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
