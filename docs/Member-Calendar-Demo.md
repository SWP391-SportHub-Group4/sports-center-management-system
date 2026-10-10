# Member calendar demo

The calendar fixture targets only `an.member@sporthub.vn` in a local Development
database. It does not run during normal application startup.

From the repository root:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --project backend/SportHub.API -- --seed-member-calendar=true
```

The base demo Member and manager must already exist. The command creates dedicated
demo coaches and courts for Badminton and Basketball, two published courses with
six sessions each, confirmed enrollments, and four confirmed one-hour court rentals.
Dates start after the current Vietnam date. Monthly class codes and rental invoice
descriptions prevent duplication on reruns. All additions share one transaction;
the existing shared room/coach occupancy constraints still apply.

Invoices and cash payment rows are explicitly synthetic legacy fixtures for demo
lineage. No gateway transaction, wallet charge or email is sent by this seeder.
These records are persisted data, not a frontend mock.

Calendar stickers use a shuttlecock, basketball or dumbbell to identify the sport.
A blue book badge identifies a class, an amber location badge a court booking,
and a teal person badge a PT session. The text labels, timestamps, event colors
and existing detail actions remain available; sticker movement is only on hover
or focus and respects reduced motion.
