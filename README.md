If you've ever wondered why there isn't the ability to create recurring tasks in Roam Research, with this extension there now is!

After you install this extension, it will automatically recognise new {{[[TODO]]}} items with a Repeat:: and/or Due:: attribute.


📘 Examples — Recurring Task Syntax

You can record a recurring task either:
- Inline, with metadata on the same block, or
- Using child blocks, when you prefer to keep the main task text clean.

Both styles work identically — choose your preferred style in Settings → Recurring Tasks → “Show repeat/due as” (Child or Hidden).

🔹 Inline Attribute Style

Use Roam attributes directly inside the task block.

{{[[TODO]]}} Review project metrics
repeat:: every weekday
due:: [[2025-11-06]]

or, as a single block with line breaks:

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

- The repeat:: and due:: lines are stored in the block’s properties, not shown as text.
- Visual “pills” (labels) appear next to the checkbox for easy reference.

For example, the visible block might look like:

☑️  Write weekly newsletter   [Repeat] [Due]


Hovering over the pills shows the full values:

Repeat: every Friday
Due: [[2025-11-07]]

Click actions:

Repeat pill → copies the rule to clipboard (Alt+click to edit it)

Due pill → opens the due date’s Daily Notes Page (Shift+click to snooze +1 day)


🧭 Settings Quick Reference

Destination for next task
- Choose where the next instance appears: Daily Notes Page (DNP), the same page as the current task, or under a heading on the DNP
Calculate next due date from
- Base the next due date on the current due date or the completion date
Show repeat/due as
- Display as child blocks (visible) or hidden props with pills
Confirm before spawning next task
- Ask for confirmation when you complete a recurring task


## Repeat field:

The Repeat field accepts natural-language phrases (case-insensitive, extra spaces/commas are fine). Below are all supported patterns with examples.

You can use full weekday names or common abbreviations: monday | mon, tuesday | tue | tues, wednesday | wed, thursday | thu | thur | thurs, friday | fri, saturday | sat, sunday | sun.

Ordinals accepted: 1st/first, 2nd/second, 3rd/third, 4th/fourth, last.

“Every X weeks on …” accepts a comma or space-separated list of days (e.g., Mon Wed or Mon, Wed).

“Monthly” rules that name a day number will clamp to the last valid day when needed (e.g., “day 31” → Feb 29/28 depending on year).

###Daily schedules

*Every day*
- daily
- every day

*Every N days*
- every 2 days
- every other day (same as every 2 days)
- every second day / every third day / every four days / every five days
- every 7 days (any positive integer)

*Weekdays only*
- every weekday (Mon–Fri)

###Weekly schedules

*Every week on a specific day*
- every monday
- every mondays (plural also works)
- every mon (abbreviation works)

*Generic weekly (no specific day list)*
- weekly
- every week

*Every other/second week*
- every other week
- every second week

*Weekly on multiple days*
- weekly on tuesday thursday
- weekly on tue, thu
- every week on mon, wed, fri

*Every N weeks (optionally on specific days)*
- every 2 weeks
- every 3 weeks on tue
- every 4 weeks on mon wed

*Weekend*
- every weekend
- weekend (equivalent to weekly on Saturday and Sunday)

###Monthly schedules (by day number)

*Same day of each month*
- monthly (uses the current due date’s day-of-month as the anchor)

*Explicit day number*
- every month on day 15
- the 1st day of every month
- 1st day of each month
- day 28 each month
- the 3rd day of each month

All of the following forms are accepted and equivalent for day numbers:
- every month on day 12
- the 12 day of every month (ordinal or plain number)
- 12th day of each month
- day 12 each month

*Monthly schedules (by Nth weekday)*
- First/Second/Third/Fourth/Last <Weekday> of each month
- every month on the 1st monday
- the first monday of every month
- second tue of each month
- 3rd wed every month
- fourth thu of every month
- last friday of each month

You can mix full names or abbreviations and either ordinal style:
- Ordinals: 1st|first, 2nd|second, 3rd|third, 4th|fourth, last
- Weekdays: monday|mon, tuesday|tue|tues, wednesday|wed, thursday|thu|thur|thurs, friday|fri, saturday|sat, sunday|sun

Compact variants
- 2nd Tue each month
- last Fri every month
