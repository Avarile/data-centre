The repo uses Conventional Commits enforced by commitlint + husky. Here's the full requirement:

  Format:
  <type>(<scope>): <subject>

  [optional body]

  [optional footer]

  Allowed types:

  ┌─────────────┬────────────────────────────────────┐
  │    Type     │              Use for               │
  ├─────────────┼────────────────────────────────────┤
  │ feat        │ New feature                        │
  ├─────────────┼────────────────────────────────────┤
  │ fix         │ Bug fix                            │
  ├─────────────┼────────────────────────────────────┤
  │ docs        │ Documentation only                 │
  ├─────────────┼────────────────────────────────────┤
  │ style       │ Formatting, no logic change        │
  ├─────────────┼────────────────────────────────────┤
  │ refactor    │ Code restructure, no feature/fix   │
  ├─────────────┼────────────────────────────────────┤
  │ perf        │ Performance improvement            │
  ├─────────────┼────────────────────────────────────┤
  │ test        │ Adding/fixing tests                │
  ├─────────────┼────────────────────────────────────┤
  │ build       │ Build system or dependency changes │
  ├─────────────┼────────────────────────────────────┤
  │ ci          │ CI config changes                  │
  ├─────────────┼────────────────────────────────────┤
  │ chore       │ Maintenance tasks                  │
  ├─────────────┼────────────────────────────────────┤
  │ revert      │ Reverting a commit                 │
  ├─────────────┼────────────────────────────────────┤
  │ translation │ i18n/locale changes                │
  ├─────────────┼────────────────────────────────────┤
  │ security    │ Security fixes                     │
  └─────────────┴────────────────────────────────────┘
  
  Rules enforced (errors if violated):

- type must be lowercase, non-empty, from the list above  
- scope must be lowercase (if provided)
- subject must not be empty, must not end with ., must not be Sentence-case, Start-Case, PascalCase, or UPPER-CASE
- Header (first line) max 100 characters
- Body and footer must have a blank line before them

  Valid examples:
  feat(auth): add OAuth2 support
  fix(db): handle null pointer in migration
  docs: update README with setup instructions
  feat(ui): add dark mode toggle

  git add . && git commit -m "feat(ui): add dark mode toggle" && git push origin dev