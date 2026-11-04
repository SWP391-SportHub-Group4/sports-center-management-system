#!/usr/bin/env bash
# One-time activation on the existing AWS machine. No GitHub runner or SSH rule.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'Releases target Linux x64.' >&2; exit 1; }
task_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f /opt/sporthub/app/deploy/aws/.env ]] || { echo 'Existing production installation is required.' >&2; exit 1; }
for command in python3 docker systemctl; do command -v "$command" >/dev/null; done
if systemctl is-active --quiet sporthub-cd.service; then
  echo 'A CD check/deploy is running. Wait until it finishes before updating the installer.' >&2
  exit 1
fi
python3 - <<'PY'
import json,urllib.request
request=urllib.request.Request('https://api.github.com/repos/SWP391-SportHub-Group4/sports-center-management-system',headers={'User-Agent':'SportHub-CD'})
with urllib.request.urlopen(request,timeout=30) as response:
    repository=json.load(response)
if repository.get('private') is not False:
    raise SystemExit('This token-free CD installation requires a public repository.')
PY
bash /opt/sporthub/app/deploy/aws/compose.sh config --quiet
install -d -m 0755 /usr/local/lib/sporthub-cd
install -d -m 0700 /opt/sporthub/cd-incoming /opt/sporthub/cd-logs
for file in cd.py poll-cd.py; do
  install -o root -g root -m 0644 "$task_dir/$file" "/usr/local/lib/sporthub-cd/$file.new"
  mv -f -- "/usr/local/lib/sporthub-cd/$file.new" "/usr/local/lib/sporthub-cd/$file"
done
install -o root -g root -m 0644 "$task_dir/sporthub-cd.service" /etc/systemd/system/sporthub-cd.service
install -o root -g root -m 0644 "$task_dir/sporthub-cd.timer" /etc/systemd/system/sporthub-cd.timer
systemctl daemon-reload
systemctl enable --now sporthub-cd.timer
echo 'AWS_CD_ENABLED: main releases will be checked every five minutes.'
echo 'A successful new release will trigger backup, migration and a brief API maintenance window.'
echo 'Check: sudo systemctl status sporthub-cd.timer; sudo journalctl -u sporthub-cd.service -n 30'
