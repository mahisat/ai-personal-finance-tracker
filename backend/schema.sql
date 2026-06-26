-- ─────────────────────────────────────────────────────────────
-- Personal Finance Tracker — Full Schema (fresh install)
-- Supports parent / child categories (Indian-friendly)
-- ─────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS finance_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE finance_tracker;

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Categories (self-referencing) ─────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  icon      VARCHAR(50),
  parent_id INT UNSIGNED DEFAULT NULL,
  UNIQUE KEY uq_name_parent (name, parent_id),
  CONSTRAINT fk_category_parent
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ── Parent categories (fixed IDs for reliable child references)
INSERT INTO categories (id, name, icon, parent_id) VALUES
  (1, 'Daily Expenses',    'shopping-cart', NULL),
  (2, 'Bills & Utilities', 'zap',           NULL),
  (3, 'EMI & Loans',       'landmark',      NULL),
  (4, 'Insurance',         'shield',        NULL),
  (5, 'Investments',       'trending-up',   NULL),
  (6, 'Family & Home',     'home',          NULL),
  (7, 'Occasions',         'gift',          NULL),
  (8, 'Income',            'briefcase',     NULL),
  (9, 'Other',             'circle',        NULL);

-- ── Daily Expenses ────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Food & Dining',     'utensils',      1),
  ('Groceries',         'shopping-cart', 1),
  ('Fuel',              'fuel',          1),
  ('Auto & Cab',        'taxi',          1),
  ('Public Transport',  'bus',           1),
  ('Health & Medicine', 'pill',          1),
  ('Personal Care',     'sparkles',      1);

-- ── Bills & Utilities ─────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Electricity Bill',  'zap',        2),
  ('Water Bill',        'droplet',    2),
  ('Gas Cylinder',      'flame',      2),
  ('Mobile Recharge',   'smartphone', 2),
  ('Internet & DTH',    'wifi',       2),
  ('OTT Subscriptions', 'play',       2);

-- ── EMI & Loans ───────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Home Loan EMI',      'home',           3),
  ('Car Loan EMI',       'car',            3),
  ('Personal Loan EMI',  'landmark',       3),
  ('Education Loan EMI', 'graduation-cap', 3),
  ('Credit Card Bill',   'credit-card',    3),
  ('Chit Fund',          'users',          3);

-- ── Insurance ─────────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('LIC Premium',       'shield',       4),
  ('Health Insurance',  'heart-pulse',  4),
  ('Vehicle Insurance', 'shield-check', 4),
  ('Term Insurance',    'shield',       4);

-- ── Investments ───────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Mutual Funds / SIP', 'chart-bar',   5),
  ('PPF',                'piggy-bank',  5),
  ('NPS',                'piggy-bank',  5),
  ('Fixed Deposit',      'bank',        5),
  ('Stocks',             'trending-up', 5),
  ('Gold / Jewellery',   'star',        5),
  ('RD',                 'repeat',      5);

-- ── Family & Home ─────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Rent',              'building',  6),
  ('House Maintenance', 'wrench',    6),
  ('Domestic Help',     'users',     6),
  ('School Fees',       'book-open', 6),
  ('Tuition',           'school',    6);

-- ── Occasions ─────────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Festival Shopping', 'sparkles',      7),
  ('Marriage / Events', 'party-popper',  7),
  ('Gifts & Donations', 'gift',          7),
  ('Temple / Charity',  'hands-praying', 7),
  ('Travel & Vacation', 'plane',         7);

-- ── Income ────────────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Salary',          'briefcase',  8),
  ('Freelance Income','laptop',     8),
  ('Rental Income',   'home',       8),
  ('Business Income', 'store',      8),
  ('Dividends',       'chart-line', 8),
  ('Bonus',           'star',       8),
  ('Interest Income', 'bank',       8);

-- ── Other ─────────────────────────────────────────────────────
INSERT INTO categories (name, icon, parent_id) VALUES
  ('Shopping',      'shopping-bag', 9),
  ('Entertainment', 'film',         9),
  ('Gym & Fitness', 'dumbbell',     9),
  ('Electronics',   'monitor',      9),
  ('Clothing',      'shirt',        9),
  ('Miscellaneous', 'circle',       9);

-- ── Transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,
  type        ENUM('income', 'expense') NOT NULL,
  category_id INT UNSIGNED,
  description VARCHAR(500),
  date        DATE NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_user_date     (user_id, date),
  INDEX idx_user_category (user_id, category_id)
);

-- ── Budgets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  category_id   INT UNSIGNED NOT NULL,
  monthly_limit DECIMAL(12, 2) NOT NULL,
  UNIQUE KEY uq_user_category (user_id, category_id),
  FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ── AI Conversations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  role       ENUM('user', 'assistant') NOT NULL,
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_conv (user_id, created_at)
);