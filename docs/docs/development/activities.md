---
title: Activities and Assignments
---

The **Activities** system in ViBe allows educators to create, assign, and track various coursework, milestones, and external tasks. It integrates directly with the Health Points (HP) system to reward timely completions and penalize late or missed work.

## 📝 Activity Types and Submissions

Activities can take multiple forms, defined by the `ActivityType` and `SubmissionMode`.

### Types of Activities
- `ASSIGNMENT`: Standard coursework with a definitive deadline.
- `VIBE_MILESTONE`: Crucial checkpoints in a course.
- `EXTERNAL_IMPORT`: Activities tracked outside the platform but recorded for grading/HP purposes.

### Submission Modes
- `IN_PLATFORM`: Students complete the activity directly within the ViBe application.
- `EXTERNAL_LINK`: Students are directed to a third-party tool (e.g., Google Forms, Gradescope) to complete the work.
- `CSV_IMPORT`: Used for bulk uploading external grades or completions by the teacher.

---

## ⚙️ The Health Points (HP) Connection

Activities are the primary driver for a student's Health Points. When a teacher creates an activity, they configure the HP impact:
- **Reward Type**: Fixed (Absolute) or Percentage-based increases.
- **Mandatory Status**: If an activity is mandatory, missing it results in an HP penalty.
- **Grace Periods**: Configurable extensions (in hours) that offer partial rewards (e.g., "Submit within 24 hours of the deadline for 50% credit").

---

## 🧑‍🏫 Teacher Workflow

Teachers manage activities via the **Dashboard** (`teacher-course-page.tsx` & `AddActivity.tsx`).

### Creating an Activity
Teachers define the core parameters:
1. **Details**: Title, Description, and Deadline.
2. **Behavior**: Type and Submission Mode.
3. **HP Logic**: Rewards, mandatory penalties, and grace periods.
4. **Visibility**: Activities can be saved as a `DRAFT` before being `PUBLISHED` to students.

### Tracking Progress
Teachers can view the overarching `isCompleted` status across all students to identify who is falling behind.

---

## 🎓 Student Workflow

Students interact with activities directly on their **Course Page** (`course-page.tsx`).

1. **Viewing Tasks**: Students see a list of assigned, published activities with clear deadlines.
2. **Execution**: Based on the `SubmissionMode`, they either complete the task in-app or navigate to an external link.
3. **Self-Declaration**: For certain external tasks, students utilize an in-app prompt to "Self-declare" completion. This creates a pending state until verified, instantly updating their local dashboard.
4. **HP Updates**: Upon successful submission, the system evaluates the timestamp against the deadline and grace period, automatically processing the HP reward or penalty.
