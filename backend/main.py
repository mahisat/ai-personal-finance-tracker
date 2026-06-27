"""
main.py — FastAPI application
Endpoints:
  POST   /auth/register
  POST   /auth/login
  GET    /users/me
  GET    /categories
  POST   /users/{user_id}/transactions
  GET    /users/{user_id}/transactions
  DELETE /users/{user_id}/transactions/{tx_id}
  PUT    /users/{user_id}/budgets
  GET    /users/{user_id}/budgets/status
  POST   /users/{user_id}/chat
  GET    /users/{user_id}/insights
"""
import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated, Optional
from fastapi import Request

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, load_only

from auth import create_access_token, decode_token, hash_password, verify_password
from config import Settings, build_async_engine, build_session_factory, get_settings
from models import AIConversation, Base, Budget, Category, Transaction, User
from schemas import (
    BudgetOut, BudgetStatus, BudgetUpsert,
    CategoryOut, ChatRequest, ChatResponse,
    InsightOut, LoginRequest, RegisterRequest, TokenResponse,
    TransactionCreate, TransactionOut, TransactionPage,
    UserCreate, UserOut,
)
from ai_agent import InsightEngine, build_sql_agent

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer()


# ── App lifecycle ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    engine = build_async_engine(settings)
    app.state.session_factory = build_session_factory(engine)
    app.state.settings = settings

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Connected to MySQL at %s", settings.mysql_host)
    yield
    await engine.dispose()


app = FastAPI(
    title="Personal Finance Tracker API",
    version="1.0.0",
    lifespan=lifespan,
)

_settings_for_cors = get_settings()

origins = [
    origin.strip()
    for origin in _settings_for_cors.cors_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Dependencies ──────────────────────────────────────────────
async def get_db(request: Request) -> AsyncSession:  # type: ignore[override]
    async with request.app.state.session_factory() as session:
        yield session


DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    request: Request,
    db: DB,
) -> User:
    settings: Settings = request.app.state.settings
    user_id = decode_token(credentials.credentials, settings.app_secret_key)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def _require_same_user(current_user: User, user_id: int) -> None:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")


# ── Auth ──────────────────────────────────────────────────────
@app.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: DB):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    settings: Settings = request.app.state.settings
    token = create_access_token(user.id, settings.app_secret_key)
    return TokenResponse(access_token=token, user_id=user.id, name=user.name, email=user.email)


@app.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: DB):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Constant-time check — same error whether email or password is wrong
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    settings: Settings = request.app.state.settings
    token = create_access_token(user.id, settings.app_secret_key)
    return TokenResponse(access_token=token, user_id=user.id, name=user.name, email=user.email)


# ── Current user ──────────────────────────────────────────────
@app.get("/users/me", response_model=UserOut)
async def get_me(current_user: CurrentUser):
    return current_user


# ── Categories (public) ───────────────────────────────────────
@app.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DB):
    result = await db.execute(
        select(Category)
        .where(Category.parent_id == None)
        .options(selectinload(Category.children))
        .order_by(Category.name)
    )
    parents = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "icon": p.icon,
            "children": [
                {"id": c.id, "name": c.name, "icon": c.icon}
                for c in p.children
            ],
        }
        for p in parents
    ]


@app.get("/debug/categories")
async def debug_categories(db: DB):
    from sqlalchemy import text
    result = await db.execute(text("SELECT id, name, parent_id FROM categories LIMIT 5"))
    return [dict(r) for r in result.mappings()]


# ── Transactions ──────────────────────────────────────────────
@app.post(
    "/users/{user_id}/transactions",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(user_id: int, body: TransactionCreate, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    tx = Transaction(user_id=user_id, **body.model_dump())
    db.add(tx)
    await db.commit()

    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.category).options(
                load_only(Category.id, Category.name, Category.icon, Category.parent_id),
                selectinload(Category.children).load_only(
                    Category.id, Category.name, Category.icon
                ),
            )
        )
        .where(Transaction.id == tx.id)
    )
    return result.scalar_one()


