#!/usr/bin/env bash
# Backend v3 business-rule gate. Run from any directory; requires .NET 10 and Docker.
# Real HTTP/DB integration suites replace the old mutable demo-data curl scenarios:
# Security: auth, JWT, OTP, roles and account locking.
# Scheduling: Gym, attendance, publish, seat/occupancy races and threshold transfer.
# Payment: split checkout, callback/expiry, refunds, rental/incident, export and outbox.
# Training: relationships, PT quota, workouts and homework.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# An external shared database can defeat test isolation; use the factories' disposable containers.
unset SPORTHUB_TEST_POSTGRES
dotnet restore backend/SportHub.sln
dotnet build backend/SportHub.sln --configuration Release --no-restore
dotnet test backend/SportHub.sln --configuration Release --no-build \
  --logger 'trx;LogFilePrefix=business-rules'
dotnet ef migrations has-pending-model-changes --project backend/SportHub.API \
  --startup-project backend/SportHub.API --configuration Release --no-build
