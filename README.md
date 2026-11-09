# Markdown Colorize

A colorful, editable view for Markdown and MDX files. It adds a **Colorized** view beside **Source** in the editor tab.

![Markdown Colorize preview](images/cover.png)

- **Colored headings, quotes, tables, task lists and callouts** (`> [!NOTE]`, `[!TIP]`, `[!WARNING]` and more).
- **Code blocks** highlighted for 25+ languages, with a Copy button.
- **Math** with `$inline$`, `$$display$$` and `math` blocks.
- **Diagrams** from `mermaid` blocks, drawn in the page's colors.
- **Badges** from shields.io and similar, drawn as colored pills.
- **MDX:** `import`, `export` and JSX show as code; the Markdown around them stays Markdown.
- **Click to edit:** click any block (a paragraph, heading, list, table or code block) and it turns into an editor showing that block's Markdown, in color. Click away or press Esc to see it formatted again. `Ctrl/Cmd+B` and `Ctrl/Cmd+I` toggle bold and italic, and `Ctrl/Cmd+click` opens a link.
- **Undo and redo** for the whole page (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or the toolbar buttons): each editing session is one step. The steps are cleared if another tool changes the file.
- **Keyboard:** Tab reaches the page, the arrow keys move between blocks, Enter edits the focused block, Esc leaves it, and the arrow keys carry on into the next block while editing. Tab indents a list item.
- **Find:** `Ctrl/Cmd+F` or the Find button searches the file, highlights every match, and steps through them with Enter and Shift+Enter.
- **Toolbar:** Outline, Auto/Dark/Light, Narrow and Dim. Full width and vivid colors are the defaults.

## Use it

1. Install **Markdown Colorize** from **Settings → Plugins**.
2. Open a `.md`, `.markdown` or `.mdx` file.
3. Choose **Colorized** beside **Source**. `.mdx` files open in it by default.

Changes save as you type, and the view follows edits made elsewhere. Toolbar choices, fonts and text size are saved in the plugin's settings. Orca doesn't share its fonts with plugins, so type your font names there.

## Limits

- Only images embedded in the Markdown (`data:` addresses) are drawn. Web images and files next to the document can't be loaded, so they show their alt text.
- Raw HTML is cleaned to a short list of safe tags. MDX components are shown as code, not run.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
