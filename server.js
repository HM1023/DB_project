
//  은행 송금 시뮬레이터 - 백엔드 서버

const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// [DBMS 연동] PostgreSQL 연결 풀 설정 (도커 환경 변수 매핑)
const pool = new Pool({
  user:     process.env.DB_USER || 'myuser',
  host:     process.env.DB_HOST || 'postgres-db',
  database: process.env.DB_NAME || 'bankdb',
  password: process.env.DB_PASSWORD || 'mypassword',
  port:     parseInt(process.env.DB_PORT || '5432'),
});

// 연결 테스트 로그
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ DB 연결 실패:', err.message);
  } else {
    console.log('✅ PostgreSQL 연결 성공');
    release();
  }
});

// ── [Query] 계좌 전체 조회 (SELECT) ─────────────────────────────
app.get('/api/accounts', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, balance FROM accounts ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── [Query + JOIN] 송금 이력 조회 (두 테이블 JOIN) ───────────────
app.get('/api/transfers', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        fa.name AS from_name,
        ta.name AS to_name,
        t.amount,
        TO_CHAR(t.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
      FROM   transfers t
      JOIN   accounts fa ON t.from_account_id = fa.id
      JOIN   accounts ta ON t.to_account_id   = ta.id
      ORDER  BY t.created_at DESC
      LIMIT  30
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── [Transaction] 송금 처리 ─────────────────────────────────────
//  BEGIN → 잔액확인(FOR UPDATE) → UPDATE×2 → INSERT → COMMIT
//  오류 발생 시 → ROLLBACK (원자성 보장)
app.post('/api/transfer', async (req, res) => {
  const { fromId, toId, amount } = req.body;
  const amt = parseFloat(amount);

  // 기본 유효성 검사
  if (!fromId || !toId || !amt)
    return res.status(400).json({ error: '입력값이 부족합니다.' });
  if (Number(fromId) === Number(toId))
    return res.status(400).json({ error: '같은 계좌로는 송금할 수 없습니다.' });
  if (amt <= 0)
    return res.status(400).json({ error: '금액은 0보다 커야 합니다.' });

  const client = await pool.connect();
  try {
    /* ★ 트랜잭션 시작 */
    await client.query('BEGIN');

    /* ① 잔액 확인 — FOR UPDATE로 행 잠금 (동시 송금 충돌 방지) */
    const { rows } = await client.query(
      'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
      [fromId]
    );
    if (!rows.length) throw new Error('송금자 계좌가 존재하지 않습니다.');

    const balance = parseFloat(rows[0].balance);
    if (balance < amt)
      throw new Error(`잔액 부족 — 현재 잔액: ₩${balance.toLocaleString()}`);

    /* ② 송금자 잔액 차감 */
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amt, fromId]
    );

    /* ③ 수신자 잔액 증가 */
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amt, toId]
    );

    /* ④ 송금 이력 INSERT */
    await client.query(
      'INSERT INTO transfers (from_account_id, to_account_id, amount) VALUES ($1, $2, $3)',
      [fromId, toId, amt]
    );

    /* ★ 모두 성공 → COMMIT */
    await client.query('COMMIT');
    res.json({ success: true, message: '✅ 송금 완료! (COMMIT)' });

  } catch (err) {
    /* ★ 하나라도 실패 → ROLLBACK (원자성 보장) */
    await client.query('ROLLBACK');
    res.status(400).json({ error: `❌ ${err.message} → ROLLBACK 처리됨` });
  } finally {
    client.release();
  }
});

// ── 정적 파일 서빙 (index.html) ──────────────────────────────────
app.use(express.static(__dirname));

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`)
);