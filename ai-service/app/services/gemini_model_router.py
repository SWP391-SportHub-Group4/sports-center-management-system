"""Opt-in Flow5/Flow6 routing; SQLite counters are estimates, not Google quota telemetry."""
import json
import logging
import math
import sqlite3
from contextlib import closing
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from threading import RLock

log = logging.getLogger('sporthub.ai.router')
ROOT = Path(__file__).resolve().parents[2]

class ModelRouter:
    def __init__(self, config=ROOT / 'gemini-router.json', db=ROOT / '.gemini-router.sqlite3', clock=time.time):
        self.config, self.db, self.clock = Path(config), Path(db), clock
        self.lock = RLock()

    def _day(self):
        now = datetime.fromtimestamp(self.clock(), timezone.utc).astimezone(ZoneInfo('America/Los_Angeles'))
        return now.date().isoformat(), (now.replace(hour=0, minute=0, second=0, microsecond=0)+timedelta(days=1)).timestamp()

    def _reserve(self, scope, model, limit, threshold, enforce):
        day, _ = self._day()
        with self.lock, closing(sqlite3.connect(self.db, timeout=5)) as c, c:
            c.execute('CREATE TABLE IF NOT EXISTS quota (scope TEXT, model TEXT, day TEXT, used INTEGER, blocked REAL, PRIMARY KEY(scope,model,day))')
            c.execute('BEGIN IMMEDIATE')
            c.execute('INSERT OR IGNORE INTO quota VALUES (?,?,?,0,0)', (scope,model,day))
            used, blocked = c.execute('SELECT used,blocked FROM quota WHERE scope=? AND model=? AND day=?',(scope,model,day)).fetchone()
            if enforce and (used >= math.ceil(limit*threshold/100) or blocked > self.clock()):
                return False
            c.execute('UPDATE quota SET used=used+1 WHERE scope=? AND model=? AND day=?',(scope,model,day))
            return True

    def _block(self, scope, model, error):
        day, reset = self._day()
        code = getattr(error, 'code', '')
        # Sanitized upstream wrapper retains SDK error as cause. Inspect internally only.
        cause = error.__cause__
        raw = str(cause or '')
        daily = 'GenerateRequestsPerDay' in raw or 'per day limit' in raw.lower()
        until = reset if daily else self.clock() + (60 if code == 'ai_quota_exceeded' else 15)
        with self.lock, closing(sqlite3.connect(self.db, timeout=5)) as c, c:
            c.execute('UPDATE quota SET blocked=MAX(blocked,?) WHERE scope=? AND model=? AND day=?',(until,scope,model,day))

    def run(self, primary, flow5, invoke, *, flow6=False, scope_override=None):
        cfg = json.loads(self.config.read_text(encoding='utf-8-sig')) if self.config.exists() else {}
        if not cfg.get('enabled', False):
            if scope_override is not None:
                raise ValueError('Four-project routing requires an enabled gemini-router.json')
            return invoke(primary), primary
        scope = scope_override or cfg['project_scope']
        threshold = int(cfg['threshold_percent'])
        limits = cfg['daily_limits']
        if not scope or not 1 <= threshold <= 100 or any(type(v) is not int or v <= 0 for v in limits.values()):
            raise ValueError('Invalid Gemini router configuration')
        routed = flow5 or flow6
        models = list(dict.fromkeys([primary]+(cfg['fallback_models'] if routed else [])))
        last = None
        for model in models:
            if model not in limits:
                if routed: raise ValueError('Missing model quota configuration')
                return invoke(primary), primary
            try:
                reserved = self._reserve(scope, model, limits[model], threshold, routed)
            except sqlite3.Error:
                # Never break unrelated chat because a local accounting DB is unavailable.
                if not routed: return invoke(primary), primary
                raise
            if not reserved: continue
            try:
                answer = invoke(model)
                log.info('Gemini response model=%s flow5=%s flow6=%s', model, flow5, flow6)
                return answer, model
            except Exception as exc:
                if not routed or getattr(exc,'code',None) not in ('ai_quota_exceeded','ai_provider_unavailable','ai_provider_timeout'):
                    raise
                last = exc
                self._block(scope, model, exc)
                log.warning('Gemini fallback model=%s code=%s',model,exc.code)
        if last: raise last
        # Import lazily to avoid circular import and preserve existing error mapping.
        from app.services.gemini_service import GeminiUpstreamError
        raise GeminiUpstreamError(429,'ai_quota_exceeded','The AI provider is rate limited. Please try again later.')

router = ModelRouter()
