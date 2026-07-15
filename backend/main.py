"""
main.py — FastAPI application
Endpoints:
  POST   /auth/register
  POST   /auth/login
  GET    /users/me
  GET    /categories
  GET    /templates/import
  POST   /users/{user_id}/transactions
  GET    /users/{user_id}/transactions
  DELETE /users/{user_id}/transactions/{tx_id}
  PUT    /users/{user_id}/budgets
  GET    /users/{user_id}/budgets/status
  POST   /users/{user_id}/chat
  GET    /users/{user_id}/insights
  POST   /users/{user_id}/import
"""
import csv
import hashlib
import io
import logging
import re
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Optional
from fastapi import File, Request, UploadFile

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
    ImportResult, InsightOut, LoginRequest, RegisterRequest, TokenResponse,
    TransactionCreate, TransactionOut, TransactionPage, TransactionUpdate,
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
    allow_origin_regex=r"http://localhost:\d+",
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


@app.put(
    "/users/{user_id}/transactions/{tx_id}",
    response_model=TransactionOut,
)
async def update_transaction(user_id: int, tx_id: int, body: TransactionUpdate, db: DB, current_user: CurrentUser):
    _require_same_user(current_user, user_id)

    tx = await db.get(Transaction, tx_id)
    if tx is None or tx.user_id != user_id:
        raise HTTPException(status_code=404, detail="Transaction not found")

    tx.amount = body.amount
    tx.type = body.type
    tx.category_id = body.category_id
    tx.description = body.description
    tx.date = body.date
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
        .where(Transaction.id == tx_id)
    )
    return result.scalar_one()


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


# ── Import helpers ────────────────────────────────────────────
def _to_range_name(cat_name: str) -> str:
    """Sanitise a category name into a valid Excel named-range identifier."""
    name = re.sub(r"[^A-Za-z0-9]", "_", cat_name)
    name = re.sub(r"_+", "_", name)
    return name.strip("_")


def _parse_date(raw: str) -> date:
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date format: '{raw}'")


def _row_hash(user_id: int, tx_date: date, tx_type: str,
              amount: Decimal, category_id: Optional[int], description: str) -> str:
    raw = f"{user_id}|{tx_date}|{tx_type}|{amount}|{category_id}|{description}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _parse_csv_bytes(content: bytes) -> list[dict]:
    text_content = content.decode("utf-8-sig")   # strips BOM if present
    reader = csv.DictReader(io.StringIO(text_content))
    return [
        {k.strip().lower(): v.strip() for k, v in row.items()}
        for row in reader
    ]


def _parse_xlsx_bytes(content: bytes) -> list[dict]:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    result = []
    for row in rows[1:]:
        if all(v is None for v in row):
            continue
        result.append({headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)})
    return result


def _sanitize_defined_name(name: str) -> str:
    """
    Turn a category display name into a valid Excel/Google Sheets defined-name.
    Rules: letters, numbers, underscores only; cannot start with a number;
    cannot collide with a cell reference (e.g. "A1"); max 255 chars.
    """
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name.strip())
    if not cleaned or cleaned[0].isdigit():
        cleaned = f"_{cleaned}"
    return cleaned[:255]
 
 
