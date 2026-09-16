# V1, the hero (docs/15 §3.3, docs/08 decision 178): one command in a terminal, then Claude Code — a
# site, a post, a build. A real session: every wait is for text the run prints, and the model's own
# words are whatever they were that take.
#   cd ~/Projects && rm -rf field-notes && env -i HOME=$HOME PATH=$PATH TERM=xterm-256color LANG=C.UTF-8 \
#     DISABLE_AUTOUPDATER=1 vhs snypd/packages/bench/readme/tapes/v1-hero.tape
# `bunx @snypd/cli init` is typed as the README has it and routed, off camera, to the binary compiled
# from this tree (`~/.local/bin/snypd`) by `tapes/shell.zsh`: the README pictures 0.1.5's tree,
# and npm carries 0.1.3 until the release is pressed. That shim, and the `.claude/settings.json` it
# writes after `init` (what clicking "allow" once would grant), are the only staged parts of the take.
Output snypd/.scratch/readme-video/v1-hero.mp4
Set Shell zsh
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set LineHeight 1.2
Set Width 1440
Set Height 900
Set Padding 24
Set Framerate 30
Set TypingSpeed 40ms
Set Theme { "name": "snypd", "background": "#1d1a17", "foreground": "#f4efe6", "cursor": "#e0a458", "selection": "#3a332c", "black": "#1d1a17", "red": "#e06c5c", "green": "#8fbf7f", "yellow": "#e0a458", "blue": "#7fa7c9", "magenta": "#c497b8", "cyan": "#7fc0b9", "white": "#f4efe6", "brightBlack": "#8a8177", "brightRed": "#e06c5c", "brightGreen": "#8fbf7f", "brightYellow": "#e0a458", "brightBlue": "#7fa7c9", "brightMagenta": "#c497b8", "brightCyan": "#7fc0b9", "brightWhite": "#ffffff" }

Hide
Type "source snypd/packages/bench/readme/tapes/shell.zsh && clear" Enter
Show

Sleep 1200ms
Type "mkdir field-notes && cd field-notes" Sleep 300ms Enter
Sleep 900ms
Type "bunx @snypd/cli init" Sleep 400ms Enter
Sleep 7s
Type "claude" Sleep 300ms Enter
Wait+Screen@30s /Claude Code/
Sleep 1500ms

Type "Write me a first post: what a markdown twin actually saves an agent. A chart of tokens per page, HTML against the twin, sourced from snypd.rocks/bench; a flow of how a post gets published; a short FAQ. It will live at https://readme.snypd.rocks. Then build it."
Sleep 600ms
Enter
Wait+Screen@600s /done \d+:\d+/
Sleep 6s
Screenshot snypd/.scratch/readme-video/v1-end.png
Sleep 2s
