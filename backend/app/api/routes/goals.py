from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.goal import Goal
from app.models.user import User
from app.schemas.goal import GoalContributeRequest, GoalCreate, GoalOut, GoalUpdate

router = APIRouter()


def _serialize_goal(goal: Goal) -> GoalOut:
    target = float(goal.target_amount)
    current = float(goal.current_amount)
    progress = 0.0 if target <= 0 else min((current / target) * 100, 9999.0)
    return GoalOut(
        id=goal.id,
        user_id=goal.user_id,
        name=goal.name,
        currency=goal.currency,
        target_amount=target,
        current_amount=current,
        target_date=goal.target_date,
        kind=goal.kind,
        status=goal.status,
        notes=goal.notes,
        progress_pct=round(progress, 2),
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


def _goal_or_404(db: Session, user_id: int, goal_id: int) -> Goal:
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.get("", response_model=list[GoalOut])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GoalOut]:
    rows = (
        db.query(Goal)
        .filter(Goal.user_id == current_user.id)
        .order_by(Goal.target_date.asc().nulls_last(), Goal.id.asc())
        .all()
    )
    return [_serialize_goal(row) for row in rows]


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    status_value = payload.status
    if payload.current_amount >= payload.target_amount and status_value == "active":
        status_value = "completed"
    goal = Goal(
        user_id=current_user.id,
        name=payload.name.strip(),
        currency=payload.currency,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        target_date=payload.target_date,
        kind=payload.kind,
        status=status_value,
        notes=payload.notes,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _serialize_goal(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    goal = _goal_or_404(db, current_user.id, goal_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(goal, field, value)
    if goal.current_amount >= goal.target_amount and goal.status == "active":
        goal.status = "completed"
    db.commit()
    db.refresh(goal)
    return _serialize_goal(goal)


@router.post("/{goal_id}/contribute", response_model=GoalOut)
def contribute_to_goal(
    goal_id: int,
    payload: GoalContributeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    goal = _goal_or_404(db, current_user.id, goal_id)
    next_current_amount = max(float(goal.current_amount) + payload.amount, 0.0)
    goal.current_amount = next_current_amount
    if goal.current_amount >= goal.target_amount and goal.status == "active":
        goal.status = "completed"
    db.commit()
    db.refresh(goal)
    return _serialize_goal(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    goal = _goal_or_404(db, current_user.id, goal_id)
    db.delete(goal)
    db.commit()
    return None

