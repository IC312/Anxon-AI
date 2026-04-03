# Hermes Chat

AI chatbot với MongoDB Atlas, phân quyền Admin / Học sinh.

## Cấu trúc

```
hermes-chat/
├── server.js
├── package.json
├── .env                    ← tự tạo từ .env.example
├── middleware/
│   └── auth.js
├── models/
│   ├── User.js
│   ├── Conversation.js
│   └── Message.js
├── routes/
│   ├── auth.js
│   ├── chat.js
│   └── admin.js
├── scripts/
│   └── create-admin.js
└── public/
    ├── login.html
    ├── chat.html
    └── admin.html
```

## Cài đặt và chạy

### 1. Cài dependencies
```bash
npm install
```

### 2. Tạo file .env
```bash
cp .env.example .env
```
Mở `.env` và điền:
- `MONGODB_URI` — connection string MongoDB Atlas (nhớ đổi password!)
- `JWT_SECRET` — chuỗi bí mật bất kỳ, ít nhất 32 ký tự

### 3. Tạo tài khoản Admin lần đầu
```bash
node scripts/create-admin.js
```
Sửa email/password trong file trước khi chạy.

### 4. Chạy server
```bash
# Development (tự restart khi sửa code)
npm run dev

# Production
npm start
```

Mở trình duyệt: http://localhost:3000

## Phân quyền

| Role    | Đăng ký | Đăng nhập | Chat | Xem lịch sử tất cả |
|---------|---------|-----------|------|---------------------|
| Học sinh | ✅ tự đăng ký | ✅ | ✅ | ❌ |
| Admin   | ❌ tạo thủ công qua script | ✅ | ❌ | ✅ |

## API Endpoints

### Auth
- `POST /api/auth/register` — đăng ký học sinh
- `POST /api/auth/login` — đăng nhập

### Chat (yêu cầu token học sinh)
- `GET /api/chat/conversations` — danh sách hội thoại
- `POST /api/chat/conversations` — tạo mới
- `DELETE /api/chat/conversations/:id` — xoá
- `GET /api/chat/conversations/:id/messages` — lịch sử
- `POST /api/chat/conversations/:id/messages` — lưu tin nhắn

### Admin (yêu cầu token admin)
- `GET /api/admin/stats` — thống kê tổng quan
- `GET /api/admin/classes` — danh sách lớp
- `GET /api/admin/classes/:class/students` — học sinh trong lớp
- `GET /api/admin/users/:userId/conversations` — hội thoại của học sinh
- `GET /api/admin/conversations/:id/messages` — tin nhắn
