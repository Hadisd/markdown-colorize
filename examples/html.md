# HTML around Markdown

READMEs often wrap Markdown in HTML, with blank lines inside. The pieces are kept together, as on GitHub.

## Centered picture

<p align="center">

  <img src="../images/icon.png" alt="Plugin icon" width="96" height="96">

</p>

<h2 align="center">A centered heading</h2>

<p align="center"><em>A centered tagline.</em></p>

## Centered badges

<div align="center">

[![npm](https://img.shields.io/npm/v/marked)](https://www.npmjs.com/package/marked)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-beta-ff69b4)

**Bold**, *italic* and `code` inside the block stay Markdown.

</div>

## Folded section

<details open>
<summary>Click to open</summary>

- A list
- with **Markdown**

```js
console.log('and code')
```

</details>

