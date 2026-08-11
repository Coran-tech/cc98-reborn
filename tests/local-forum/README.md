# CC98 local forum test

This test environment serves the compiled frontend from `reference/Forum-main`,
replaces its runtime API configuration with a local mock, and injects the current
CC98 Reborn content scripts through a browser API shim.

It never forwards requests to the production CC98 API.

The compiled forum bundle is read from `reference/Forum-main/dist/static`. The
mock API keeps all writes in memory: posting, replying, and editing only return
test responses and do not persist or transmit forum content.

## Start

On Windows, double-click `open-control-panel.cmd` to use the graphical control
panel. It can start, stop, restart, and check the simulator; open the forum or
editor fixture; and show the PID, uptime, request count, and recent logs. Closing
the panel leaves the simulator running. Server logs are written to the ignored
`tests/local-forum/.runtime` directory.

The command-line equivalent is:

```powershell
node tests/local-forum/server.js
```

Then open:

- `http://127.0.0.1:44303/`
- `http://127.0.0.1:44303/topic/6500000/1`
- `http://127.0.0.1:44303/editor/postTopic/81`
- `http://127.0.0.1:44303/editor/edit/900001`

The server exposes `GET /__test/health` and `GET /__test/requests` for test
diagnostics. Health data includes the server PID, start time, uptime, and request
counts so the control panel can identify the correct Node.js process without
touching unrelated processes. The localhost allowance is applied only to the
in-memory test copy served from `/__test/content.js`. All editor rendering,
toolbar, and serialization modules load directly from the production `src`
directory.

Run the isolated API and injection smoke test with:

```powershell
node tests/local-forum/smoke.test.js
```

## Covered flows

- Home and topic reconstruction against the real CC98 React frontend bundle.
- UBB, Markdown, signatures, images, local emoji resources, and the dual editor.
- Production dual-editor previews for alignment aliases, quote, line, code,
  font, table, Markdown, hidden image, upload, and math tags.
- The production `扩` toolbar menu for applying quote, line, code, Markdown,
  block/inline math, literal-text, English-font, named-font, table, and
  hidden-image syntax from either editor pane. The table picker supports
  1-by-1 through 6-by-6 tables, and the font menu includes the common CSS
  family names used by the CC98 syntax guide.
- Board tag selection and one-click topic submission.
- Reply submission and post editing, including the submit monitor redirect.
- Local OpenID binding and watermark state through the browser API shim.

Use `/__test/requests` to confirm the write calls. A complete submit pass should
include `POST /board/81/topic`, `POST /topic/6500000/post`, and
`PUT /post/900001`.

The simulator loads `src/extended-ubb-core.js`, `src/extended-ubb.js`, and
`src/extended-ubb.css`, exactly like the packaged extension. `[md]` and `[code]`
are editable in the visual pane and round-trip to the lower UBB source pane;
source-preserving media, upload, and math nodes remain protected in the visual
pane. Toolbar operations use the dual editor's saved visual-to-source selection
mapping, so they do not guess offsets from visible text and duplicate phrases
remain distinguishable.

To inspect a saved MHTML tutorial before adding a syntax fixture:

```powershell
python tests/local-forum/extract-mhtml.py tutorial.mhtml tutorial.html
python tests/local-forum/inspect-tutorial.py tutorial.html tutorial.json
```