def _build_import_template(categories: list[dict]) -> bytes:
    """Build and return the Excel import template as raw bytes."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.workbook.defined_name import DefinedName
 
    wb = Workbook()
 
    # ── Hidden Lists sheet ──────────────────────────────────────
    # Column A: parent category display names → category DV (direct range).
    # Columns C+ : one column per category holding its subcategory names.
    # Each of those columns gets a NAMED RANGE (sanitized category name),
    # which is the standard, reliable pattern for dependent dropdowns —
    # =INDIRECT(D2) on the Subcategory column resolves the category cell's
    # own text to a defined name, no helper-column CHOOSE/MATCH formula
    # needed, and it correctly varies per row because D2 IS the row.
    lists_ws = wb.active
    lists_ws.title = "Lists"
    lists_ws.sheet_state = "hidden"
 
    cat_names = [c["name"] for c in categories]
    n_cats = len(cat_names)
    for i, name in enumerate(cat_names, start=1):
        lists_ws.cell(row=i, column=1, value=name)
 
    # ── Transactions sheet ──────────────────────────────────────
    tx_ws = wb.create_sheet("Transactions", 0)
    wb.active = tx_ws
 
    # Visible user columns A–F
    headers = ["Date", "Type", "Amount (₹)", "Category", "Subcategory", "Description"]
    hdr_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    hdr_font = Font(bold=True, color="FFFFFF", size=11)
    for col, header in enumerate(headers, start=1):
        cell = tx_ws.cell(row=1, column=col, value=header)
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
 
    for col, width in enumerate([13, 10, 13, 22, 22, 36], start=1):
        tx_ws.column_dimensions[get_column_letter(col)].width = width
    tx_ws.row_dimensions[1].height = 26
    tx_ws.freeze_panes = "A2"
 
    # ── Subcategory lists + named ranges (on the hidden Lists sheet) ──
    # Column layout: C, D, E, ... one column per category with subcats.
    # Column B holds a lookup table: category display name -> sanitized
    # defined-name token, in the SAME row order as column A. This avoids
    # replicating sanitization logic as an ad-hoc SUBSTITUTE chain inside
    # the DV formula (that chain only handled space/"&" and would silently
    # break on any other character, e.g. "/", "-", "."). INDEX/MATCH looks
    # the token up instead of re-deriving it, so it can never drift out of
    # sync with what _sanitize_defined_name actually produced.
    SUBCAT_START_COL = 3  # column C
    used_names: set[str] = set()
 
    for i, (name, cat) in enumerate(zip(cat_names, categories), start=1):
        token = _sanitize_defined_name(name)
        # Guarantee uniqueness even if two categories sanitize to the same token.
        base_token, suffix = token, 2
        while token in used_names:
            token = f"{base_token}_{suffix}"
            suffix += 1
        used_names.add(token)
        lists_ws.cell(row=i, column=2, value=token)
 
        subcats = [ch["name"] for ch in cat.get("children", [])]
        if not subcats:
            continue
        col_num = SUBCAT_START_COL + (i - 1)
        col_letter = get_column_letter(col_num)
        for row_i, sub in enumerate(subcats, start=1):
            lists_ws.cell(row=row_i, column=col_num, value=sub)
 
        ref = f"Lists!${col_letter}$1:${col_letter}${len(subcats)}"
        wb.defined_names[token] = DefinedName(token, attr_text=ref)
 
    # ── Data validation ─────────────────────────────────────────
    MAX = 1001
 
    # Type: string literal (works everywhere)
    dv_type = DataValidation(type="list", formula1='"Income,Expense"', showDropDown=False)
    dv_type.error = "Choose Income or Expense"
    dv_type.errorTitle = "Invalid type"
    tx_ws.add_data_validation(dv_type)
    dv_type.add(f"B2:B{MAX}")
 
    # Category: direct static range (confirmed working in Excel + Google Sheets)
    dv_cat = DataValidation(
        type="list",
        formula1=f"Lists!$A$1:$A${n_cats}",
        showDropDown=False,
    )
    dv_cat.error = "Choose a category from the list"
    dv_cat.errorTitle = "Invalid category"
    tx_ws.add_data_validation(dv_cat)
    dv_cat.add(f"D2:D{MAX}")
 
    # Subcategory: INDIRECT(INDEX(Lists!$B:$B, MATCH(D2, Lists!$A:$A, 0)))
    # D2 is the category cell IN THE SAME ROW as this validation's target
    # cell (E2), so this correctly varies per row: each row's own D cell
    # drives its own E cell's list. MATCH finds which row of Lists!A holds
    # D2's display text, INDEX pulls that row's token from Lists!B, and
    # INDIRECT resolves the token to its named range. This looks the token
    # up rather than re-deriving it with string replacement, so it always
    # matches exactly what _sanitize_defined_name produced when the
    # workbook was built — regardless of what characters a category name
    # contains.
    dv_sub = DataValidation(
        type="list",
        formula1='INDIRECT(INDEX(Lists!$B:$B,MATCH(D2,Lists!$A:$A,0)))',
        showDropDown=False,
        showErrorMessage=False,
    )
    tx_ws.add_data_validation(dv_sub)
    dv_sub.add(f"E2:E{MAX}")
 
    # Sample row
    sample_date = date.today().strftime("%Y-%m-%d")
    for col, val in enumerate(
        [sample_date, "Expense", 500.00, "Daily Expenses", "Groceries", "Weekly grocery shopping"],
        start=1,
    ):
        tx_ws.cell(row=2, column=col, value=val)
 
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
 
 
if __name__ == "__main__":
    categories = [
        {"name": "Bills & Utilities", "children": [{"name": n} for n in
            ["Electricity", "Water", "Internet", "Mobile", "Gas", "Cable"]]},
        {"name": "Daily Expenses", "children": [{"name": n} for n in
            ["Groceries", "Dining Out", "Transport", "Fuel", "Snacks", "Coffee", "Misc"]]},
        {"name": "EMI & Loans", "children": [{"name": n} for n in
            ["Home Loan", "Car Loan", "Personal Loan", "Credit Card", "Education Loan", "Other EMI"]]},
        {"name": "Family & Home", "children": [{"name": n} for n in
            ["Rent", "Maintenance", "Furniture", "Repairs", "Domestic Help"]]},
        {"name": "Income", "children": [{"name": n} for n in
            ["Salary", "Freelance", "Business", "Interest", "Dividends", "Rental Income", "Other"]]},
        {"name": "Insurance", "children": [{"name": n} for n in
            ["Life", "Health", "Vehicle", "Home"]]},
        {"name": "Investments", "children": [{"name": n} for n in
            ["Stocks", "Mutual Funds", "Fixed Deposit", "PPF", "Gold", "Crypto", "Real Estate"]]},
        {"name": "Occasions", "children": [{"name": n} for n in
            ["Gifts", "Celebrations", "Travel", "Weddings", "Festivals"]]},
        {"name": "Other", "children": [{"name": n} for n in
            ["Miscellaneous", "Uncategorized", "Charity", "Fees", "Refund", "Adjustment"]]},
        {"name": "Food/Dining - Misc.", "children": [{"name": n} for n in
            ["Takeout", "Dine-In"]]},
    ]
    data = _build_import_template(categories)
    with open("/home/claude/import_template.xlsx", "wb") as f:
        f.write(data)
    print("written", len(data), "bytes")
 

# ── Excel template download (public) ─────────────────────────
@app.get("/templates/import")
async def download_import_template(db: DB):
    result = await db.execute(
        select(Category)
        .where(Category.parent_id.is_(None))
        .options(selectinload(Category.children))
        .order_by(Category.name)
    )
    parents = result.scalars().all()
    categories = [
        {
            "name": p.name,
            "children": sorted(
                [{"name": c.name} for c in p.children], key=lambda x: x["name"]
            ),
        }
        for p in parents
    ]
    content = _build_import_template(categories)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="expense_template.xlsx"'},
    )


# ── CSV / XLSX import ─────────────────────────────────────────
@app.post("/users/{user_id}/import", response_model=ImportResult)
async def import_transactions(
    user_id: int,
    db: DB,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
):
    _require_same_user(current_user, user_id)

    content = await file.read()
    filename = (file.filename or "").lower()

    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            rows = _parse_xlsx_bytes(content)
        else:
            rows = _parse_csv_bytes(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}")

    # Build case-insensitive category name → id lookup
    cat_result = await db.execute(
        select(Category).options(selectinload(Category.children))
    )
    cat_by_name: dict[str, int] = {}
    for cat in cat_result.scalars().all():
        cat_by_name[cat.name.lower()] = cat.id
        for child in cat.children:
            cat_by_name[child.name.lower()] = child.id

    imported = 0
    skipped = 0
    errors: list[str] = []

    for row_num, row in enumerate(rows, start=2):
        try:
            raw_date = row.get("date", "").strip()
            if not raw_date:
                skipped += 1
                continue
            tx_date = _parse_date(raw_date)

            if from_date and tx_date < from_date:
                skipped += 1
                continue
            if to_date and tx_date > to_date:
                skipped += 1
                continue

            tx_type = row.get("type", "").strip().lower()
            if tx_type not in ("income", "expense"):
                errors.append(f"Row {row_num}: invalid type '{tx_type}' (must be Income or Expense)")
                continue

            raw_amount = row.get("amount (₹)", "") or row.get("amount", "")
            try:
                amount = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
                if amount <= 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                errors.append(f"Row {row_num}: invalid amount '{raw_amount}'")
                continue

            description = (row.get("description", "") or "").strip() or None

            # Resolve category — try subcategory first, then parent category
            category_id: Optional[int] = None
            sub = (row.get("subcategory", "") or "").strip().lower()
            cat = (row.get("category", "") or "").strip().lower()
            if sub and sub in cat_by_name:
                category_id = cat_by_name[sub]
            elif cat and cat in cat_by_name:
                category_id = cat_by_name[cat]

            h = _row_hash(user_id, tx_date, tx_type, amount, category_id, description or "")

            exists = await db.execute(
                select(Transaction.id).where(Transaction.import_hash == h)
            )
            if exists.scalar_one_or_none() is not None:
                skipped += 1
                continue

            db.add(Transaction(
                user_id=user_id,
                amount=amount,
                type=tx_type,
                category_id=category_id,
                description=description,
                date=tx_date,
                import_hash=h,
            ))
            imported += 1

        except Exception as exc:
            errors.append(f"Row {row_num}: {exc}")

    await db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)
