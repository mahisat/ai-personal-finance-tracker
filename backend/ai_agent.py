"""
ai_agent.py — LangChain SQL agent (MySQL) + proactive insight engine
"""
import re
from datetime import date
from typing import Optional

from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import create_sql_agent
from langchain_openai import ChatOpenAI
from sqlalchemy import text

from config import Settings


# ── Safe read-only wrapper ────────────────────────────────────
_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)
_USER_ID_FILTER = re.compile(r"\buser_id\s*=\s*(\d+)")
_USER_SCOPED_TABLES = re.compile(r"\b(transactions|budgets)\b", re.IGNORECASE)


def _make_safe_db(sync_url: str, user_id: int) -> SQLDatabase:
    db = SQLDatabase.from_uri(
        sync_url,
        include_tables=["transactions", "categories", "budgets"],
        sample_rows_in_table_info=2,
    )

    original_run = db.run

    def safe_run(command: str, *args, **kwargs):
        if _FORBIDDEN.search(command):
            raise PermissionError("Write operations are not permitted via the AI agent.")

        if _USER_SCOPED_TABLES.search(command):
            found_ids = {int(m) for m in _USER_ID_FILTER.findall(command)}
            if not found_ids or found_ids != {user_id}:
                raise PermissionError(
                    f"Queries must be scoped to user_id = {user_id}."
                )

        return original_run(command, *args, **kwargs)

    db.run = safe_run
    return db


# ── Agent factory ─────────────────────────────────────────────
def build_sql_agent(settings: Settings, user_id: int):
    db = _make_safe_db(settings.sync_db_url, user_id)

    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0,
        api_key=settings.openai_api_key,
    )

    system_prompt = f"""
You are a helpful personal finance assistant with read-only access to a MySQL
database containing one user's financial data. Answer concisely and in plain
English. Use specific numbers from query results. Never speculate about data
not in the database. Only write SELECT statements.

Tables available:
- transactions  (id, user_id, amount, type, category_id, description, date)
- categories    (id, name, icon)
- budgets       (id, user_id, category_id, monthly_limit)

IMPORTANT: Every query against transactions or budgets MUST include the clause
WHERE user_id = {user_id}. Queries without this filter will be rejected.
"""

    agent = create_sql_agent(
        llm=llm,
        db=db,
        agent_type="openai-tools",
        verbose=settings.debug,
        system_message=system_prompt,
        max_iterations=8,
        handle_parsing_errors=True,
    )
    return agent


# ── Insight engine ─────────────────────────────────────────────
class InsightEngine:
    """
    Runs nightly analytical queries against MySQL and uses the LLM
    to phrase findings as human-friendly insights.
    """

    def __init__(self, settings: Settings):
        from sqlalchemy import create_engine
        self._engine = create_engine(
            settings.sync_db_url,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        self._llm = ChatOpenAI(
            model="gpt-4o",
            temperature=0.3,
            api_key=settings.openai_api_key,
        )

    # ── Internal query helpers ────────────────────────────────
    def _run(self, sql: str, params: dict) -> list[dict]:
        with self._engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        return [dict(r) for r in rows]

    def _budget_status(self, user_id: int, year: int, month: int) -> list[dict]:
        return self._run(
            """
            SELECT
                c.name                                    AS category,
                b.monthly_limit,
                COALESCE(SUM(t.amount), 0)                AS spent,
                b.monthly_limit - COALESCE(SUM(t.amount), 0) AS remaining,
                ROUND(
                    COALESCE(SUM(t.amount), 0) / b.monthly_limit * 100, 1
                )                                         AS percent_used
            FROM budgets b
            JOIN categories c ON c.id = b.category_id
            LEFT JOIN transactions t
                   ON t.category_id = b.category_id
                  AND t.user_id     = b.user_id
                  AND t.type        = 'expense'
                  AND YEAR(t.date)  = :year
                  AND MONTH(t.date) = :month
            WHERE b.user_id = :user_id
            GROUP BY b.id, c.name, b.monthly_limit
            ORDER BY percent_used DESC
            """,
            {"user_id": user_id, "year": year, "month": month},
        )
    
    def _mom_delta(self, user_id: int) -> list[dict]:
        """Month-over-month spending change per category."""
        return self._run(
            """
            SELECT * FROM (
                SELECT
                    c.name AS category,
                    ROUND(
                        SUM(CASE
                            WHEN YEAR(t.date) = YEAR(CURDATE())
                            AND MONTH(t.date) = MONTH(CURDATE())
                            THEN t.amount ELSE 0 END), 2) AS this_month,
                    ROUND(
                        SUM(CASE
                            WHEN YEAR(t.date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
                            AND MONTH(t.date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
                            THEN t.amount ELSE 0 END), 2) AS last_month
                FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE t.user_id = :user_id
                AND t.type    = 'expense'
                AND t.date   >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
                GROUP BY c.id, c.name
            ) AS monthly_summary
            WHERE this_month > 0 OR last_month > 0
            ORDER BY (this_month - last_month) DESC
            """,
            {"user_id": user_id},
        )

    # ── Public method ─────────────────────────────────────────
    def generate_insights(self, user_id: int) -> list[dict]:
        today = date.today()
        budgets = self._budget_status(user_id, today.year, today.month)
        deltas = self._mom_delta(user_id)

        insights: list[dict] = []

        # Rule-based budget alerts (fast, no LLM needed)
        for row in budgets:
            pct = float(row["percent_used"] or 0)
            if pct >= 100:
                insights.append({
                    "title": f"Over budget: {row['category']}",
                    "body": (
                        f"You've spent ${row['spent']:.2f} against a "
                        f"${row['monthly_limit']:.2f} budget "
                        f"({pct:.0f}% used)."
                    ),
                    "severity": "danger",
                })
            elif pct >= 80:
                insights.append({
                    "title": f"Budget warning: {row['category']}",
                    "body": (
                        f"You've used {pct:.0f}% of your "
                        f"${row['monthly_limit']:.2f} {row['category']} budget."
                    ),
                    "severity": "warning",
                })

        # LLM-generated trend insight (one per run)
        if deltas:
            data_summary = "\n".join(
                f"- {r['category']}: this month ${r['this_month']}, "
                f"last month ${r['last_month']}"
                for r in deltas[:8]
            )
            prompt = (
                "Given this month-over-month spending data for a user, "
                "write ONE concise insight (2–3 sentences) highlighting the "
                "most notable trend, positive or negative. Be specific with "
                "numbers.\n\n" + data_summary
            )
            body = self._llm.invoke(prompt).content.strip()
            insights.append({
                "title": "Spending trend",
                "body": body,
                "severity": "info",
            })

        return insights