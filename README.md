If you've ever wondered why there isn't the ability to create recurring tasks in Roam Research, with this extension there now is!

After you install this extension, it will automatically recognise new {{[[TODO]]}} items with a Repeat:: and/or Due:: attribute.

📘 Examples — Recurring Task Syntax

You can record a recurring task either:

Inline, with metadata on the same block, or

Using child blocks, when you prefer to keep the main task text clean.

Both styles work identically — choose your preferred style in Settings → Recurring Tasks → “Show repeat/due as” (Child or Hidden).

🔹 Inline Attribute Style

Use Roam attributes directly inside the task block.

{{[[TODO]]}} Review project metrics
repeat:: every weekday
due:: [[2025-11-06]]


or as a single block with line breaks:

{{[[TODO]]}} Review project metrics
repeat:: every weekday
due:: [[2025-11-06]]


You can also include other metadata like:

{{[[TODO]]}} Send team update
repeat:: every 2 weeks on Friday
due:: [[2025-11-07]]
completed:: [[2025-10-24]]

🔹 Child Block Style

When "Child" mode is enabled in settings, repeat and due information is placed in sub-blocks under the task.

{{[[TODO]]}} Write weekly newsletter
    - repeat:: every Friday
    - due:: [[2025-11-07]]


If the task is completed, the extension may add a completion timestamp (depending on your settings):

{{[[DONE]]}} Write weekly newsletter
    - repeat:: every Friday
    - due:: [[2025-11-07]]
    - completed:: [[2025-10-31]]

🔹 Hidden Attribute (Pill) Style

If “Hidden” mode is selected:

The repeat:: and due:: lines are stored in the block’s properties, not shown as text.

Visual “pills” (labels) appear next to the checkbox for easy reference.

For example, the visible block might look like:

☑️  Write weekly newsletter   [Repeat] [Due]


Hovering over the pills shows the full values:

Repeat: every Friday

Due: [[2025-11-07]]

Click actions:

Repeat pill → copies the rule to clipboard (Alt+click to edit it)

Due pill → opens the due date’s Daily Notes Page (Shift+click to snooze +1 day)

🔹 More Examples of Repeat Rules
Rule Text	Meaning
every day	Daily
every other day	Every 2 days
every weekday	Monday–Friday
every 2 weeks on Tuesday	Biweekly on Tuesdays
every month on day 15	Monthly on the 15th
first Monday of each month	Monthly on the first Monday
last Friday of each month	Monthly on the last Friday
every weekend	Saturday & Sunday
🧭 Quick Reference
Setting	Effect
Destination for next task	Choose where the next instance appears: Daily Notes Page (DNP), same page, or under a heading
Calculate next due date from	Base the next due date on the current due date or the completion date
Show repeat/due as	Display as child blocks (visible) or hidden props with pills
Confirm before spawning next task	Ask for confirmation when you complete a recurring task