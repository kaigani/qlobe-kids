# Letter Treasure Hunt layout editor

Double-click `Launch Layout Editor.command` in the game folder. It starts the
local QLOBE authoring server and opens the editor in your browser.

The editor uses the real game renderer. Choose D–Z and either Hunt or
Completion, then:

- click an object or choose it from **Editable item**;
- drag the outlined box to move it;
- drag the orange corner to resize it;
- use the X/Y/Width/Height fields for exact values;
- use arrow keys to nudge by 0.25%, or Shift+arrow by 1%;
- switch between Standard, Wide, and Compact previews before saving.

Editor outlines follow the visible, non-transparent artwork bounds. Gameplay
adds a small invisible 10px tap margin around each object; it is intentionally
not shown as part of the editable rectangle.

**Save to project** validates and atomically writes
`data/dz-scene-layouts.json`. The game loads that file directly, so saved
positions are the shipped positions. **Save draft** keeps an unfinished copy
in the current browser. Download, copy, and import provide portable backups.

A–C are intentionally excluded and cannot be changed by this tool.
