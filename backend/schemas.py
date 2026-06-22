"""
schemas.py — Pydantic request / response models
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Users ─────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Categories ────────────────────────────────────────────────
class SubCategoryOut(BaseModel):
    id: int
    name: str
    icon: Optional[str] = None
    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    id: int
    name: str
    icon: Optional[str] = None
    children: list[SubCategoryOut] = []
    model_config = {"from_attributes": True}


# ── Transactions ──────────────────────────────────────────────
class TransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    type: Literal["income", "expense"]
    category_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=500)
    date: date

    @field_validator("amount")
    @classmethod
    def round_amount(cls, v: Decimal) -> Decimal:
        return round(v, 2)


class TransactionOut(BaseModel):
    id: int
    amount: Decimal
    type: str
    category: Optional[CategoryOut] = None
    description: Optional[str] = None
    date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[TransactionOut]


# ── Budgets ───────────────────────────────────────────────────
class BudgetUpsert(BaseModel):
    category_id: int
    monthly_limit: Decimal = Field(gt=0, decimal_places=2)


class BudgetOut(BaseModel):
    id: int
    category: CategoryOut
    monthly_limit: Decimal

    model_config = {"from_attributes": True}


class BudgetStatus(BaseModel):
    category: str
    monthly_limit: Decimal
    spent: Decimal
    remaining: Decimal
    percent_used: float


# ── AI / Chat ─────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    sql_used: Optional[str] = None      # returned in debug mode only


# ── Insights ──────────────────────────────────────────────────
class InsightOut(BaseModel):
    title: str
    body: str
    severity: Literal["info", "warning", "danger"]