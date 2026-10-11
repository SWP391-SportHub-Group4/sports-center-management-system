# Coach avatars

PT, badminton and basketball coaches upload their own photo in **Tài khoản của tôi → Ảnh đại diện**. Choose a file, review the circular preview, then save. Uploaded photos appear in the staff navbar on every Coach page, the account screen and the homepage account menu. Missing/broken images fall back to initials.

## Cloudinary configuration

Create a Cloudinary product environment and open **Console → Settings → API Keys**. Set these backend variables in the repository's local `.env` (already ignored) or the deployment's secret configuration:

```dotenv
Cloudinary__CloudName=your-cloud-name
Cloudinary__ApiKey=your-api-key
Cloudinary__ApiSecret=your-api-secret
```

Do not put the secret in a frontend env file or any `NEXT_PUBLIC_*` variable. No unsigned upload preset is needed: the API signs multipart uploads on the server using SHA-256. Docker Compose passes the same variables to the backend container.

Restart the API after configuration. Development startup automatically applies `AddCoachAvatars`; production must apply the EF migration using the normal deployment process. Existing accounts retain a null avatar until a photo is uploaded.

For local Windows machines with App Control blocking Debug DLLs, stop the current API in its terminal and use the existing Release command from the repository root:

```powershell
dotnet run --project backend/SportHub.API/SportHub.API.csproj -c Release -- --environment=Development --urls=http://localhost:5000 --DataProtection:KeysPath="$PWD/.tmp/local-api-keys"
```

## API and storage

- `POST /api/users/me/avatar`: authenticated Coach only, multipart form field `file`. User ID comes exclusively from JWT. Returns the updated account, including `avatarUrl`.
- JPEG/PNG/WebP, 5 MiB maximum, checked using MIME plus actual file signatures. Cloudinary decodes the image and saves a 512×512 face-aware thumbnail; SVG/GIF are excluded.
- Rate limit: 5 uploads/minute per authenticated user; bounded request size and Cloudinary timeout.
- Cloudinary image IDs use `sporthub/coach-avatars/{userId}/{randomId}`. The database stores only `avatar_url` and `avatar_public_id` on `user_profiles`. Public URL is appropriate for an avatar; no health information is uploaded.
- Compare-and-swap prevents concurrent updates from silently replacing each other. Name/phone are not overwritten by avatar changes. A conflict retains the existing photo and removes the newly uploaded asset.
- Replaced photos are deleted after the database update. Cleanup failure logs the image ID for an operator to remove; it does not undo the saved avatar. No secret or upstream response body is logged.
- When credentials are absent, other application functionality remains available; the upload endpoint returns `503 avatar_storage_unavailable` with a user-facing message.

Implementation follows [Cloudinary authentication signatures](https://cloudinary.com/documentation/authentication_signatures) and the [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference).
