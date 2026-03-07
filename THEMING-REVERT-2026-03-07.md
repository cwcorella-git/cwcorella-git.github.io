# Theme fix revert reference — 2026-03-07

Fixes sky + neutral palette contrast across all panels and overlays.
To revert: restore the values below to each file.

---

## src/lib/admin/theme.svelte.ts

### sky palette
```
glassBgDark:     'rgba(28, 60, 130, 0.86)',   // medium sky-blue panels
glassBorderDark: 'rgba(140, 190, 255, 0.28)', // bright sky-blue border
```

### neutral palette
```
glassBgDark:     'rgba(32, 32, 36, 0.88)',    // dark neutral gray — no color cast
glassBorderDark: 'rgba(200, 200, 208, 0.22)', // neutral gray border
```

---

## src/routes/journals/+page.svelte

### .new-btn
```css
border: 1px solid var(--glass-border);
/* hover: */
border-color: var(--glass-border);
```

### .entry-row
```css
border-bottom: 1px solid rgba(var(--ui-rgb), 0.09);
```

### .overlay-header
```css
border-bottom: 1px solid rgba(var(--ui-rgb), 0.12);
```

### .editor-fields input, textarea
```css
background: rgba(var(--ui-rgb), 0.04);
border: 1px solid rgba(var(--ui-rgb), 0.18);
```

### .editor-fields input:focus, textarea:focus
```css
border-color: rgba(var(--ui-rgb), 0.40);
```

### .editor-footer
```css
border-top: 1px solid rgba(var(--ui-rgb), 0.10);
```

### .editor-footer button
```css
border: 1px solid rgba(var(--ui-rgb), 0.20);
/* hover: */
border-color: rgba(var(--ui-rgb), 0.40);
```

### .save-btn
```css
background: rgba(var(--ui-rgb),0.07) !important;
border-color: rgba(var(--ui-rgb),0.25) !important;
```

### .reader-doc-title
```css
border-bottom: 1px solid rgba(var(--ui-rgb), 0.15);
```

### .reader-body :global(blockquote)
```css
border-left: 2px solid rgba(var(--ui-rgb),0.25);
```

### .reader-body :global(code)
```css
background: rgba(var(--ui-rgb),0.07);
```

### .reader-body :global(pre)
```css
background: rgba(var(--ui-rgb),0.04);
border: 1px solid rgba(var(--ui-rgb),0.12);
```

### .reader-body :global(hr)
```css
border-top: 1px solid rgba(var(--ui-rgb),0.12);
```

---

## src/lib/components/DocReader.svelte

### .overlay-header
```css
border-bottom: 1px solid rgba(var(--ui-rgb), 0.12);
```

### .toc
```css
border-right: 1px solid rgba(var(--ui-rgb), 0.10);
```

### :global(.doc-content h1)
```css
border-bottom: 1px solid rgba(var(--ui-rgb),0.15);
```

### :global(.doc-content blockquote)
```css
border-left: 2px solid rgba(var(--ui-rgb),0.25);
```

### :global(.doc-content code)
```css
background: rgba(var(--ui-rgb),0.07);
```

### :global(.doc-content pre)
```css
background: rgba(var(--ui-rgb),0.04);
border: 1px solid rgba(var(--ui-rgb),0.12);
```

---

## src/routes/+layout.svelte

### .logout-modal
```css
background: var(--glass-bg);
backdrop-filter: var(--glass-blur);
-webkit-backdrop-filter: var(--glass-blur);
border: 1px solid var(--glass-border);
```

### .logout-title
```css
color: var(--clr-text);
```

### .logout-actions
```css
border-top: 1px solid rgba(var(--ui-rgb), 0.12);
```

### .logout-cancel, .logout-confirm
```css
border: 1px solid rgba(var(--ui-rgb), 0.20);
color: var(--clr-text);
```

### .logout-cancel:hover
```css
border-color: rgba(var(--ui-rgb), 0.40);
```

### .logout-confirm
```css
color: var(--clr-danger);
border-color: rgba(var(--ui-rgb), 0.20);
```
---

## src/routes/journals/+page.svelte (editor overlay — second pass 2026-03-07)

### .editor background (was glass-bg-heavy, now glass-bg-dark)
```css
background: var(--glass-bg-heavy);
```
No scoped `.editor .overlay-label` / `.editor .close-btn` / `.editor .dim` / `.editor .status` rules existed.

### .field-label: `color: var(--clr-text)` (now --clr-dark-text)
### .editor-fields inputs: `rgba(var(--ui-rgb), 0.08)` bg / `0.28` border / `--clr-text` (now dark-panel-rgb + --clr-dark-text)
### .editor-fields focus: `rgba(var(--ui-rgb), 0.50)` (now dark-panel-rgb 0.38)
### .editor-footer border: `rgba(var(--ui-rgb), 0.18)` (now dark-panel-rgb 0.12)
### .editor-footer button: `rgba(var(--ui-rgb), 0.30)` border / `--clr-text` / hover `0.50` (now dark-panel-rgb + --clr-dark-text)
### .save-btn: `rgba(var(--ui-rgb),0.12)` bg / `0.38` border / `--clr-text` (now dark-panel-rgb + --clr-dark-text)
### .seal-btn: `border-color: rgba(var(--ui-rgb), 0.15)` (now dark-panel-rgb)
