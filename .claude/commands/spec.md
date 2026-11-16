---
description: Generate a testable feature spec in specs/
argument-hint: <feature name and short description>
---
Write a spec for: $ARGUMENTS

First explore the codebase (read CLAUDE.md, routes, controllers, services,
models, slices, components) and list what ALREADY EXISTS for this feature.
Build only what is missing.

Save to specs/<feature-slug>-spec.md with these sections:
1. Summary and goals
2. Out of scope
3. What already exists (file paths)
4. User stories
5. Acceptance criteria (numbered, each testable)
6. Edge cases and error cases (auth, ownership, validation, 404, duplicates)
7. API contract (method, path, auth, request, response in the
   { success, message, data } envelope, status codes)
8. Data model changes
9. UI behaviour (where it appears, states, empty states)
10. File list (files to create and files to modify)
11. Test list (backend and frontend)
12. Open questions

Do not write any code. Stop after saving the file and list open questions.
