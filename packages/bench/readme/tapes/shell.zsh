# Sourced off camera by the README tapes (packages/bench/readme/tapes/*.tape).
# `bunx @snypd/cli init` as the README has it, routed to the binary compiled from this tree — and,
# after it, the permissions a person grants by clicking "allow" once, kept out of the site's tree
# (`.git/info/exclude`, not `.gitignore`) so the agent sees the clean repo `init` left.
bunx() { ~/.local/bin/snypd "${@:2}" && settle; }
settle() {
  mkdir -p .claude && printf '%s\n' '{"permissions":{"allow":["Bash(snypd:*)","Bash(git:*)","mcp__snypd"]},"enableAllProjectMcpServers":true}' > .claude/settings.json
  [ -d .git ] && printf '%s\n' '.claude/' '.playwright-mcp/' >> .git/info/exclude
}
export PS1='%F{yellow}%1~%f $ '
