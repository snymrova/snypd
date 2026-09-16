# V1, the hero (docs/15 §3.3): one sentence into Claude Code, a site, a post, a build. A real session —
# every wait is for text the run prints, and the model's own words are whatever they were that take.
#   cd ~/Projects/field-notes && env -i HOME=$HOME PATH=$PATH TERM=xterm-256color LANG=C.UTF-8 \
#     vhs ../snypd/packages/bench/readme/tapes/v1-hero.tape
Output ../snypd/.scratch/readme-video/v1-hero.mp4
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

Type "Set up snypd here as “Field Notes”, at https://readme.snypd.rocks — run `snypd init`, then tell me what you need from me."
Sleep 600ms
Enter
Wait+Screen@180s /done \d+:\d+/
Sleep 5s

Type "/exit" Sleep 300ms Enter
Sleep 1500ms
Hide
Type "clear" Enter
Show
Type "claude" Sleep 300ms Enter
Wait+Screen@30s /Claude Code/
Sleep 1500ms

Type "Write the first post: what a markdown twin actually saves an agent. A chart of tokens per page, HTML against the twin, sourced from snypd.rocks/bench; a flow of how a post gets published; a short FAQ. Then build it."
Sleep 600ms
Enter
Wait+Screen@600s /done \d+:\d+/
Sleep 6s
Screenshot ../snypd/.scratch/readme-video/v1-end.png
Sleep 2s
