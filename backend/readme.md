# Personal Finance Tracker — Backend

FastAPI + LangChain + MySQL backend for an AI-powered personal finance tracker.

## Prerequisites

- Python 3.11+
- MySQL 8.0+
- An OpenAI API key

## Setup

```bash
# 1. Clone / enter the project directory
cd finance_tracker

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create the MySQL database and a dedicated user
mysql -u root -p <<'SQL'
CREATE DATABASE finance_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'finance_user'@'localhost' IDENTIFIED BY 'your_password_here';
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_tracker.* TO 'finance_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# 5. Seed the schema
mysql -u finance_user -p finance_tracker < schema.sql

# 6. Configure environment
cp .env.example .env
# Edit .env: set MYSQL_PASSWORD and OPENAI_API_KEY

# 7. Start the API server
uvicorn main:app --reload --port 8000
```

## API overview

| Method | Endpoint                           | Description                               |
| ------ | ---------------------------------- | ----------------------------------------- |
| POST   | `/users`                           | Create a user                             |
| GET    | `/categories`                      | List spending categories                  |
| POST   | `/users/{id}/transactions`         | Log a transaction                         |
| GET    | `/users/{id}/transactions`         | List transactions (paginated, filterable) |
| DELETE | `/users/{id}/transactions/{tx_id}` | Delete a transaction                      |
| PUT    | `/users/{id}/budgets`              | Create / update a budget                  |
| GET    | `/users/{id}/budgets/status`       | Actual vs budget this month               |
| POST   | `/users/{id}/chat`                 | Ask the AI agent a question               |
| GET    | `/users/{id}/insights`             | Get AI-generated spending insights        |
| GET    | `/health`                          | Health check                              |

Interactive docs: http://localhost:8000/docs

## Architecture

```
React (port 3000)
    │
    ▼
FastAPI (port 8000)
    ├── CRUD routes ──────────────► MySQL (aiomysql / SQLAlchemy async)
    ├── /chat ────────────────────► LangChain SQL Agent
    │                                   └── MySQL (PyMySQL / SQLAlchemy sync)
    └── /insights ────────────────► InsightEngine
                                        ├── Analytical SQL queries
                                        └── OpenAI GPT-4o (trend narrative)
```

## Security notes

- The LangChain agent only receives SELECT permission; write statements raise
  a PermissionError before reaching MySQL.
- In production, add JWT authentication and scope each query to the
  authenticated user_id.
- Rotate OPENAI_API_KEY and MYSQL_PASSWORD via environment secrets
  (AWS Secrets Manager, Doppler, etc.) — never commit them to source control.
