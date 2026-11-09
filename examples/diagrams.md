# Diagrams

Write a fenced block with the language `mermaid` and the Colorized view draws it, in the page's colors.

## Flowchart

```mermaid
flowchart LR
  A[Open file] --> B{Is it .mdx?}
  B -- yes --> C[Colorized by default]
  B -- no --> D[Pick Colorized]
  C --> E((Read))
  D --> E
```

## Sequence

```mermaid
sequenceDiagram
  participant You
  participant Orca
  participant Plugin
  You->>Orca: Open README.md
  Orca->>Plugin: Send the text
  Plugin-->>Orca: Colored page
  Note over Plugin: Diagrams draw after the text
  Orca-->>You: Colorized view
```

## Class diagram

```mermaid
classDiagram
  class Viewer {
    +render(text)
    +setMode(mode)
  }
  class Palette {
    +vivid
    +dim
  }
  Viewer --> Palette : reads
```

## State

```mermaid
stateDiagram-v2
  [*] --> Auto
  Auto --> Dark
  Dark --> Light
  Light --> Auto
```

## Pie

```mermaid
pie title Where the time went
  "Parser" : 30
  "Colors" : 45
  "Math" : 15
  "Docs" : 10
```

## A broken diagram shows its error and source

```mermaid
flowchart LR
  A --> 
```
