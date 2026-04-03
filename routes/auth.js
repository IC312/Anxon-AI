const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

function makeToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  try {
    const { fullName, password, className } = req.body;
    if (!fullName || !password || !className)
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });

    const username = (fullName.trim() + '_' + className.trim()).toLowerCase();
    if (await User.findOne({ username }))
      return res.status(409).json({ error: 'Học sinh này trong lớp đã được đăng ký' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      passwordHash,
      fullName:  fullName.trim(),
      className: className.trim().toUpperCase(),
      role: 'student',
    });

    res.status(201).json({
      token: makeToken(user), role: user.role,
      fullName: user.fullName, className: user.className,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { fullName, password, className } = req.body;
    if (!fullName || !password)
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });

    let user;
    if (className && className.trim()) {
      const username = (fullName.trim() + '_' + className.trim()).toLowerCase();
      user = await User.findOne({ username });
    } else {
      user = await User.findOne({ role: 'admin', fullName: new RegExp('^' + fullName.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '$', 'i') });
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Thông tin đăng nhập không đúng' });

    res.json({
      token: makeToken(user), role: user.role,
      fullName: user.fullName, className: user.className || '',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