@app.get("/users/{user_id}/transactions", response_model=TransactionPage)
async def list_transactions(
    user_id: int,
    db: DB,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None, pattern="^(income|expense)$"),
    category_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
):
    _require_same_user(current_user, user_id)

    q = (
        select(Transaction)
        .options(
            selectinload(Transaction.category).options(
                load_only(Category.id, Category.name, Category.icon, Category.parent_id),
                selectinload(Category.children).load_only(
                    Category.id, Category.name, Category.icon
                ),
            )
        )
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    if type:
        q = q.where(Transaction.type == type)
    if category_id:
        q = q.where(Transaction.category_id == category_id)
    if from_date:
        q = q.where(Transaction.date >= from_date)
    if to_date:
        q = q.where(Transaction.date <= to_date)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    rows = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    return TransactionPage(
        total=total,
        page=page,
        page_size=page_size,
        items=rows.scalars().all(),
    )


@app.delete(
    "/users/{user_id}/transactions/{tx_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_transaction(user_id: int, tx_id: int, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    result = await db.execute(
        delete(Transaction).where(
            Transaction.id == tx_id,
            Transaction.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.commit()


# ── Budgets ───────────────────────────────────────────────────
@app.put(
    "/users/{user_id}/budgets",
    response_model=BudgetOut,
    status_code=status.HTTP_200_OK,
)
async def upsert_budget(user_id: int, body: BudgetUpsert, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    existing = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category_id == body.category_id,
        )
    )
    budget = existing.scalar_one_or_none()

    if budget:
        budget.monthly_limit = body.monthly_limit
    else:
        budget = Budget(
            user_id=user_id,
            category_id=body.category_id,
            monthly_limit=body.monthly_limit,
        )
        db.add(budget)

    await db.commit()

    result = await db.execute(
        select(Budget)
        .options(
            selectinload(Budget.category).options(
                selectinload(Category.children).load_only(
                    Category.id, Category.name, Category.icon
                )
            )
        )
        .where(Budget.id == budget.id)
    )
    return result.scalar_one()


@app.get("/users/{user_id}/budgets/status", response_model=list[BudgetStatus])
async def budget_status(
    user_id: int,
    db: DB,
    current_user: CurrentUser,
    year: int = Query(default=None),
    month: int = Query(default=None),
):
    from datetime import date as dt
    from sqlalchemy import text

    _require_same_user(current_user, user_id)

    today = dt.today()
    year = year or today.year
    month = month or today.month

    result = await db.execute(
        text("""
            SELECT
                c.name                                        AS category,
                b.monthly_limit,
                COALESCE(SUM(t.amount), 0)                    AS spent,
                b.monthly_limit - COALESCE(SUM(t.amount), 0) AS remaining,
                ROUND(
                    COALESCE(SUM(t.amount), 0) / b.monthly_limit * 100, 1
                )                                             AS percent_used
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
        """),
        {"user_id": user_id, "year": year, "month": month},
    )
    rows = result.mappings().all()
    return [BudgetStatus(**dict(r)) for r in rows]


# ── AI Chat ───────────────────────────────────────────────────
@app.post("/users/{user_id}/chat", response_model=ChatResponse)
async def chat(user_id: int, body: ChatRequest, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    settings: Settings = app.state.settings

    db.add(AIConversation(user_id=user_id, role="user", content=body.message))
    await db.commit()

    question = body.message

    try:
        agent = build_sql_agent(settings, user_id)
        result = agent.invoke({"input": question})
        answer = result.get("output", "I couldn't find an answer to that.")
        sql_used = result.get("intermediate_steps")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        logger.exception("Agent error: %s", exc)
        raise HTTPException(status_code=500, detail="AI agent encountered an error.")

    db.add(AIConversation(user_id=user_id, role="assistant", content=answer))
    await db.commit()

    return ChatResponse(
        answer=answer,
        sql_used=str(sql_used) if settings.debug else None,
    )


# ── Insights ──────────────────────────────────────────────────
@app.get("/users/{user_id}/insights", response_model=list[InsightOut])
async def get_insights(user_id: int, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    settings: Settings = app.state.settings
    try:
        engine = InsightEngine(settings)
        raw = engine.generate_insights(user_id)
    except Exception as exc:
        logger.exception("Insight engine error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate insights.")

    return [InsightOut(**r) for r in raw]


# ── Health check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
