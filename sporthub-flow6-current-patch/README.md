# SportHub Flow 6 patch for Current Files snapshot

Applies only to the seven files in `SportHub_Flow6_Current_Files.zip`. Run `--check` first. Any MISMATCH stops before modifications. Original files are copied to `.sporthub-flow6-chat-backups`.

- Member and Coach chatbot use the configured Gemini model fallback on quota, transient provider failures, or timeout. Coach plan and Flow 5 keep existing behavior.
- Member how-to questions, including class enrollment and notification bell, use local verified UI guidance before Gemini. Account-specific fact questions keep the existing Flow6 pipeline.
- Existing model list and API key remain unchanged. Distinct Google projects/keys for four AI features require a separate configuration change.

PowerShell at repository root:

```powershell
python .\sporthub-flow6-current-patch\install.py --root . --check
python .\sporthub-flow6-current-patch\install.py --root .
python .\ai-service\tests\test_gemini_model_router.py
```

Restart the Python AI service and .NET backend. Python router tests pass; .NET build and live provider behavior were not available in the packaging environment.
