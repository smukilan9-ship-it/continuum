# Resource broker

Continuum optimizes for the learner’s outcome, not time inside the app.

## Registry

Each reviewed resource records provider, authority, cost, level, curriculum/topic tags, formats, URL, accessibility, quality score, review time, access requirements, estimated time, exact locator, strengths, weaknesses, focus instructions, completion instructions, official-program status, and a verification contract.

The built-in registry includes native tutoring, PhET, OpenStax, NCERT, MIT OpenCourseWare, Bluebook, official Khan Academy SAT preparation, NotebookLM, Google Colab, and Claude Science. Registry entries are seeded into Postgres and can be reviewed/versioned by operators.

## Ranking

Deterministic ranking evaluates:

- topical overlap (a hard eligibility condition);
- current need, such as intuition, official exam simulation, evidence, or coding;
- official/authority status;
- reviewed quality;
- level and curriculum alignment;
- available time;
- cost preference;
- format and accessibility preferences.

Official resources receive preference for official exams and curriculum-canonical tasks. A resource that does not overlap the topic is not recommended, even if it has high authority. The response includes alternatives and the reason each lost.

The broker does not search the entire public web live. “Best” means best among the current reviewed eligible registry, not a provable global optimum. Production operations should monitor broken links, stale review dates, geographic access, and resource outcomes, then expand the registry deliberately.

## Guided handoff and return

1. Rank native and external candidates.
2. Persist the selected recommendation and verification contract.
3. Tell the user the exact section/activity, what to focus on, what to finish, access/cost, time, and why it beats the alternatives.
4. Open the external resource only after the handoff is saved.
5. Record the return separately from completion.
6. Run the verification contract.
7. Automatically accept only machine-checkable evidence. Scores, artifacts, and open responses stay pending review unless independently verified.
8. On a pass, update the concept’s mastery from unseen assessment evidence, append an event, create an outcome receipt, and commit a 15-minute follow-up block to the linked goal.

Opening a link, reading a lesson, or self-reporting an artifact never silently raises transfer mastery.

## Native versus external

Native tutoring is appropriate when Continuum has a narrow, adaptive, source-grounded intervention and immediate verification adds value. External resources win when their authority, interaction design, official status, specialist environment, or source workflow is stronger. The UI labels this explicitly as `NATIVE` or `LEAVE CONTINUUM`.
