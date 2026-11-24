# Third-party notices

`tools/build.mjs` bundles these packages into `editor/vendor/render.js` (from `src/render.ts`), `editor/vendor/katex-css.js` (KaTeX's stylesheet and fonts), `editor/vendor/mermaid.js` (from `src/mermaid.ts`) and `editor/vendor/live.js` (from `src/live.ts`).

- **marked** 15.0.12, MIT License, Copyright (c) 2018+ MarkedJS contributors, Copyright (c) 2011-2018 Christopher Jeffrey. https://github.com/markedjs/marked
- **highlight.js** 11.12.0, BSD 3-Clause License, Copyright (c) 2006 Ivan Sagalaev and contributors. https://github.com/highlightjs/highlight.js
- **KaTeX** 0.19.1, MIT License, Copyright (c) 2013-2020 Khan Academy and other contributors. https://github.com/KaTeX/KaTeX
- **KaTeX fonts** (embedded in `editor/vendor/katex-css.js`): distributed with KaTeX and derived from the AMS and Computer Modern fonts. KaTeX's font sources state the SIL Open Font License, Version 1.1 (https://openfontlicense.org).
- **Mermaid** 12.2.0, MIT License, Copyright (c) 2014-2022 Knut Sveidqvist. https://github.com/mermaid-js/mermaid
- **Mermaid's own dependencies** are bundled into `editor/vendor/mermaid.js`, among them d3 (ISC and BSD licenses), dagre-d3-es (MIT), DOMPurify (Apache-2.0 or MPL-2.0), khroma (MIT) and lodash-es (MIT). Their licenses are in each package of the Mermaid dependency tree, which `npm ls mermaid` lists.
- **CodeMirror** (`@codemirror/state`, `view`, `commands`, `language`, `lang-markdown`) and **Lezer** (`@lezer/markdown` and related parsers), MIT License, Copyright (C) 2018-2021 by Marijn Haverbeke and others. https://codemirror.net
- **Richdown for Orca** (https://github.com/structworks/richdown-orca), MIT License, Copyright (c) 2026 mytooyo. The image worker in `src/worker` (and `worker.mjs`) follows its design: finding the open file by a fingerprint of its text, reading images in base64 chunks, and the public-address checks for web images.
