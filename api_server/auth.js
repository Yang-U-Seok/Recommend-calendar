
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const router = express.Router();

const db = new Database(
  path.join(__dirname, 'users.db')
);

// 데이터베이스 초기화
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

// 회원가입
router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = req.body?.password;

    if (
      !name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: '이름, 올바른 이메일, 8자 이상의 비밀번호를 입력해주세요.'
      });
    }

    if (name.length > 100 || email.length > 254 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: '입력 가능한 길이를 초과했습니다.'
      });
    }

    const existing = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(email);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: '이미 가입된 이메일입니다.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run(name, email, passwordHash);

    const user = {
      id: Number(result.lastInsertRowid),
      name,
      email
    };

    // 회원가입 후 로그인 상태로 전환
    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: '세션 생성에 실패했습니다.'
        });
      }

      req.session.userId = user.id;

      req.session.save(error => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: '로그인 상태 저장에 실패했습니다.'
          });
        }

        res.status(201).json({
          success: true,
          message: '회원가입이 완료되었습니다.',
          user
        });
      });
    });

  } catch (error) {
    console.error('회원가입 오류:', error);

    res.status(500).json({
      success: false,
      message: '회원가입 처리 중 오류가 발생했습니다.'
    });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = req.body?.password;

    if (!email || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: '이메일과 비밀번호를 입력해주세요.'
      });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email);

    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: '로그인 세션 생성에 실패했습니다.'
        });
      }

      req.session.userId = user.id;

      req.session.save(error => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: '로그인 상태 저장에 실패했습니다.'
          });
        }

        res.json({
          success: true,
          message: '로그인 성공',
          user: publicUser(user)
        });
      });
    });

  } catch (error) {
    console.error('로그인 오류:', error);

    res.status(500).json({
      success: false,
      message: '로그인 처리 중 오류가 발생했습니다.'
    });
  }
});

// 로그인 상태 확인
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({
      success: true,
      user: null
    });
  }

  const user = db.prepare(
    'SELECT id, name, email FROM users WHERE id = ?'
  ).get(req.session.userId);

  res.json({
    success: true,
    user: user || null
  });
});

// 로그아웃
router.post('/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: '로그아웃 실패'
      });
    }

    res.clearCookie('recommender.sid');

    res.json({
      success: true,
      message: '로그아웃되었습니다.'
    });
  });
});

module.exports = router;
