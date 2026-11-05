"""Pull-based CD for the public repository; never executes Actions jobs on AWS."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

REPO = "SWP391-SportHub-Group4/sports-center-management-system"
API = f"https://api.github.com/repos/{REPO}"
ASSETS = {"images.tar.gz", "source.tar.gz", "REVISION", "SHA256SUMS"}


def get_json(url):
    request = Request(url, headers={"User-Agent": "SportHub-CD", "Accept": "application/vnd.github+json",
                                    "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def download_asset(asset, destination):
    name = asset["name"]
    digest = asset.get("digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest or ""):
        raise RuntimeError("GitHub asset digest unavailable.")
    url = asset["browser_download_url"]
    if not url.startswith(f"https://github.com/{REPO}/releases/download/"):
        raise RuntimeError("Unexpected release asset URL.")
    size = asset["size"]
    limit = 2 * 1024**3 if name == "images.tar.gz" else 256 * 1024**2
    if not 0 < size <= limit:
        raise RuntimeError("Unexpected release size.")
    h, count = hashlib.sha256(), 0
    with urlopen(Request(url, headers={"User-Agent": "SportHub-CD"}), timeout=120) as response, destination.open("xb") as target:
        while block := response.read(1024 * 1024):
            count += len(block)
            if count > size:
                raise RuntimeError("Release asset exceeds expected size.")
            target.write(block)
            h.update(block)
    if count != size or h.hexdigest() != digest.removeprefix("sha256:"):
        raise RuntimeError("Release asset digest mismatch.")


class Poller:
    def __init__(self, root=Path("/opt/sporthub")):
        self.root = root

    def check(self):
        blocked = self.root / "cd-blocked.json"
        if blocked.exists():
            print("CD_BLOCKED: inspect the previous deployment before clearing cd-blocked.json.")
            return
        revision = get_json(API + "/branches/main")["commit"]["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise RuntimeError("Invalid main revision.")
        deployed = self.root / "app/.sporthub-release"
        if deployed.is_file() and deployed.read_text().strip() == revision:
            print(f"UP_TO_DATE {revision}")
            return
        runs = get_json(API + f"/actions/workflows/ci.yml/runs?branch=main&head_sha={revision}&per_page=10")["workflow_runs"]
        matching = [r for r in runs if r["head_sha"] == revision and r["head_branch"] == "main"
                    and r["event"] in ("push", "workflow_dispatch")]
        if not matching or max(matching, key=lambda r: (r["id"], r.get("run_attempt", 1))).get("conclusion") != "success":
            print("WAITING_FOR_MAIN_CI")
            return
        release = get_json(API + f"/releases/tags/aws-{revision}")
        if (release.get("draft") or release.get("tag_name") != "aws-" + revision
                or release.get("target_commitish") != revision
                or release.get("author", {}).get("login") != "github-actions[bot]"):
            raise RuntimeError("Release was not published by the expected main workflow.")
        assets = release.get("assets", [])
        if len(assets) != len(ASSETS) or {a["name"] for a in assets} != ASSETS:
            raise RuntimeError("Unexpected release assets.")
        inbox = self.root / "cd-incoming"
        inbox.mkdir(mode=0o700, exist_ok=True)
        if shutil.disk_usage(inbox).free < 2 * 1024**3 + 5 * sum(a["size"] for a in assets):
            raise RuntimeError("Insufficient disk for downloading release; application is unchanged.")
        with tempfile.TemporaryDirectory(prefix=revision + "-", dir=inbox) as temporary:
            bundle = Path(temporary)
            for asset in assets:
                download_asset(asset, bundle / asset["name"])
            if get_json(API + "/branches/main")["commit"]["sha"] != revision:
                print("MAIN_ADVANCED: wait for the newer release.")
                return
            # Persist before starting: power loss/cancellation must require inspection too.
            blocked.write_text(json.dumps({"revision": revision, "reason": "deployment_in_progress"}) + "\n")
            blocked.chmod(0o600)
            result = subprocess.run(["/usr/bin/python3", "/usr/local/lib/sporthub-cd/cd.py", revision, str(bundle)],
                                    stdin=subprocess.DEVNULL, check=False)
            if result.returncode:
                blocked.write_text(json.dumps({"revision": revision, "reason": "deployment_failed_requires_inspection"}) + "\n")
                blocked.chmod(0o600)
                raise RuntimeError("Deployment failed. Automatic CD is paused; inspect private deployment logs.")
            blocked.unlink()


def main():
    os.umask(0o077)
    root = Path("/opt/sporthub")
    if os.geteuid() != 0 or not (root / "app/deploy/aws/.env").is_file():
        print("Existing production installation and root service are required.", file=sys.stderr)
        return 1
    try:
        with (root / "cd-poll.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Poller(root).check()
        return 0
    except Exception as error:
        if isinstance(error, RuntimeError):
            print(str(error), file=sys.stderr)
        elif hasattr(error, "code"):
            print(f"GitHub HTTP {error.code}; retry at the next timer tick.", file=sys.stderr)
        print(f"CD_CHECK_FAILED ({type(error).__name__}); production data is preserved.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
