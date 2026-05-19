# How to Change StrudelMirror Settings

This document explains how to change the settings of the `StrudelMirror` editor in the `StrudelEditor.vue` component.

## Introduction

The `StrudelEditor.vue` component encapsulates the `StrudelMirror` editor and exposes methods to configure its appearance and behavior. The settings are initially defined in the `editorConfig` object within the component's script.

## How to Change Settings

To change the settings of the `StrudelMirror` editor, you need to get a reference to the `StrudelEditor` component in your parent component and call the exposed methods.

For example, in your parent component's template:

```vue
<template>
  <StrudelEditor ref="strudelEditor" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import StrudelEditor from './components/StrudelEditor.vue';

const strudelEditor = ref(null);

onMounted(() => {
  // Change the font size
  strudelEditor.value.setFontSize(14);

  // Change the theme
  strudelEditor.value.setTheme('dark');
});
</script>
```

## Available Settings and Methods

Here is a list of the available settings and the methods to change them:

| Setting                      | Method                               | Description                               |
| ---------------------------- | ------------------------------------ | ----------------------------------------- |
| Font Size                    | `setFontSize(size: number)`          | Sets the font size of the editor.         |
| Font Family                  | `setFontFamily(family: string)`      | Sets the font family of the editor.       |
| Theme                        | `setTheme(theme: string)`            | Sets the theme of the editor.             |
| Bracket Matching             | `setBracketMatchingEnabled(enabled: boolean)` | Enables or disables bracket matching.     |
| Auto Bracket Closing         | `setBracketClosingEnabled(enabled: boolean)`  | Enables or disables auto bracket closing. |
| Line Numbers                 | `setLineNumbersDisplayed(enabled: boolean)` | Shows or hides line numbers.              |
| Autocompletion               | `setAutocompletionEnabled(enabled: boolean)` | Enables or disables autocompletion.       |
| Line Wrapping                | `setLineWrappingEnabled(enabled: boolean)`   | Enables or disables line wrapping.        |

You can also update multiple settings at once using the `updateEditorConfig` method:

```javascript
strudelEditor.value.updateEditorConfig({
  fontSize: 16,
  theme: 'light',
  isLineNumbersDisplayed: false,
});
```

The full list of configurable settings can be found in the `editorConfig` object in `src/components/StrudelEditor.vue`.