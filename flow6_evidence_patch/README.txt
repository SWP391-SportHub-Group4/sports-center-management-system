Flow6 evidence test patch. Requires bilingual 120-case and paced runner patches.
Only changes flow6-live-tests/Program.cs; no production API or prompt changes.
Four Member cases may accept explorePackages in place of myClasses only when the
answer context actually contains complete catalog evidence and enrollment booleans.
The self-test checks missing enrollment, both truncation flags and omitted topics.
This is structural evidence validation; it does not automatically establish that
LLM answers avoid unsupported claims. Manual semantic review remains mandatory.
No dotnet build or live Gemini test was available in the preparation environment.
