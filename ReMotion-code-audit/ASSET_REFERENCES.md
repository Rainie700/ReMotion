# ASSET_REFERENCES.md

Image / binary assets are **deliberately excluded** from this audit package
(see the audit brief, section 4). This file lists the asset filenames that
current source code references, where they live in the repository, and what
code points at them, so an architecture reviewer can follow the references
without the binaries.

All paths below are browser-absolute (`/images/...`), served from
`public/images/...` in the repo (Vite copies `public/` to the site root; the
built copy also appears under `dist/images/...`).

---

## 1. Functional Assessment — six-region selector

Source: `app.js` → `FUNCTIONAL_ASSESSMENT_REGIONS` (array) and
`functionalAssessmentBodyRegionPage()` / `renderFunctionalAssessmentRegionButton()`.

| Referenced file | Repo path | Referenced by | Notes |
|---|---|---|---|
| `/images/Medical/body_health/medical_body_front.png` | `public/images/Medical/body_health/medical_body_front.png` | `functionalAssessmentBodyRegionPage()` main human-body visual | |
| `/images/Medical/body_health/medical_shoulder.png` | same | region `shoulder` icon (`available: true`) | |
| `/images/Medical/body_health/medical_neck.png` | same | region `neck` icon (`available: false`) | placeholder region |
| `/images/Medical/body_health/medical_spine.png` | same | region `trunk` (腰背／軀幹) icon (`available: false`) | placeholder region |
| `/images/Medical/body_health/medical_hip.png` | same | region `hip` icon (`available: false`) | placeholder region |
| *(none)* | — | region `knee` (膝部) | `icon: null` in source — renders a CSS fallback box; brief comment says no matching asset exists |
| `/images/Medical/body_health/medical_ankle.png` | same | region `ankle` icon (`available: false`) | placeholder region |

## 2. Functional Assessment — Shoulder movement instruction illustrations

Source: `app.js` → `FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS` (array), consumed
by `functionalAssessmentShoulderSessionPage()`.

Movement `shoulder_flexion` (肩關節前屈, side view):
| Referenced file | Repo path | Caption |
|---|---|---|
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_neutral.png` | `public/images/Medical/body_health/assessment/shoulder/Function/` | 開始 |
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_flexion_90.png` | same | 抬起 |
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_overhead.png` | same | 向上 |

Movement `shoulder_abduction` (肩關節外展, front view):
| Referenced file | Repo path | Caption |
|---|---|---|
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_neutral.png` | `public/images/Medical/body_health/assessment/shoulder/Function/` | 開始 |
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_abduction_90.png` | same | 抬起 |
| `/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_overhead.png` | same | 向上 |

Additional shoulder assessment art present in `public/images/.../assessment/shoulder/`
(`Before_After/`, `angle/`, and other `Function/` files) is **not referenced by
current code** — it appears to be prepared for later phases.

## 3. Home — AI Dynamic Functional Assessment entry card

Source: `app.js` → `renderDashboard()` / patient-home render helpers.

| Referenced file | Repo path | Referenced by |
|---|---|---|
| `/images/Medical/body_health/ai_dynamic_assessment_hero.png` | `public/images/Medical/body_health/` | functional-assessment feature card |
| `/images/Medical/body_health/ai_dynamic_assessment_icon.png` | same | functional-assessment feature card |
| `/images/Medical/body_health/medical_recovery_progress.png` | same | home progress card |

## 4. Self-Practice Library quick-filter icons

Source: `app.js` (Self Practice Library "依部位 / 依目標" chips).

| Referenced file | Repo path |
|---|---|
| `/images/icon_body_core.png` | `public/images/` |
| `/images/icon_body_daily_function.png` | `public/images/` |
| `/images/icon_body_hip.png` | `public/images/` |
| `/images/icon_body_lower_limb.png` | `public/images/` |
| `/images/icon_body_shoulder.png` | `public/images/` |
| `/images/icon_goal_balance.png` | `public/images/` |
| `/images/icon_goal_mobility.png` | `public/images/` |
| `/images/icon_goal_strength.png` | `public/images/` |

## 5. Bottom navigation icons

Source: `app.js` → `BASE_TABS` + `renderNav()`.

`/images/home.png`, `/images/home_selected.png`, `/images/train.png`,
`/images/train_selected.png`, `/images/files.png`, `/images/files_selected.png`,
`/images/data.png`, `/images/data_selected.png`, `/images/profile.png`,
`/images/profile_selected.png` — all in `public/images/`.

## 6. AI training / robot companion / gamification art

- Squat & HP02 AI training pages reference `/images/ai_robot.png` and
  `/images/robot/robot_*.png` (idle/happy/encourage/warning/...), driven by
  `js/ai/squatRobotCompanion.js` (`pickSquatRobotState()`).
- Exercise thumbnails: `/images/exercise/exercise_*.png` — referenced by
  `exerciseDetailPage()` / library list via each catalog entry.
- Gamification (`/images/gamification/*.png`, `/images/plant/*.png`,
  `/images/weather/*.png`) — referenced by home/reward/achievement pages.

`app.js` references roughly **129 distinct `/images/...` files** in total. The
full binary set lives under `public/images/` (and a build copy under
`dist/images/`); none are needed for architecture review.

## 7. Icons / manifest

- `index.html` → `/styles.css`, `manifest.json`.
- `public/manifest.json` → `/images/RM_icon.png`, `/images/RM.ico`.
