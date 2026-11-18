Partial patch: chat error messages for the shared Member/Coach drawer.
Includes local offline node tests. Language detection is heuristic; ambiguous or
mixed questions can be misclassified. Does not change model, prompt, evidence,
AI safety enforcement or Flow6 runner. Requires further evidence/DB tests.
Run from project root: node --test frontend/tests/chat-failure.test.mjs
Frontend build and typecheck were not run in the preparation environment.
