"""
scheduler.py — APScheduler job that runs the insight engine nightly.
Start alongside uvicorn:  python scheduler.py
Or import and call start_scheduler(app) inside lifespan.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, text

logger = logging.getLogger(__name__)


def start_scheduler(app):
    """
    Call this inside the FastAPI lifespan after the DB is ready.
    Runs generate_insights for every user at 02:00 every night.
    """
    from ai_agent import InsightEngine

    scheduler = AsyncIOScheduler(timezone="UTC")

    @scheduler.scheduled_job(CronTrigger(hour=2, minute=0))
    async def nightly_insights():
        settings = app.state.settings
        async with app.state.session_factory() as db:
            rows = await db.execute(select(text("id FROM users")))
            user_ids = [r[0] for r in rows.all()]

        engine = InsightEngine(settings)
        for uid in user_ids:
            try:
                insights = engine.generate_insights(uid)
                logger.info("Generated %d insights for user %d", len(insights), uid)
                # TODO: push to notification queue or websocket here
            except Exception as exc:
                logger.error("Insight error for user %d: %s", uid, exc)

    scheduler.start()
    logger.info("Scheduler started — nightly insights at 02:00 UTC")
    return scheduler