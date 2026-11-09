---
title: Markdown Colorize sample
tags: [markdown, preview]
draft: false
---

# Markdown Colorize

A **colorful** reading view for *Markdown*, with `inline code`, ~~strikethrough~~ and [links](https://example.com).

## Headings keep their own colors

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

> A quote reads softer than the text around it.

> [!NOTE]
> Callouts such as this one use the same syntax as GitHub.

> [!TIP]
> Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open the palette.

> [!WARNING]
> Warnings are orange.

> [!CAUTION]
> Cautions are pink.

## Lists

- Plain item
  - Nested item
    - Deeper item
- [x] Finished task
- [ ] Open task

1. First
2. Second
3. Third

## Table

| Language   | Kind       |  Year |
| ---------- | :--------: | ----: |
| TypeScript | typed      |  2012 |
| Python     | dynamic    |  1991 |
| Rust       | systems    |  2015 |

## Code

```ts
// Load a user from disk
export class UserService<T> {
  private static readonly MAX = 42

  async load(id: number): Promise<T | null> {
    const raw = await readFile(`${id}.json`)
    return /^user-(\d+)$/i.test(String(id)) ? JSON.parse(raw) : null
  }
}
```

```python
def greet(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"  # friendly
```

```bash
git status -s && npm run build --silent
```

```diff
- const old = 1
+ const next = 2
```

```json
{ "name": "demo", "version": "1.0.0", "private": true }
```

## Math

Inline math such as $E = mc^2$ and $\alpha + \beta = \gamma$ sits in the text. Prices like $5 and $6 stay text.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

```math
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
```

```latex
\begin{equation}
  \nabla \times \mathbf{B} = \mu_0 \mathbf{J}
\end{equation}
```

---

Last line, with an image placeholder: ![Logo](images/logo.png)
