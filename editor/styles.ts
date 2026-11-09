// All colors live in CSS variables. Orca's own variables (--orca-*) set the surfaces and plain
// text so the page follows the active theme; the accent colors below are this plugin's palette,
// because a frame is only given Orca's generic variables, not the editor's syntax colors.

export const CSS = `
:root {
  --bg: var(--orca-background); --fg: var(--orca-foreground);
  --pink: #f68a9b; --orange: #fba46f; --yellow: #cfca7c; --green: #c8ee98;
  --cyan: #a6dbe6; --blue: #aab8f2; --lav: #cbaee3; --mint: #b3e4cb;
  --dim: color-mix(in srgb, var(--fg) 68%, var(--bg));
  --code-bg: color-mix(in srgb, var(--fg) 6%, var(--bg));
  --line: color-mix(in srgb, var(--fg) 16%, var(--bg));
  --scroll-thumb: color-mix(in srgb, var(--fg) 28%, transparent);
  --scroll-thumb-hover: color-mix(in srgb, var(--fg) 46%, transparent);
  --scroll-thumb-active: color-mix(in srgb, var(--lav) 72%, transparent);
}
/* Pastel on light surfaces needs darker ink to stay readable. */
:root.mode-light {
  --pink: #c0304f; --orange: #b45309; --yellow: #8a6d00; --green: #3f7d1a;
  --cyan: #0e7490; --blue: #3b5bdb; --lav: #7c3aed; --mint: #0f766e;
}
:root.vivid { --pink: #ff6b8b; --orange: #ff9a4d; --yellow: #ffd24d; --green: #9be564;
  --cyan: #4dd6f0; --blue: #7c9cff; --lav: #b78bff; --mint: #5eead4; }
:root.vivid.mode-light { --pink: #d6003f; --orange: #c2410c; --yellow: #946200; --green: #2f7d00;
  --cyan: #0369a1; --blue: #1d4ed8; --lav: #6d28d9; --mint: #047857; }

/* "Dark" and "Light" in the toolbar override Orca's surfaces; "Auto" follows the active theme. */
:root.force-dark { --bg: #161823; --fg: #b4bcc2; color-scheme: dark; }
:root.force-light { --bg: #fbfbfe; --fg: #2b2f3a; color-scheme: light; }

html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); }
body { font-family: var(--md-text-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif); font-size: var(--md-size, 15px); line-height: 1.7; }
#shell { display: flex; flex-direction: column; height: 100vh; }
#bar { display: flex; flex-wrap: wrap; row-gap: 4px; align-items: center; gap: 8px; padding: 6px 14px; flex: none;
  border-bottom: 1px solid var(--line); color: var(--dim); font-size: 12px; }
#bar .grow { flex: 1; }
#bar > span:first-child { white-space: nowrap; }
#bar button:disabled, #find button:disabled { opacity: .4; cursor: default; }
#bar button:disabled:hover { background: transparent; }
.blk:focus-visible { outline: 2px solid var(--lav); outline-offset: 2px; }
#bar button, #find button { font: inherit; color: var(--fg); background: transparent; cursor: pointer;
  border: 1px solid var(--line); border-radius: 6px; padding: 2px 9px; }
#bar button:hover, #find button:hover { background: var(--code-bg); }
#bar button.icon { padding: 4px 8px; display: inline-flex; align-items: center; }
#bar .seg { display: inline-flex; }
#bar .seg button { border-radius: 0; margin-left: -1px; }
#bar .seg button:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
#bar .seg button:last-child { border-radius: 0 6px 6px 0; }
#bar button[aria-pressed="true"] { border-color: var(--lav); color: var(--lav); }
#main { display: flex; flex: 1; min-height: 0; }
#scroll { flex: 1; overflow: auto; }
#doc { max-width: var(--md-width, none); margin: 0 auto; padding: 22px 40px 80px; box-sizing: border-box; }
#outline { width: 230px; flex: none; overflow: auto; padding: 16px 12px 40px 6px; border-left: 1px solid var(--line);
  font-size: 12.5px; line-height: 1.45; }

/* Keep scrollbars quiet until they are needed, without losing their grab target. */
#scroll, #outline, .table-wrap, pre, .math-block, .diagram {
  scrollbar-width: thin;
  scrollbar-color: var(--scroll-thumb) transparent;
}
#scroll::-webkit-scrollbar, #outline::-webkit-scrollbar, .table-wrap::-webkit-scrollbar,
pre::-webkit-scrollbar, .math-block::-webkit-scrollbar, .diagram::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
#scroll::-webkit-scrollbar-track, #outline::-webkit-scrollbar-track, .table-wrap::-webkit-scrollbar-track,
pre::-webkit-scrollbar-track, .math-block::-webkit-scrollbar-track, .diagram::-webkit-scrollbar-track {
  background: transparent;
}
#scroll::-webkit-scrollbar-thumb, #outline::-webkit-scrollbar-thumb, .table-wrap::-webkit-scrollbar-thumb,
pre::-webkit-scrollbar-thumb, .math-block::-webkit-scrollbar-thumb, .diagram::-webkit-scrollbar-thumb {
  min-height: 36px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--scroll-thumb);
  background-clip: padding-box;
}
#scroll::-webkit-scrollbar-thumb:hover, #outline::-webkit-scrollbar-thumb:hover, .table-wrap::-webkit-scrollbar-thumb:hover,
pre::-webkit-scrollbar-thumb:hover, .math-block::-webkit-scrollbar-thumb:hover, .diagram::-webkit-scrollbar-thumb:hover {
  border-width: 2px;
  background: var(--scroll-thumb-hover);
  background-clip: padding-box;
}
#scroll::-webkit-scrollbar-thumb:active, #outline::-webkit-scrollbar-thumb:active, .table-wrap::-webkit-scrollbar-thumb:active,
pre::-webkit-scrollbar-thumb:active, .math-block::-webkit-scrollbar-thumb:active, .diagram::-webkit-scrollbar-thumb:active {
  background: var(--scroll-thumb-active);
  background-clip: padding-box;
}
#scroll::-webkit-scrollbar-button, #outline::-webkit-scrollbar-button, .table-wrap::-webkit-scrollbar-button,
pre::-webkit-scrollbar-button, .math-block::-webkit-scrollbar-button, .diagram::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
#scroll::-webkit-scrollbar-corner, #outline::-webkit-scrollbar-corner, .table-wrap::-webkit-scrollbar-corner,
pre::-webkit-scrollbar-corner, .math-block::-webkit-scrollbar-corner, .diagram::-webkit-scrollbar-corner {
  background: transparent;
}
#outline[hidden] { display: none; }
#outline a { display: block; padding: 2px 8px; color: var(--dim); text-decoration: none; border-radius: 4px; }
#outline a:hover { color: var(--fg); background: var(--code-bg); }
#outline a.d2 { padding-left: 18px; } #outline a.d3 { padding-left: 28px; }
#outline a.d4, #outline a.d5, #outline a.d6 { padding-left: 38px; }
@media (max-width: 760px) { #outline { display: none; } #doc { padding: 16px; } }

h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.5em 0 .5em; font-weight: 650; position: relative; }
h1 { color: var(--pink); font-size: 1.9em; border-bottom: 1px solid var(--line); padding-bottom: .25em; margin-top: .4em; }
h2 { color: var(--orange); font-size: 1.5em; border-bottom: 1px solid var(--line); padding-bottom: .2em; }
h3 { color: var(--yellow); font-size: 1.22em; }
h4 { color: var(--green); font-size: 1.05em; }
h5 { color: var(--cyan); font-size: 1em; }
h6 { color: var(--lav); font-size: .95em; font-style: italic; }
.anchor { position: absolute; left: -1.1em; color: var(--dim); text-decoration: none; opacity: 0; font-weight: 400; }
h1:hover .anchor, h2:hover .anchor, h3:hover .anchor, h4:hover .anchor, h5:hover .anchor, h6:hover .anchor { opacity: .8; }

p { margin: .75em 0; }
strong { color: var(--orange); font-weight: 650; }
em { color: var(--lav); }
del { color: var(--dim); }
a { color: var(--blue); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--blue) 45%, transparent); text-underline-offset: 3px; cursor: pointer; }
a:hover { text-decoration-color: var(--blue); }
hr { border: 0; border-top: 1px solid var(--line); margin: 1.8em 0; }
mark { background: color-mix(in srgb, var(--yellow) 28%, transparent); color: inherit; padding: 0 3px; border-radius: 3px; }
kbd { font-family: var(--md-code-font, ui-monospace, monospace); font-size: 12px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 1px 6px; color: var(--cyan); }
ul, ol { padding-left: 1.6em; }
li { margin: .25em 0; }
li::marker { color: var(--lav); }
ul ul li::marker { color: var(--cyan); }
ul ul ul li::marker { color: var(--green); }
.task { font-size: 1.05em; } .task.done { color: var(--green); } .task.todo { color: var(--dim); }
blockquote { margin: 1em 0; padding: .1em 1em; border-left: 3px solid var(--lav); color: var(--dim);
  background: color-mix(in srgb, var(--lav) 7%, transparent); border-radius: 0 6px 6px 0; }
code.ic { font-family: var(--md-code-font, ui-monospace, "SF Mono", Menlo, monospace); font-size: .88em; color: var(--mint);
  background: color-mix(in srgb, var(--mint) 12%, transparent); padding: .12em .38em; border-radius: 5px; }
details { margin: .8em 0; } summary { cursor: pointer; color: var(--cyan); }

.table-wrap { overflow-x: auto; margin: 1em 0; }
table { border-collapse: collapse; width: max-content; min-width: 60%; }
th, td { border: 1px solid var(--line); padding: 6px 12px; text-align: left; }
th { color: var(--cyan); background: color-mix(in srgb, var(--cyan) 9%, transparent); font-weight: 600; }
tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--fg) 3%, transparent); }
[align="center"] { text-align: center; } [align="right"] { text-align: right; }

.codeblock { margin: 1em 0; border: 1px solid var(--line); border-radius: 8px; background: var(--code-bg); overflow: hidden; }
.code-head { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px;
  font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--dim);
  border-bottom: 1px solid var(--line); }
.copy { font: inherit; text-transform: none; color: var(--dim); background: transparent; border: 0; cursor: pointer; padding: 1px 6px; border-radius: 4px; }
.copy:hover { color: var(--fg); background: var(--line); }
pre { margin: 0; padding: 12px 14px; overflow-x: auto; }
pre code { font-family: var(--md-code-font, ui-monospace, "SF Mono", Menlo, Consolas, monospace); font-size: calc(var(--md-size, 15px) * .87); line-height: 1.6; color: var(--fg); background: none; }
.frontmatter { border-left: 3px solid var(--yellow); } .mdx-module { border-left: 3px solid var(--lav); } .mdx-jsx { border-left: 3px solid var(--pink); }

.hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-template-tag { color: var(--pink); font-style: italic; }
.hljs-name, .hljs-tag .hljs-name { color: var(--pink); font-style: normal; }
.hljs-string, .hljs-template-variable { color: var(--yellow); }
.hljs-regexp, .hljs-link { color: var(--mint); }
.hljs-number, .hljs-literal, .hljs-symbol, .hljs-bullet, .hljs-params { color: var(--orange); }
.hljs-title, .hljs-title.function_, .hljs-function .hljs-title { color: var(--green); }
.hljs-title.class_, .hljs-type, .hljs-built_in, .hljs-class .hljs-title { color: var(--cyan); }
.hljs-attr, .hljs-attribute, .hljs-property, .hljs-selector-class, .hljs-selector-id { color: var(--lav); }
.hljs-variable, .hljs-selector-attr, .hljs-selector-pseudo { color: var(--blue); }
.hljs-meta, .hljs-meta .hljs-keyword { color: var(--lav); font-style: normal; }
.hljs-section { color: var(--yellow); font-weight: 650; }
.hljs-comment, .hljs-quote { color: var(--dim); font-style: italic; }
.hljs-tag { color: var(--dim); }
.hljs-emphasis { font-style: italic; } .hljs-strong { font-weight: 650; }
.hljs-addition { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); display: inline-block; width: 100%; }
.hljs-deletion { color: var(--pink); background: color-mix(in srgb, var(--pink) 12%, transparent); display: inline-block; width: 100%; }

.callout { margin: 1em 0; padding: .6em 1em; border-left: 4px solid var(--c); border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--c) 9%, transparent); }
.callout > p { margin: .4em 0; }
.callout-title { color: var(--c); font-weight: 650; font-size: .92em; text-transform: uppercase; letter-spacing: .05em; }
.callout-note { --c: var(--blue); } .callout-tip { --c: var(--green); } .callout-important { --c: var(--lav); }
.callout-warning { --c: var(--orange); } .callout-caution { --c: var(--pink); }

.md-img { max-width: 100%; height: auto; border-radius: 6px; vertical-align: middle; }
.img-ph { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px dashed var(--line);
  border-radius: 6px; color: var(--dim); font-size: .9em; }
.img-ph-icon { color: var(--lav); }
.badge { display: inline-flex; vertical-align: middle; margin: 2px 3px 2px 0; border-radius: 4px; overflow: hidden;
  font: 600 11px/1 var(--md-text-font, ui-sans-serif, system-ui, sans-serif); white-space: nowrap; }
.badge-l, .badge-m { padding: 4px 7px; }
.badge-l { background: color-mix(in srgb, var(--fg) 16%, var(--bg)); color: var(--fg); }
.badge-m { background: var(--b, var(--lav)); color: var(--bg); }
a:has(.badge) { text-decoration: none; }
.katex { color: var(--cyan); font-size: 1.08em; }
.math-block { margin: 1em 0; padding: .4em 0; overflow-x: auto; overflow-y: hidden; text-align: center; }
.math-block .katex-display { margin: 0; }
.katex-error { color: var(--pink); }
.diagram { padding: 14px; overflow-x: auto; text-align: center; }
.diagram svg { max-width: 100%; height: auto; }
.diagram.drawn { background: var(--bg); }
.diagram.failed, .diagram:not(.drawn) { text-align: left; padding: 0; }
.diagram-error { color: var(--pink); font-size: .9em; padding: 10px 14px 0; }
#find { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-bottom: 1px solid var(--line); flex: none; }
#find[hidden] { display: none; }
#find input { flex: 0 1 320px; font: inherit; font-size: 13px; color: var(--fg); background: var(--code-bg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; outline: none; }
#find input:focus { border-color: var(--lav); }
#find .count { color: var(--dim); font-size: 12px; min-width: 72px; }
#bar button[aria-pressed="true"], #find button[aria-pressed="true"] { border-color: var(--lav); color: var(--lav); }
::highlight(find) { background-color: color-mix(in srgb, var(--yellow) 38%, transparent); color: inherit; }
::highlight(find-current) { background-color: color-mix(in srgb, var(--orange) 75%, transparent); color: var(--bg); }

/* ---- Click a block to edit it (CodeMirror inside the block) ---- */
.blk { border-radius: 6px; }
#doc.editable .blk:not(.editing):hover { background: color-mix(in srgb, var(--fg) 3.5%, transparent); cursor: text; }
.blk.editing { outline: 1px solid color-mix(in srgb, var(--lav) 55%, transparent); background: color-mix(in srgb, var(--lav) 5%, transparent);
  padding: 4px 10px; margin: 8px -10px; border-radius: 8px; }
.blk-empty .empty { margin-top: 8vh; }
#doc.editable { min-height: 70vh; }
.cm-editor { outline: none !important; background: transparent; color: var(--fg); }
.cm-scroller { font-family: inherit; line-height: inherit; overflow: visible !important; }
.cm-content { padding: 0 !important; font-family: var(--md-text-font, ui-sans-serif, system-ui, sans-serif); caret-color: var(--fg); }
.cm-line { padding: 0 2px !important; }
.cm-cursor, .cm-dropCursor { border-left: 2px solid var(--fg) !important; }
.cm-selectionBackground { background: color-mix(in srgb, var(--lav) 28%, transparent) !important; }
.cm-focused .cm-selectionBackground { background: color-mix(in srgb, var(--lav) 40%, transparent) !important; }
.cm-h { font-weight: 650; line-height: 1.3; padding-top: .5em !important; }
.cm-h1 { color: var(--pink); font-size: 1.9em; border-bottom: 1px solid var(--line); padding-bottom: .2em !important; }
.cm-h2 { color: var(--orange); font-size: 1.5em; border-bottom: 1px solid var(--line); padding-bottom: .15em !important; }
.cm-h3 { color: var(--yellow); font-size: 1.22em; }
.cm-h4 { color: var(--green); font-size: 1.05em; }
.cm-h5 { color: var(--cyan); }
.cm-h6 { color: var(--lav); font-style: italic; }
.cm-syntax { color: var(--dim) !important; font-weight: 400; font-style: normal; text-decoration: none; }
.cm-strong { color: var(--orange); font-weight: 650; }
.cm-em { color: var(--lav); font-style: italic; }
.cm-strike { color: var(--dim); text-decoration: line-through; }
.cm-ic { font-family: var(--md-code-font, ui-monospace, monospace); font-size: .88em; color: var(--mint);
  background: color-mix(in srgb, var(--mint) 12%, transparent); border-radius: 5px; padding: .12em .1em; }
.cm-link { color: var(--blue); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--blue) 45%, transparent); text-underline-offset: 3px; }
.cm-quote { border-left: 3px solid var(--lav); background: color-mix(in srgb, var(--lav) 7%, transparent); color: var(--dim); padding-left: 1em !important; }
.cm-codeblock { background: var(--code-bg); font-family: var(--md-code-font, ui-monospace, monospace); font-size: calc(var(--md-size, 15px) * .87);
  line-height: 1.6; padding: 0 14px !important; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
.cm-codetop { border-top: 1px solid var(--line); border-radius: 8px 8px 0 0; }
.cm-codebottom { border-bottom: 1px solid var(--line); border-radius: 0 0 8px 8px; }
.cm-codefence { color: var(--dim); font-size: .8em; }
.cm-listmark { color: var(--lav); }
.cm-table-line, .cm-html { font-family: var(--md-code-font, ui-monospace, monospace); font-size: .9em; }
.cm-html { color: var(--dim); }
.cm-front { font-family: var(--md-code-font, ui-monospace, monospace); font-size: .9em; color: var(--dim);
  background: var(--code-bg); border-left: 3px solid var(--yellow); padding-left: 12px !important; }
.empty { color: var(--dim); text-align: center; margin-top: 18vh; }
`
