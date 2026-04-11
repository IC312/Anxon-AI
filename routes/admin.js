const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { adminMiddleware } = require('../middleware/auth');
const { getConnection, getUserModel, getChatModels } = require('../db');

router.use(adminMiddleware);

// Helper: lấy models từ đúng DB
async function getStudentDB()           { const c = await getConnection('students'); return getUserModel(c); }
async function getChatDB(grade)         { const c = await getConnection(grade);     return getChatModels(c); }

// Lấy chat models từ tất cả 4 khối
async function getAllChatModels() {
  const results = await Promise.all([6,7,8,9].map(g => getConnection(g).then(c => getChatModels(c))));
  return results; // [{Conversation, Message}, ...]
}

// ── Hàm sort lớp đúng thứ tự: 6A1→6A2→6A10→7A1... ──
function sortClasses(a, b) {
  const parse = s => { const m = s.match(/^(\d+)[A-Za-z]+(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
  const [ag, an] = parse(a);
  const [bg, bn] = parse(b);
  return ag !== bg ? ag - bg : an - bn;
}

function sortByGivenName(a, b) {
  const last = s => (s.fullName || '').split(' ').pop();
  return last(a).localeCompare(last(b), 'vi', { sensitivity: 'base' });
}

// Xác định grade từ className
function gradeFromClass(className) {
  const m = (className || '').match(/^(\d)/);
  return m ? parseInt(m[1]) : 9;
}

// ── Stats ─────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const User = await getStudentDB();
    const students = await User.find({ role: 'student' }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className).filter(Boolean))];

    // Đếm conv + msg từ tất cả 4 DB khối
    const chatDBs = await getAllChatModels();
    const [convCounts, msgCounts] = await Promise.all([
      Promise.all(chatDBs.map(({ Conversation }) => Conversation.countDocuments())),
      Promise.all(chatDBs.map(({ Message }) => Message.countDocuments())),
    ]);
    const totalConvs = convCounts.reduce((a, b) => a + b, 0);
    const totalMsgs  = msgCounts.reduce((a, b) => a + b, 0);

    res.json({ totalStudents: students.length, totalClasses: classes.length, totalConvs, totalMsgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Danh sách lớp ─────────────────────────────────────
router.get('/classes', async (_req, res) => {
  try {
    const User = await getStudentDB();
    const students = await User.find({ role: 'student', className: { $ne: '' } }).select('className').lean();
    const classes  = [...new Set(students.map(s => s.className))].sort(sortClasses);
    res.json(classes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Học sinh trong lớp ────────────────────────────────
router.get('/classes/:className/students', async (req, res) => {
  try {
    const User = await getStudentDB();
    const students = await User.find({ role: 'student', className: req.params.className })
      .select('-passwordHash').lean();
    students.sort(sortByGivenName);

    const grade = gradeFromClass(req.params.className);
    const { Conversation, Message } = await getChatDB(grade);

    const result = await Promise.all(students.map(async s => {
      const convIds = await Conversation.distinct('_id', { userId: s._id });
      return { ...s, convCount: convIds.length, msgCount: await Message.countDocuments({ conversationId: { $in: convIds } }) };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Chi tiết 1 học sinh ───────────────────────────────
router.get('/users/:userId', async (req, res) => {
  try {
    const User = await getStudentDB();
    const s = await User.findById(req.params.userId).select('-passwordHash').lean();
    if (!s) return res.status(404).json({ error: 'Không tìm thấy' });
    const defaultPw = s.mustChangePassword
      ? (s.dob ? s.dob.replace(/\//g, '') : '(chưa có ngày sinh)')
      : null;
    res.json({ ...s, defaultPw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reset mật khẩu ────────────────────────────────────
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const User = await getStudentDB();
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Không thể reset admin' });

    const defaultPw = (user.dob || '').replace(/\//g, '');
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
    const User = await getStudentDB();
    const student = await User.findById(req.params.userId).select('className').lean();
    if (!student) return res.status(404).json({ error: 'Không tìm thấy' });

    const grade = gradeFromClass(student.className);
    const { Conversation, Message } = await getChatDB(grade);

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
    // Tìm conversation trong tất cả DB khối
    const chatDBs = await getAllChatModels();
    for (const { Conversation, Message } of chatDBs) {
      const conv = await Conversation.findById(req.params.id).lean();
      if (conv) {
        const msgs = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean();
        return res.json(msgs);
      }
    }
    res.json([]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin settings ────────────────────────────────────
router.post('/settings', async (req, res) => {
  try {
    const User = await getStudentDB();
    const { newUsername, currentPassword, newPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

    if (newUsername && newUsername.trim()) {
      const exists = await User.findOne({ username: newUsername.trim(), _id: { $ne: user._id } });
      if (exists) return res.status(409).json({ error: 'Tên đăng nhập này đã được sử dụng' });
      user.username = newUsername.trim();
      user.fullName = newUsername.trim();
    }
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    await user.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI helpers ────────────────────────────────────────
const SILICONFLOW_URL = 'https://api.siliconflow.com/v1/chat/completions';
const AI_MODEL        = 'zai-org/GLM-5.1';

async function callAI(systemPrompt, userContent, maxTokens = 600) {
  const res = await fetch(SILICONFLOW_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent  },
      ],
      stream:      false,
      max_tokens:  maxTokens,
      temperature: 0.4,
      top_p:       0.9,
    }),
  });
  if (!res.ok) throw new Error(`SiliconFlow ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Bước 1: Tóm tắt từng cuộc hội thoại ─────────────
// Được gọi 1 lần khi mở modal phân tích.
// Backend lấy toàn bộ tin nhắn → tóm tắt song song → trả về mảng tóm tắt.
router.post('/prepare-analysis/:userId', async (req, res) => {
  try {
    const User = await getStudentDB();
    const student = await User.findById(req.params.userId).select('-passwordHash').lean();
    if (!student) return res.status(404).json({ error: 'Không tìm thấy học sinh' });

    const grade = gradeFromClass(student.className);
    const { Conversation, Message } = await getChatDB(grade);

    const convs = await Conversation.find({ userId: req.params.userId })
      .sort({ updatedAt: -1 }).lean();

    if (!convs.length) {
      return res.json({ student, summaries: [], totalConvs: 0, totalMsgs: 0 });
    }

    // Lấy messages song song cho tất cả conversations
    const convMessages = await Promise.all(
      convs.map(c => Message.find({ conversationId: c._id }).sort({ createdAt: 1 }).lean())
    );

    const totalMsgs = convMessages.reduce((sum, msgs) => sum + msgs.length, 0);

    // Tóm tắt từng cuộc hội thoại song song (giới hạn 500 ký tự/tin nhắn trước khi gửi)
    const SUMMARIZE_SYSTEM = `Bạn là trợ lý tóm tắt hội thoại học sinh. Tóm tắt ngắn gọn cuộc trò chuyện sau trong 3-5 câu, tập trung vào: chủ đề chính, câu hỏi học sinh đặt ra, mức độ hiểu bài, thái độ học tập. Viết bằng tiếng Việt, không dùng bullet points.`;

    const summaries = await Promise.all(
      convs.map(async (conv, i) => {
        const msgs = convMessages[i];
        if (!msgs.length) return { title: conv.title, summary: '(Hội thoại trống)', msgCount: 0 };

        // Ghép nội dung, cắt mỗi tin tối đa 400 ký tự để tiết kiệm token
        const transcript = msgs.map(m => {
          const role   = m.role === 'user' ? 'Học sinh' : 'AI';
          const content = (m.content || '').slice(0, 400);
          return `${role}: ${content}`;
        }).join('\n');

        const summary = await callAI(SUMMARIZE_SYSTEM, `Tiêu đề: "${conv.title}"\n\n${transcript}`, 300);
        return { title: conv.title, summary, msgCount: msgs.length };
      })
    );

    res.json({ student, summaries, totalConvs: convs.length, totalMsgs });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi chuẩn bị phân tích: ' + err.message });
  }
});

// ── Bước 2: Chat với AI về học sinh ──────────────────
// Frontend gửi: { summaries, student, messages (lịch sử chat giáo viên-AI) }
// Backend xây system prompt từ tóm tắt đã có → gửi lên AI → trả reply.
router.post('/ai-analyze', async (req, res) => {
  try {
    const { student, summaries, messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Thiếu dữ liệu messages' });
    }

    // Xây system prompt từ tóm tắt (nhỏ gọn, không gửi raw messages)
    let system = `Bạn là trợ lý phân tích học sinh thông minh, hỗ trợ giáo viên hiểu sâu hơn về học sinh. Trả lời bằng tiếng Việt, ngắn gọn, có cấu trúc rõ ràng.\n\n`;
    system += `THÔNG TIN HỌC SINH:\n`;
    system += `- Họ tên: ${student.fullName}\n`;
    system += `- Lớp: ${student.className || '—'}\n`;
    system += `- Giới tính: ${student.gender || '—'}\n`;
    system += `- Ngày sinh: ${student.dob || '—'}\n\n`;

    if (summaries && summaries.length) {
      system += `TÓM TẮT ${summaries.length} CUỘC HỘI THOẠI VỚI AI:\n\n`;
      summaries.forEach((s, i) => {
        system += `[${i + 1}] "${s.title}" (${s.msgCount} tin nhắn)\n${s.summary}\n\n`;
      });
    } else {
      system += `Học sinh chưa có hội thoại nào với AI.\n\n`;
    }

    system += `Dựa vào các tóm tắt trên, hãy trả lời câu hỏi của giáo viên. Tập trung vào: mức độ hiểu bài, điểm mạnh/yếu, phong cách học, khó khăn gặp phải, gợi ý cải thiện.`;

    const sfRes = await fetch(SILICONFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        model:       AI_MODEL,
        messages:    [{ role: 'system', content: system }, ...messages],
        stream:      false,
        max_tokens:  1200,
        temperature: 0.7,
        top_p:       0.9,
      }),
    });

    if (!sfRes.ok) {
      const err = await sfRes.text();
      return res.status(sfRes.status).json({ error: `Lỗi AI (${sfRes.status}): ${err}` });
    }

    const data = await sfRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Không có phản hồi.';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

module.exports = router;
