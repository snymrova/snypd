# The `check theme` still (docs/15 §2 block 7). Run from a site directory, never from the repo: the compiled
# binary loads `themes/<name>/` off the cwd when one is there, and the repo's own `themes/` carries TSX.
#   cd .scratch/readme-site && vhs ../../packages/bench/readme/tapes/check-theme.tape
Output ../../.github/readme/terminal/check-theme.gif
Set Shell zsh
Set FontFamily "JetBrains Mono"
Set FontSize 14
Set LineHeight 1.25
Set Width 1480
Set Height 620
Set Padding 28
Set Theme { "name": "snypd", "background": "#1d1a17", "foreground": "#f4efe6", "cursor": "#e0a458", "black": "#1d1a17", "red": "#e06c5c", "green": "#8fbf7f", "yellow": "#e0a458", "blue": "#7fa7c9", "magenta": "#c497b8", "cyan": "#7fc0b9", "white": "#f4efe6", "brightBlack": "#6e665c", "brightRed": "#e06c5c", "brightGreen": "#8fbf7f", "brightYellow": "#e0a458", "brightBlue": "#7fa7c9", "brightMagenta": "#c497b8", "brightCyan": "#7fc0b9", "brightWhite": "#ffffff" }
Set TypingSpeed 40ms
Hide
Type "export PS1='%F{yellow}field-notes%f $ '" Enter
Type "clear" Enter
Show
Type "snypd check theme editorial"
Sleep 400ms
Enter
Sleep 2s
Screenshot ../../.github/readme/terminal/check-theme.png
Sleep 500ms
