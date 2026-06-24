# Database migrations

Migration files use a zero-padded sequential version and a short snake_case description:

```text
NNN_description.sql
```

Examples:

```text
001_initial_schema.sql
010_add_club_profile_locale.sql
```

Rules:

- Use the next sequential version number with three digits.
- Keep the description lowercase snake_case with words that describe the migration.
- Do not skip version numbers.
- Do not reuse a version number.
- Do not edit migrations that have already been released. Add a new migration instead.

The runner stores the latest applied numeric version in SQLite `PRAGMA user_version`.
