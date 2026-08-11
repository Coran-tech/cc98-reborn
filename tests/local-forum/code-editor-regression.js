(() => {
  "use strict";

  const api = window.CC98RebornExtendedUbb;
  const fixture = document.querySelector("#fixture");
  const results = document.querySelector("#results");
  const summary = document.querySelector("#summary");
  const cases = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function renderSource(source) {
    const root = document.createElement("div");
    root.className = "cc98-rebuild-dual-ubb-visual";
    root.contentEditable = "true";
    const article = api.render(source);
    while (article.firstChild) {
      root.append(article.firstChild);
    }
    fixture.replaceChildren(root);
    return root;
  }

  function codeLines(block) {
    return [...block.querySelectorAll(":scope > ol > li")];
  }

  function serializeRoot(root) {
    return [...root.childNodes].map((node) => {
      if (node instanceof HTMLElement && node.matches("[data-cc98-local-ubb-tag='code']")) {
        return `[code]${codeLines(node).map((line) => line.textContent.replace(/[\u200b\uFEFF]/g, "")).join("\n")}[/code]`;
      }
      if (node instanceof HTMLBRElement) {
        return "";
      }
      return String(node.textContent || "").replace(/[\u200b\uFEFF]/g, "");
    }).join("\n");
  }

  function replaceLineWithPlain(block, index, tagName = "div") {
    const line = codeLines(block)[index];
    const plain = document.createElement(tagName);
    while (line.firstChild) {
      plain.append(line.firstChild);
    }
    line.replaceWith(plain);
    return plain;
  }

  function placeCaretAtStart(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function test(name, run) {
    cases.push({ name, run });
  }

  test("valid two-line block remains unchanged", () => {
    const root = renderSource("[code]first\nsecond[/code]");
    assert(api.normalizeEditableCodeBlocks(root) === false, "valid block was rewritten");
    assert(serializeRoot(root) === "[code]first\nsecond[/code]", "valid source changed");
  });

  test("empty block keeps one editable numbered row", () => {
    const root = renderSource("[code][/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    assert(codeLines(block).length === 1, "empty block lost its editable row");
    assert(api.normalizeEditableCodeBlocks(root) === false, "empty editable row was unwrapped");
    assert(serializeRoot(root) === "[code][/code]", "empty block source changed");
  });

  test("empty and populated code rows share one compact line grid", () => {
    const root = renderSource("[code]first\n\nthird[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    const lines = codeLines(block);
    const rectangles = lines.map((line) => line.getBoundingClientRect());
    assert(lines.length === 3, "code line count changed");
    assert(
      Math.abs(rectangles[0].height - rectangles[1].height) < 0.6,
      `empty line height differs: ${rectangles[0].height}/${rectangles[1].height}`
    );
    assert(
      Math.abs(rectangles[1].top - rectangles[0].bottom) < 0.6
        && Math.abs(rectangles[2].top - rectangles[1].bottom) < 0.6,
      "code rows contain a vertical gap"
    );
  });

  test("table source newlines do not create row gaps", () => {
    const root = renderSource([
      "[table]",
      "[tr][th][/th][th]heading[/th][/tr]",
      "[tr][td][/td][td]content[/td][/tr]",
      "[/table]"
    ].join("\n"));
    const table = root.querySelector(".cc98-local-experimental-table");
    const rows = [...table.rows];
    const rowRectangles = rows.map((row) => row.getBoundingClientRect());
    const emptyCell = rows[0].cells[0].getBoundingClientRect();
    const populatedCell = rows[0].cells[1].getBoundingClientRect();
    assert(rows.length === 2, "table row count changed");
    assert(!table.querySelector(":scope > br"), "formatting newline became a table break");
    assert(
      Math.abs(rowRectangles[1].top - rowRectangles[0].bottom) < 0.6,
      "table rows contain a vertical gap"
    );
    assert(
      Math.abs(emptyCell.height - populatedCell.height) < 0.6,
      `empty table cell height differs: ${emptyCell.height}/${populatedCell.height}`
    );
  });

  test("fully empty table rows stay visible and compact", () => {
    const root = renderSource([
      "[table]",
      "[tr][td][/td][td][/td][/tr]",
      "[tr][td][/td][td][/td][/tr]",
      "[/table]"
    ].join("\n"));
    const rows = [...root.querySelector(".cc98-local-experimental-table").rows];
    const rectangles = rows.map((row) => row.getBoundingClientRect());
    assert(rows.length === 2, "empty table row count changed");
    assert(rectangles.every((rectangle) => rectangle.height > 20), "empty table row collapsed");
    assert(
      Math.abs(rectangles[0].height - rectangles[1].height) < 0.6,
      "empty table rows use inconsistent heights"
    );
    assert(
      Math.abs(rectangles[1].top - rectangles[0].bottom) < 0.6,
      "empty table rows contain a vertical gap"
    );
  });

  test("font values render without leaking style declarations", () => {
    const root = renderSource("[font=KaiTi;color:red]safe[/font]");
    const font = root.querySelector("[data-cc98-local-ubb-tag='font']");
    assert(font?.textContent === "safe", "font content changed");
    assert(!font.style.fontFamily.includes(";"), "font value kept a declaration separator");
    assert(!font.style.color, "font value leaked into text color");
  });

  test("lost first line number moves content before code", () => {
    const root = renderSource("[code]first\nsecond[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    const plain = replaceLineWithPlain(block, 0);
    placeCaretAtStart(plain);
    assert(api.normalizeEditableCodeBlocks(root) === true, "malformed first line was ignored");
    assert(serializeRoot(root) === "first\n[code]second[/code]", "first line stayed inside code");
    assert(!window.getSelection().anchorNode.parentElement?.closest("[data-cc98-local-ubb-tag='code']"), "caret stayed in code");
  });

  test("blank escaped first line stays outside code", () => {
    const root = renderSource("[code]first\nsecond[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    const plain = replaceLineWithPlain(block, 0);
    plain.replaceChildren(document.createElement("br"));
    placeCaretAtStart(plain);
    api.normalizeEditableCodeBlocks(root);
    assert(serializeRoot(root) === "\n[code]second[/code]", "blank line was still wrapped by code");
  });

  test("lost middle line number splits code into two blocks", () => {
    const root = renderSource("[code]first\nmiddle\nlast[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    replaceLineWithPlain(block, 1);
    api.normalizeEditableCodeBlocks(root);
    assert(root.querySelectorAll("[data-cc98-local-ubb-tag='code']").length === 2, "code was not split");
    assert(serializeRoot(root) === "[code]first[/code]\nmiddle\n[code]last[/code]", "middle line split was incorrect");
  });

  test("lost final line number moves content after code", () => {
    const root = renderSource("[code]first\nlast[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    replaceLineWithPlain(block, 1, "span");
    api.normalizeEditableCodeBlocks(root);
    assert(serializeRoot(root) === "[code]first[/code]\nlast", "last line stayed inside code");
  });

  test("fully emptied list unwraps the code block", () => {
    const root = renderSource("[code]first[/code]");
    root.querySelector("[data-cc98-local-ubb-tag='code'] > ol").replaceChildren();
    api.normalizeEditableCodeBlocks(root);
    assert(!root.querySelector("[data-cc98-local-ubb-tag='code']"), "empty malformed shell survived");
    assert(root.querySelector(".cc98-local-unformatted-line"), "plain caret line was not created");
  });

  test("normalization is idempotent", () => {
    const root = renderSource("[code]first\nsecond[/code]");
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    replaceLineWithPlain(block, 0);
    assert(api.normalizeEditableCodeBlocks(root) === true, "first normalization did nothing");
    assert(api.normalizeEditableCodeBlocks(root) === false, "second normalization changed valid DOM");
  });

  test("spaces, tabs, unicode, and suspicious markup stay literal", () => {
    const payload = "  \n\t\n42号混凝土炒烫烫烫意大利锟斤拷\n<script>alert(1)</script>";
    const root = renderSource(`[code]${payload}[/code]`);
    const block = root.querySelector("[data-cc98-local-ubb-tag='code']");
    assert(codeLines(block).length === 4, "whitespace line count changed");
    assert(!block.querySelector("script"), "code text became executable markup");
    assert(serializeRoot(root) === `[code]${payload}[/code]`, "literal payload changed");
  });

  test("unclosed and nested tags do not crash", () => {
    const unclosed = renderSource("[code]oops");
    assert(!unclosed.querySelector("[data-cc98-local-ubb-tag='code']"), "unclosed code became a block");
    const nested = renderSource("[code]outer [code]inner[/code] tail[/code]");
    assert(nested.querySelectorAll("[data-cc98-local-ubb-tag='code']").length === 1, "nested raw code recursed");
  });

  test("Markdown renders in an editable framed block", () => {
    const root = renderSource("[md]# Heading\n\n**bold**[/md]");
    const markdown = root.querySelector("[data-cc98-local-ubb-tag='md']");
    assert(markdown instanceof HTMLElement, "Markdown block was not rendered");
    assert(markdown.classList.contains("cc98-rebuild-markdown-post"), "Markdown frame class is missing");
    assert(markdown.getAttribute("contenteditable") !== "false", "Markdown block is still locked");
    assert(markdown.querySelector("h1")?.textContent === "Heading", "Markdown heading was not rendered");
    assert(markdown.querySelector("strong")?.textContent === "bold", "Markdown emphasis was not rendered");
    markdown.querySelector("h1").textContent = "Renamed";
    markdown.querySelector("strong").textContent = "edited";
    assert(
      api.serializeEditableMarkdown(markdown) === "# Renamed\n\n**edited**",
      `edited Markdown did not round-trip: ${JSON.stringify(api.serializeEditableMarkdown(markdown))}`
    );
  });

  test("empty Markdown remains editable and serializes as an empty tag", () => {
    const root = renderSource("[md][/md]");
    const markdown = root.querySelector("[data-cc98-local-ubb-tag='md']");
    assert(markdown instanceof HTMLElement, "empty Markdown block disappeared");
    assert(markdown.querySelector("p > br"), "empty Markdown block has no caret line");
    assert(api.serializeEditableMarkdown(markdown) === "", "empty Markdown gained content");
  });

  test("Markdown keeps browser paragraph and hard line breaks", () => {
    const root = renderSource("[md][/md]");
    const markdown = root.querySelector("[data-cc98-local-ubb-tag='md']");
    const paragraph = markdown.querySelector("p");
    paragraph.replaceChildren(
      document.createTextNode("first"),
      document.createTextNode("\r"),
      document.createTextNode("second"),
      document.createElement("br")
    );
    assert(
      api.serializeEditableMarkdown(markdown) === "first\n\nsecond",
      `paragraph break changed: ${JSON.stringify(api.serializeEditableMarkdown(markdown))}`
    );
    paragraph.replaceChildren(
      document.createTextNode("first"),
      document.createElement("br"),
      document.createTextNode("second"),
      document.createElement("br")
    );
    assert(
      api.serializeEditableMarkdown(markdown) === "first  \nsecond",
      `hard line break changed: ${JSON.stringify(api.serializeEditableMarkdown(markdown))}`
    );
  });

  test("Markdown structural elements survive editable serialization", () => {
    const source = [
      "## Structure",
      "",
      "> quoted",
      "",
      "1. first",
      "2. second",
      "",
      "`inline`",
      "",
      "```js",
      "const answer = 42;",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |"
    ].join("\n");
    const root = renderSource(`[md]${source}[/md]`);
    const markdown = root.querySelector("[data-cc98-local-ubb-tag='md']");
    const serialized = api.serializeEditableMarkdown(markdown);
    assert(serialized.includes("## Structure"), "heading syntax was lost");
    assert(serialized.includes("> quoted"), "quote syntax was lost");
    assert(serialized.includes("1. first\n2. second"), "ordered list syntax was lost");
    assert(serialized.includes("`inline`"), "inline code syntax was lost");
    assert(serialized.includes("```js\nconst answer = 42;\n```"), "code fence syntax was lost");
    assert(serialized.includes("| A | B |\n| --- | --- |\n| 1 | 2 |"), "table syntax was lost");
  });

  test("large line and 2048-line block remain intact", () => {
    const longLine = "x".repeat(200000);
    const longRoot = renderSource(`[code]${longLine}[/code]`);
    assert(codeLines(longRoot.querySelector("[data-cc98-local-ubb-tag='code']"))[0].textContent.length === longLine.length, "long line was truncated");
    const manyLines = Array.from({ length: 2048 }, (_, index) => `line-${index}`).join("\n");
    const manyRoot = renderSource(`[code]${manyLines}[/code]`);
    assert(codeLines(manyRoot.querySelector("[data-cc98-local-ubb-tag='code']")).length === 2048, "large line set changed");
  });

  let passed = 0;
  cases.forEach(({ name, run }) => {
    const item = document.createElement("li");
    try {
      run();
      passed += 1;
      item.textContent = `PASS  ${name}`;
    } catch (error) {
      item.className = "fail";
      item.textContent = `FAIL  ${name}: ${error.message}`;
    } finally {
      fixture.replaceChildren();
    }
    results.append(item);
  });
  const failed = cases.length - passed;
  summary.textContent = `${passed}/${cases.length} passed${failed ? `, ${failed} failed` : ""}`;
  document.documentElement.dataset.testStatus = failed ? "failed" : "passed";
})();
