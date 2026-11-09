# Third-party notices

`editor/vendor/render.js`, `editor/vendor/katex-css.js` and `editor/vendor/mermaid.js` and `editor/vendor/live.js` bundle these packages, built from `src/render.ts` by `tools/build.mjs`.

- **marked** 15.0.12, MIT License, Copyright (c) 2018+ MarkedJS contributors, Copyright (c) 2011-2018 Christopher Jeffrey. https://github.com/markedjs/marked
- **highlight.js** 11.12.0, BSD 3-Clause License, Copyright (c) 2006 Ivan Sagalaev and contributors. https://github.com/highlightjs/highlight.js
- **KaTeX** 0.19.1, MIT License, Copyright (c) 2013-2020 Khan Academy and other contributors. https://github.com/KaTeX/KaTeX
- **KaTeX fonts** (embedded in `editor/vendor/katex-css.js`): distributed with KaTeX and derived from the AMS and Computer Modern fonts. KaTeX's font sources state the SIL Open Font License, Version 1.1 (https://openfontlicense.org).
- **Mermaid** 12.2.0, MIT License, Copyright (c) 2014-2022 Knut Sveidqvist. https://github.com/mermaid-js/mermaid
- **Mermaid's own dependencies** are bundled into `editor/vendor/mermaid.js`, among them d3 (ISC and BSD licenses), dagre-d3-es (MIT), DOMPurify (Apache-2.0 or MPL-2.0), khroma (MIT) and lodash-es (MIT). Their licenses are in each package of the Mermaid dependency tree, which `npm ls mermaid` lists.
- **CodeMirror** (`@codemirror/state`, `view`, `commands`, `language`, `lang-markdown`) and **Lezer** (`@lezer/markdown` and related parsers), MIT License, Copyright (C) 2018-2021 by Marijn Haverbeke and others. https://codemirror.net
