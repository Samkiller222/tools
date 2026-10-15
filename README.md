# CVU Tools

Browser tools for NIDMS and N-VIS, loaded from one self-updating bookmark.

**Install:** open https://samkiller222.github.io/tools/ and drag the **CVU Tools** button to the bookmarks bar.

## How it works

The bookmark loads `cvu.js` from this site each time it's clicked. `cvu.js` shows a menu of the tools for the current site and loads the chosen one from `tools/`. Push a change here and the next click uses it — nothing to reinstall.

## Files

| File | Site | What it does |
|---|---|---|
| `tools/cvu-comments.js` | NIDMS | Comment writer — fills Internal Comments (6 types) |
| `tools/nidms-lookup.js` | NIDMS | Batch lookup by passport and/or R number |
| `tools/nidms-refusals.js` | NIDMS | Refusal grounds, sent-to-L1 and refused date/by, internal comments |
| `tools/nidms-afd.js` | NIDMS | All AFD-tagged applications + who added the tag and when |
| `tools/nidms-duplicates.js` | NIDMS | Duplicate passports in a list + status of each application |
| `tools/nvis-my-stickers.js` | N-VIS | Export every page of My Stickers |
| `tools/nvis-visa-lookup.js` | N-VIS | Batch lookup by visa number (test) |

## Adding a tool

1. Put the script in `tools/` (a self-contained `(() => { ... })();`).
2. Add a line to the `TOOLS` list in `cvu.js`.

No applicant data is stored in this repo — the tools only read pages in the user's own logged-in session.
