const router       = require('express').Router();
const bcrypt       = require('bcryptjs');
const User         = require('../models/User');
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const { adminMiddleware } = require('../middleware/auth');

router.use(adminMiddleware);

// ── Hàm sort lớp đúng thứ tự: 6A1→6A2→6A10→7A1... ──
function sortClasses(a, b) {
  const parse = s => { const m = s.match(/^(\d+)[A-Za-z]+(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
  const [ag, an] = parse(a);
  const [bg, bn] = parse(b);
  return ag !== bg ? ag - bg : an - bn;
}

// ── Hàm sort học sinh theo tên (từ cuối = tên chính TV) ──
function sortByGivenName(a, b) {
  const last = s => (s.fullName || '').split(' ').pop();
  return last(a).localeCompare(last(b), 'vi', { sensitivity: 'base' });
}

// ── Stats ─────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className).filter(Boolean))];
    const [totalConvs, totalMsgs] = await Promise.all([
      Conversation.countDocuments(),
      Message.countDocuments(),
    ]);
    res.json({ totalStudents: students.length, totalClasses: classes.length, totalConvs, totalMsgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Danh sách lớp (sắp xếp đúng) ────────────────────
router.get('/classes', async (_req, res) => {
  try {
    const students = await User.find({ role: 'student', className: { $ne: '' } }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className))].sort(sortClasses);
    res.json(classes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Học sinh trong lớp (sort theo tên) ───────────────
router.get('/classes/:className/students', async (req, res) => {
  try {
    const students = await User.find({ role: 'student', className: req.params.className })
      .select('-passwordHash').lean();

    students.sort(sortByGivenName);

    const result = await Promise.all(students.map(async s => {
      const convIds = await Conversation.distinct('_id', { userId: s._id });
      return { ...s, convCount: convIds.length, msgCount: await Message.countDocuments({ conversationId: { $in: convIds } }) };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Chi tiết 1 học sinh (cho modal) ──────────────────
router.get('/users/:userId', async (req, res) => {
  try {
    const s = await User.findById(req.params.userId).select('-passwordHash').lean();
    if (!s) return res.status(404).json({ error: 'Không tìm thấy' });
    // Hiển thị mật khẩu mặc định nếu chưa đổi
    const defaultPw = s.mustChangePassword
      ? (s.dob ? s.dob.replace(/\//g, '') : '(chưa có ngày sinh)')
      : null;
    res.json({ ...s, defaultPw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reset mật khẩu về mặc định (ngày sinh) ───────────
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Không thể reset admin' });

    const dobRaw = user.dob || '';
    const defaultPw = dobRaw.replace(/\//g, ''); // DD/MM/YYYY → DDMMYYYY
    if (!defaultPw) return res.status(400).json({ error: 'Học sinh không có ngày sinh' });

    user.passwordHash = await bcrypt.hash(defaultPw, 10);
    user.mustChangePassword = true;
    await user.save();
    res.json({ ok: true, defaultPw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Conversations của học sinh ────────────────────────
router.get('/users/:userId/conversations', async (req, res) => {
  try {
    const convs = await Conversation.find({ userId: req.params.userId }).sort({ updatedAt: -1 }).lean();
    const result = await Promise.all(convs.map(async c => ({
      ...c, msgCount: await Message.countDocuments({ conversationId: c._id })
    })));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Messages của hội thoại ────────────────────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const msgs = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
