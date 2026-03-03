# Future Upgrades

Based on staff feedback and historical process review. These are not needed for 2026 but should be considered for future years.

## Per-Bracket Voting Mode

Most years, brackets/divisions are decided **before** voting begins. Staff vote 16 items per bracket (4 at each tier), not 64 globally. The current system uses the 2026 exception format (global 64-pick ballot).

**To add:**
- `ballotRules.perDivision: true` config flag
- Admin assigns contenders to divisions during intake (before ballot opens)
- Ballot UI shows one division at a time with 4+4+4+4 = 16 picks per division
- Server validation checks per-division pick counts
- Staff can tab between divisions to fill out picks

This is the **highest priority upgrade** — it matches how most years actually work.

## Simpler Voting Option

Staff notes suggest voting could be as simple as "mark 16 favorites per bracket" with no tier ranking at all. Tiers exist mainly for tiebreaking.

**To add:**
- `ballotRules.mode: 'simple' | 'tiered'` config flag
- Simple mode: staff just clicks 16 items per bracket, all worth 1 point
- Tiered mode: current 4/3/2/1 system
- Admin chooses mode when setting up each year

## Late Additions During Voting

Staff should be able to add last-minute contenders even after the ballot window opens. Currently intake and ballot are separate phases.

**To add:**
- Allow intake submissions when phase is `ballot` (not just `intake`)
- Show a "suggest addition" button on the ballot page
- Admin approves late additions before they appear on ballots

## Theme / Bracket Planning Step

Step 1 in the historic process — staff brainstorm themes via email. This could eventually be in-app.

**To add:**
- A "planning" phase before intake opens
- Discussion thread or simple proposal/vote system for theme ideas
- Bracket name proposals and voting

Low priority — email works fine for this organic discussion.

## Email Notifications

Currently admin must email staff separately to announce windows opening/closing.

**To add:**
- "Notify staff" button in admin that sends email to all @theonering.net addresses
- Automatic reminders when ballot deadline approaches
- Notification when results are finalized

## Ballot Re-opening

Staff notes mention that submitted ballots should potentially be editable until the window closes.

**To add:**
- Allow staff to "unlock" a submitted ballot and re-submit before the deadline
- Currently submission is final — would need a status flow: draft -> submitted -> (reopen) -> re-submitted

## Export / Sharing

Step 5 — results need to go to Chris for graphics.

**To add:**
- "Export results" button that generates a clean summary (CSV, PDF, or formatted email)
- Division assignments with seed numbers, images, and bracket matchups
- Shareable public results page
