# V4, a theme from nothing (docs/15 §3.3): the agent scaffolds one with `snypd new theme`, writes its
# tokens and stylesheet, and `snypd check theme` is the judge. Runs in the site V1 made.
#   cd ~/Projects/field-notes && env -i HOME=$HOME PATH=$PATH TERM=xterm-256color LANG=C.UTF-8 \
#     vhs ../snypd/packages/bench/readme/tapes/v1-hero.tape
Output ../snypd/.scratch/readme-video/v4-theme.mp4
Set Shell zsh
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set LineHeight 1.2
Set Width 1440
Set Height 900
Set Padding 24
Set Framerate 30
Set TypingSpeed 35ms
Set Theme { "name": "snypd", "background": "#1d1a17", "foreground": "#f4efe6", "cursor": "#e0a458", "selection": "#3a332c", "black": "#1d1a17", "red": "#e06c5c", "green": "#8fbf7f", "yellow": "#e0a458", "blue": "#7fa7c9", "magenta": "#c497b8", "cyan": "#7fc0b9", "white": "#f4efe6", "brightBlack": "#8a8177", "brightRed": "#e06c5c", "brightGreen": "#8fbf7f", "brightYellow": "#e0a458", "brightBlue": "#7fa7c9", "brightMagenta": "#c497b8", "brightCyan": "#7fc0b9", "brightWhite": "#ffffff" }

Hide
Type "export PS1='%F{yellow}~/field-notes%f $ '" Enter
Type "clear" Enter
Show

Sleep 800ms
Type "claude" Sleep 300ms Enter
Wait+Screen@30s /Claude Code/
Sleep 1500ms

Type "Make me a theme called slate: cool grey, one blue accent, sans headings, a dark look called night. Scaffold it with `snypd new theme`, then run `snypd check theme slate` until every rule passes, then switch the site to it."
Sleep 600ms
Enter
Wait+Screen@600s /done \d+:\d+/
Sleep 6s
Screenshot ../snypd/.scratch/readme-video/v4-end.png
Sleep 2s
