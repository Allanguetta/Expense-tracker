from fastapi import APIRouter

from app.api.routes import (
    accounts,
    auth,
    budgets,
    categories,
    crypto,
    dashboard,
    debts,
    health,
    recurring,
    transactions,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(debts.router, prefix="/debts", tags=["debts"])
api_router.include_router(recurring.router, prefix="/recurring-payments", tags=["recurring"])
api_router.include_router(crypto.router, prefix="/crypto", tags=["crypto"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
