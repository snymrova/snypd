# The theme factory's sandbox (docs/29): Bun, Chromium and a fixed font set, so a screenshot taken here
# looks the same on every machine and never depends on what the host happens to have installed.
FROM oven/bun:1.4.0-debian
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core git ca-certificates nodejs \
 && rm -rf /var/lib/apt/lists/*
# Real node ahead of bun's fallback shim: the launcher's tests run it under node on purpose.
ENV PATH=/usr/bin:$PATH \
    SNYPD_CHROME=/usr/bin/chromium \
    SNYPD_CHROME_FLAGS="--no-sandbox" \
    HOME=/tmp \
    DO_NOT_TRACK=1 \
    GIT_AUTHOR_NAME="snypd sandbox" GIT_AUTHOR_EMAIL=sandbox@snypd.invalid \
    GIT_COMMITTER_NAME="snypd sandbox" GIT_COMMITTER_EMAIL=sandbox@snypd.invalid
