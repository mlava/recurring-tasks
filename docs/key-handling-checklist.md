# Better Tasks Key Handling Checklist

Run this checklist before each release:

1. **Due pill  plain click**
   - Focus a Better Task block and click the due pill without modifiers.
   - Expect: the due dates Daily Note opens in the main window.

2. **Due pill  Shift+Click**
   - Shift+click the due pill.
   - Expect: the due date opens in Roams right sidebar.

3. **Due pill  Alt+Cmd/Ctrl+Click (snooze)**
   - Hold Alt+Cmd (macOS) or Alt+Ctrl (Windows/Linux) while clicking the due pill.
   - Expect: a `defer::` child is created/updated to today+1 (or defer+1); due remains unchanged; toast confirms snooze.

4. **Due pill  Alt/Ctrl/Meta click**
   - Hold Alt (or Ctrl/Cmd) and click the due pill.
   - Expect: date picker toast appears; selecting a date updates the `due::` child.

5. **Start/Defer pill  plain click**
   - Click start/defer pills with no modifiers.
   - Expect: the corresponding Daily Note opens in the main window.

6. **Start/Defer pill  Shift+Click**
   - Shift+click start/defer pills.
   - Expect: the Daily Note opens in the right sidebar.

7. **Start/Defer pill  Alt/Ctrl/Meta click**
   - Hold Alt/Ctrl/Cmd and click start/defer pills.
   - Expect: date picker toast appears; chosen date updates the `start::`/`defer::` child.

8. **Menu snooze buttons**
   - Open the pill menu and run each snooze option.
   - Expect: snoozes adjust `defer::`; due dates remain unchanged; undo works.

If any step fails, fix before release.
