# Coach avatars

Coach avatars use the same Cloudinary workflow as Member avatars. See [Avatar-Cloudinary](Avatar-Cloudinary.md) for the current API, permissions, upload limits, migration, reporting, and configuration.

The earlier Coach-only upload endpoint and editor were replaced by the shared avatar API and account editor during the `develop` merge. The `AddCoachAvatars` migration remains in Git history so databases that already applied it can continue upgrading. Its column operations are idempotent because `AddAvatars` can run first on a new database.
