/**
 * 终端主题预设定义
 * 每个主题都确保前景色与背景色有足够的对比度
 */
export interface TerminalTheme {
  id: string
  name: string
  /** 所属主题组 */
  group: 'dark' | 'light'
  colors: {
    background: string
    foreground: string
    cursor: string
    cursorAccent: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  // ========== 暗色主题（深色应用背景） ==========
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    group: 'dark',
    colors: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: '#264f78',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    group: 'dark',
    colors: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    group: 'dark',
    colors: {
      background: '#2E2E2E',
      foreground: '#FCFCFA',
      cursor: '#FCFCFA',
      cursorAccent: '#2E2E2E',
      selectionBackground: '#615e4c',
      black: '#333333',
      red: '#F92672',
      green: '#A6E22E',
      yellow: '#F4BF75',
      blue: '#66D9EF',
      magenta: '#AE81FF',
      cyan: '#75D4EE',
      white: '#D8D8D8',
      brightBlack: '#727272',
      brightRed: '#F92672',
      brightGreen: '#A6E22E',
      brightYellow: '#F4BF75',
      brightBlue: '#66D9EF',
      brightMagenta: '#AE81FF',
      brightCyan: '#75D4EE',
      brightWhite: '#FFFFFF',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    group: 'dark',
    colors: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      cursorAccent: '#282c34',
      selectionBackground: '#3e4451',
      black: '#3e4451',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    group: 'dark',
    colors: {
      background: '#2E3440',
      foreground: '#D8DEE9',
      cursor: '#D8DEE9',
      cursorAccent: '#2E3440',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    group: 'dark',
    colors: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      cursorAccent: '#1e1e2e',
      selectionBackground: '#313244',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
  },
  // ========== 亮色主题（浅色应用背景） ==========
  {
    id: 'github-light',
    name: 'GitHub Light',
    group: 'light',
    colors: {
      background: '#ffffff',
      foreground: '#24292f',
      cursor: '#044289',
      cursorAccent: '#ffffff',
      selectionBackground: '#0969da26',
      black: '#24292f',
      red: '#cf222e',
      green: '#1a7f37',
      yellow: '#9a6700',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#0598bc',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#cf222e',
      brightGreen: '#1a7f37',
      brightYellow: '#9a6700',
      brightBlue: '#0969da',
      brightMagenta: '#8250df',
      brightCyan: '#0598bc',
      brightWhite: '#24292f',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    group: 'light',
    colors: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#536c79',
      cursorAccent: '#fdf6e3',
      selectionBackground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    group: 'light',
    colors: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      cursor: '#d20f39',
      cursorAccent: '#eff1f5',
      selectionBackground: '#acb0be',
      black: '#5c5f77',
      red: '#d20f39',
      green: '#40a02b',
      yellow: '#df8e1d',
      blue: '#1e66f5',
      magenta: '#ea76cb',
      cyan: '#179299',
      white: '#ccd0da',
      brightBlack: '#6c6f85',
      brightRed: '#d20f39',
      brightGreen: '#40a02b',
      brightYellow: '#df8e1d',
      brightBlue: '#1e66f5',
      brightMagenta: '#ea76cb',
      brightCyan: '#179299',
      brightWhite: '#bcc0cc',
    },
  },
]

export function getTerminalTheme(id: string): TerminalTheme {
  return TERMINAL_THEMES.find(t => t.id === id) ?? TERMINAL_THEMES[0]
}
