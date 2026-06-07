--은행 송금 시뮬레이터

--계좌 테이블
CREATE TABLE IF NOT EXISTS accounts (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(50)    NOT NULL,
    balance    NUMERIC(15, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_balance_positive CHECK (balance >= 0)  -- 잔액 음수 방지 제약조건
);

--송금 이력 테이블
CREATE TABLE IF NOT EXISTS transfers (
    id              SERIAL PRIMARY KEY,
    from_account_id INT            NOT NULL REFERENCES accounts(id),  -- FK
    to_account_id   INT            NOT NULL REFERENCES accounts(id),  -- FK
    amount          NUMERIC(15, 0) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_amount_positive CHECK (amount > 0)
);

--테스트용 데이터
INSERT INTO accounts (name, balance) VALUES
    ('Alice',    1000000),
    ('Bob',       500000),
    ('Charlie',   750000);