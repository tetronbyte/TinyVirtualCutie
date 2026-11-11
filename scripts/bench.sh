#!/usr/bin/env bash
# Perf benchmark (dev only).
# Usage: [DUMBO_FLAGS="--chromium-switch ..."] [DUMBO_OPAQUE=1] scripts/bench.sh <mode>
#   mode: live (normal behaviour) | idle | blank | f<N> (N front redraws/s) | s<N> (side) | nf<N> (no SVG filters) | gf<N> (generate only, no DOM)
# Prints average % of ONE core used by the whole Electron process tree over 60 s, plus per-process split.
cd "$(dirname "$0")/.."
powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"; sleep 1
if [ "$1" = live ]; then npm run dev >/tmp/bench.log 2>&1 & else DUMBO_BENCH="$1" npm run dev >/tmp/bench.log 2>&1 & fi
sleep 12
powershell -NoProfile -Command - <<EOF
\$s = Get-Counter '\Process(electron*)\% Processor Time' -SampleInterval 3 -MaxSamples 20
\$h = @{}; \$t = 0
foreach (\$x in \$s.CounterSamples) { \$t += \$x.CookedValue; \$n = \$x.InstanceName; \$h[\$n] += \$x.CookedValue }
\$parts = (\$h.Keys | ForEach-Object { "\$_=" + [math]::Round(\$h[\$_] / 20, 1) }) -join ' '
"$1 \${env:DUMBO_FLAGS}: avg %core = " + [math]::Round(\$t / 20, 1) + "  [" + \$parts + "]"
EOF
powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"
