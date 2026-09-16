# V2, six looks (docs/15 §3.3): one sentence changes the theme; the browser half is the same page in every
# look the shelf carries. Runs in the site V1 made.
#   cd ~/Projects/field-notes && env -i HOME=$HOME PATH=$PATH TERM=xterm-256color LANG=C.UTF-8 \
#     vhs ../snypd/packages/bench/readme/tapes/v1-hero.tape
Output ../snypd/.scratch/readme-video/v2-looks.mp4
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

Type "Switch this site to technical › phosphor and rebuild. Then tell me what other looks are on the shelf."
Sleep 600ms
Enter
Wait+Screen@300s /done \d+:\d+/
Sleep 6s
Screenshot ../snypd/.scratch/readme-video/v2-end.png
Sleep 2s
