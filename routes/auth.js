const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

function makeToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function userPayload(user) {
  return {
    token:    makeToken(user),
    role:     user.role,
    fullName: user.fullName,
    className: user.className || '',
    gender:   user.gender || '',
    dob:      user.dob || '',
    mustChangePassword: user.mustChangePassword || false,
  };
}

// ── Đăng nhập (CCCD + mật khẩu cho học sinh; username + pw cho admin) ──
router.post('/login', async (req, res) => {
  try {
    const { cccd, password } = req.body;
    if (!cccd || !password)
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });

    // Tìm học sinh theo CCCD, hoặc admin theo username
    const user = await User.findOne({ $or: [{ cccd }, { username: cccd }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Số CCCD hoặc mật khẩu không đúng' });

    res.json(userPayload(user));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Đổi mật khẩu ──────────────────────────────────────
router.post('/change-password', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    res.json({ ok: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
