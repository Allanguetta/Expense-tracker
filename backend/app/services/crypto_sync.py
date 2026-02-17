from datetime import datetime

from sqlalchemy.orm import Session

from app.models.sync_log import SyncLog


def queue_coinbase_sync(db: Session, user_id: int) -> SyncLog:
    sync_log = SyncLog(
        user_id=user_id,
        provider="coinbase",
        status="queued",
        started_at=datetime.utcnow(),
    )
    db.add(sync_log)
    db.commit()
    db.refresh(sync_log)
    return sync_log
