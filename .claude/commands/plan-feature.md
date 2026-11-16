---
description: Turn a spec into an ordered bottom-up implementation plan
argument-hint: <path to spec file>
---
Read the spec at $ARGUMENTS and CLAUDE.md. Save a plan to
specs/<feature-slug>-plan.md.

Order the tasks bottom-up:
1. Backend tests (write first, they should fail)
2. Model
3. Service
4. Controller
5. Route (static routes before /:id)
6. Frontend endpoint config, then service, then Redux slice
7. Components and pages
8. Frontend tests
9. Full test run and manual verification checklist

For each task give: file path, what changes, which acceptance criteria it
satisfies, and how to verify it. Mark each task as create or modify.
Do not write any code.
