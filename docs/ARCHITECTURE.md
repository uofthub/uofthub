# Architecture

This document describes the system design of uofthub. It will evolve as the stack is finalized.

---

## Core concepts

```
                Student
                   │
                   ▼
            ┌──────────────┐
            │   Platform   │
            └──────┬───────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    Projects     People     Courses
        │
   ┌────┼─────┐
   ▼    ▼     ▼
 Files GitHub  Links
```

Future graph: Students → Projects → People → Courses → Research → Clubs → University.

---

## Data model (draft)

### User
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| email | string | must be `@mail.utoronto.ca` or `@utoronto.ca` |
| name | string | |
| faculty | string | |
| program | string | |
| class_year | int | |
| created_at | timestamp | |

### Project
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| owner_id | uuid | FK → User |
| title | string | |
| description | text | |
| tags | string[] | course, faculty, topic |
| visibility | enum | `private`, `uoft`, `public` |
| created_at | timestamp | |
| updated_at | timestamp | |

### ProjectCollaborator
| Field | Type | Notes |
|---|---|---|
| project_id | uuid | |
| user_id | uuid | |
| role | enum | `owner`, `collaborator`, `viewer` |
| accepted | bool | collaborators must accept invite |

### ProjectFile
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| name | string | |
| url | string | storage URL |
| size_bytes | int | |

### ProjectLink
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| label | string | e.g. "GitHub", "Demo" |
| url | string | |

---

## Auth

Students authenticate via U of T email verification (Google/Microsoft OAuth restricted to `@mail.utoronto.ca` / `@utoronto.ca` domains). Non-U of T visitors can browse public projects without an account.

Open question: exact mechanism for verifying student status (domain-restricted OAuth is the leading option for MVP).

---

## Visibility model

Projects have three visibility levels:

| Level | Who can see |
|---|---|
| `private` | Owner and invited collaborators only |
| `uoft` | Any authenticated U of T user |
| `public` | Anyone on the internet |

Default: `private`. Students must explicitly open visibility up.

TA/professor access is granted per-project by the student owner (generates a view-only invite link), never platform-wide.

---

## File storage

> TBD. Likely object storage (S3-compatible). Size limits and file type restrictions TBD.

---

## Stack decisions

> To be documented as decisions are made.

| Concern | Decision | Rationale |
|---|---|---|
| — | TBD | — |

---

## ADRs (Architecture Decision Records)

Significant decisions will be recorded as numbered ADRs in `docs/adr/`. ADR format: context → decision → consequences.
