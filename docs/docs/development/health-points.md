---
title: Health Points (Brownie Points) System
---

The **Health Points (HP)** system (also referred to as "Brownie Points") is a gamified engagement mechanics built into ViBe to encourage active participation and penalize late or missing submissions.

## 🎯 Core Mechanics

Every student starts a course with **100 HP** and a status of `healthy`. 
Throughout the course, this score fluctuates based on the student's actions:

- **Bonuses (Positive HP):** Awarded for proactive actions like early assignment submissions, exceeding milestone requirements, or active platform participation.
- **Penalties (Negative HP):** Deducted for negative behaviors like late submissions, missing mandatory activities, or failing proctoring checks.

### Status Tiers
A student's HP dictates their overall "Status" in the course, which can be used to restrict access or highlight at-risk students to the teacher:
- `healthy`: Standard status (e.g., 70 - 100 HP)
- `warning`: Mildly at-risk (e.g., 30 - 69 HP)
- `critical`: Severely at-risk, may require intervention (e.g., 0 - 29 HP)

---

## 🏗️ Backend Implementation

The HP system is driven by a MongoDB-backed repository and a dedicated service layer.

### Data Models (`IHealthPoints` & `IHPEvent`)
1. **Health Points Record**: Tracks the current total HP and status for a specific `userId` and `courseId` combination.
2. **HP Event Log**: An audit trail of every transaction (bonus or penalty). It records the `type` of event, the `percentageChange` (or absolute value), the `reason` (e.g., "Late submission for Quiz 1"), and the `createdBy` ID (system or teacher).

### Repository (`HealthPointsRepository.ts`)
- `initializeHP`: Grants 100 HP to a student upon course enrollment.
- `updateHP`: Modifies the current score and recalculates the status.
- `addEvent`: Appends a new transaction to the audit log.
- `getCourseHP`: An aggregation pipeline used by teachers to view the HP of all enrolled students in a specific course.

---

## 💻 Frontend Integration

The HP system is visible to both Students and Teachers, with tailored interfaces for each.

### 🎓 Student View (`StudentHealthPoints.tsx`)
- Students can view their current HP score displayed prominently on their course dashboard.
- They have access to a visual "HP History" timeline, showing exactly why points were added or deducted, ensuring transparency.

### 🧑‍🏫 Teacher View (`HealthPointsDetail.tsx` / `teacher-course-page.tsx`)
- Teachers have a dashboard to view the HP of all students in their course.
- They can manually intervene by awarding custom Bonus points or applying custom Penalties directly to a student's profile for offline or subjective activities.
