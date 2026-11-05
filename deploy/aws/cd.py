"""Root-owned production deployer. Only trusted main releases may invoke it.

Images are built by GitHub, not on the 2 GB production machine. Production
configuration never enters GitHub. No database restore or volume
deletion is performed. Command output is retained in a private server log.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
from datetime import datetime, timezone
from urllib.request import Request, urlopen


FILES = ("images.tar.gz", "source.tar.gz", "REVISION")


class DeploymentError(RuntimeError):
    """An operator-safe message, containing no configuration values."""


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def verify_bundle(directory, revision):
    require(re.fullmatch(r"[0-9a-f]{40}", revision), "Invalid release revision.")
    sums = []
    for name in FILES:
        with (directory / name).open("rb") as source:
            sums.append(f"{hashlib.file_digest(source, 'sha256').hexdigest()}  {name}\n")
    expected = "".join(sums)
    require((directory / "SHA256SUMS").read_text() == expected, "Release checksums do not match.")
    require((directory / "REVISION").read_text().strip() == revision, "Release revision mismatch.")


def extract_source(archive, destination):
    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        require(sum(m.size for m in members) <= 1024**3, "Source archive is too large.")
        require(len(members) <= 50000, "Too many source files.")
        seen = set()
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and ".." not in path.parts, "Unsafe source path.")
            require(not {".git", ".env"}.intersection(path.parts), "Private files in source archive.")
            require(member.isdir() or member.isfile(), "Linked or special source member.")
            require(str(path) not in seen, "Duplicate source member.")
            seen.add(str(path))
        for member in members:
            path = destination / member.name
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as src, path.open("xb") as out:
                    shutil.copyfileobj(src, out)
                path.chmod(0o755 if member.mode & 0o111 else 0o644)


def write_environment(source, destination, revision):
    require(stat.S_ISREG(source.lstat().st_mode), "Production env must be a regular file.")
    require(source.stat().st_mode & 0o077 == 0, "Production env must be private (0600).")
    lines = source.read_text().splitlines()
    lines = [line for line in lines if not re.match(r"\s*(?:export\s+)?IMAGE_TAG\s*=", line)]
    destination.write_text("\n".join(lines) + f"\nIMAGE_TAG={revision}\n")
    destination.chmod(0o600)


def validate_transition(old, new, revision):
    require(old["name"] == new["name"] == "sporthub-aws", "Compose project must stay sporthub-aws.")
    for name in ("postgres_data", "backend_data"):
        require(old["volumes"][name] == new["volumes"][name], "Persistent volume identity changed.")
    before, after = old["services"], new["services"]
    for key in ("image", "environment", "volumes"):
        require(before["postgres"][key] == after["postgres"][key], "Database configuration changed; deploy manually.")
    require(before["backend"]["volumes"] == after["backend"]["volumes"], "Runtime mounts changed.")
    for key in ("DataProtection__KeysPath", "Reports__StorageRoot", "ConnectionStrings__Default", "Frontend__BaseUrl"):
        require(before["backend"]["environment"][key] == after["backend"]["environment"][key], "Runtime paths changed.")
    require(before["caddy"]["environment"] == after["caddy"]["environment"], "Public API domain/TLS settings changed.")
    require(before["caddy"]["image"] == after["caddy"]["image"], "Caddy image changed; deploy manually.")
    for service, image in (("backend", "sporthub-backend"), ("ai-service", "sporthub-ai")):
        require(after[service]["image"] == f"{image}:{revision}", "Application image tag mismatch.")


def check_https(config, attempts=30):
    services = config["services"]
    origin = services["backend"]["environment"]["Frontend__BaseUrl"]
    domain = services["caddy"]["environment"]["API_DOMAIN"]
    for attempt in range(attempts):
        try:
            for path in ("/api/health", "/api/classes"):
                with urlopen(f"https://{domain}{path}", timeout=10) as response:
                    require(response.status == 200, "API check failed.")
                    if path == "/api/health":
                        require(json.load(response).get("status", "").lower() == "ok", "API health is not ok.")
            request = Request(f"https://{domain}/api/auth/login", method="OPTIONS", headers={
                "Origin": origin, "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            })
            with urlopen(request, timeout=10) as response:
                require(response.headers.get("Access-Control-Allow-Origin") == origin, "Frontend CORS check failed.")
            return
        except Exception:
            if attempt + 1 == attempts:
                raise DeploymentError("HTTPS/API/CORS check failed; inspect the private deploy log.") from None
            time.sleep(3)


class Deployer:
    def __init__(self, root=Path("/opt/sporthub"), backups=Path("/opt/sporthub-backups"),
                 inbox=Path("/opt/sporthub/cd-incoming")):
        self.root, self.backups, self.inbox = root, backups, inbox
        self.app = root / "app"
        self.releases = root / "releases"
        self.log = None
        self.phase = "preflight"
        self.old = None
        self.release = None
        self.command_env = os.environ.copy()
        for key in list(self.command_env):
            if key.startswith("COMPOSE_") or key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
                self.command_env.pop(key)
        self.command_env["DOCKER_HOST"] = "unix:///var/run/docker.sock"

    def run(self, args, capture=False, input_text=None, extra_env=None):
        env = self.command_env | (extra_env or {})
        result = subprocess.run([str(x) for x in args], env=env, input=input_text,
                                text=True, stdout=subprocess.PIPE if capture else self.log,
                                stderr=self.log, check=True, stdin=None if input_text is not None else subprocess.DEVNULL)
        return result.stdout if capture else None

    def compose(self, directory, *args, capture=False):
        return self.run(["bash", directory / "deploy/aws/compose.sh", *args], capture=capture)

    def recover_failure(self):
        if self.phase == "backup":
            # No migration has started, so the previously running release is safe.
            self.compose(self.old, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "backend", "caddy")
            print("PREVIOUS_RELEASE_RESUMED", flush=True)
        elif self.phase in ("migration", "start", "health"):
            # Never restore a live DB or assume an old image understands its schema.
            self.compose(self.release, "stop", "caddy", "backend")
            print("MANUAL_RECOVERY_REQUIRED: API remains stopped; database and backups preserved.", flush=True)

    def deploy(self, revision, bundle):
        require(re.fullmatch(r"[0-9a-f]{40}", revision), "Invalid release revision.")
        bundle = bundle.resolve(strict=True)
        require(bundle.is_relative_to(self.inbox.resolve()), "Bundle must be in the private CD inbox.")
        require(self.app.is_dir(), "Existing production installation is required.")
        self.root.mkdir(mode=0o700, exist_ok=True)
        with (self.root / "cd.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._deploy_locked(revision, bundle)

    def _deploy_locked(self, revision, bundle):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        self.releases.mkdir(mode=0o700, exist_ok=True)
        logs = self.root / "cd-logs"
        logs.mkdir(mode=0o700, exist_ok=True)
        with (logs / f"{stamp}-{revision}.log").open("w") as self.log:
            self.old = self.app.resolve()
            # Do not let inherited values override the server's private env-file.
            for line in (self.old / "deploy/aws/.env").read_text().splitlines():
                match = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
                if match:
                    self.command_env.pop(match[1], None)
            old_config = json.loads(self.compose(self.old, "config", "--format", "json", capture=True))
            if (self.old / ".sporthub-release").is_file() and (self.old / ".sporthub-release").read_text().strip() == revision:
                check_https(old_config)
                print(f"ALREADY_DEPLOYED {revision}", flush=True)
                return
            with tempfile.TemporaryDirectory(prefix=".bundle-", dir=self.releases) as temporary:
                private = Path(temporary)
                size = sum((bundle / name).lstat().st_size for name in (*FILES, "SHA256SUMS"))
                require(shutil.disk_usage(self.root).free >= 2 * 1024**3 + 4 * size, "Insufficient free disk; production is unchanged.")
                for name in (*FILES, "SHA256SUMS"):
                    source = bundle / name
                    with os.fdopen(os.open(source, os.O_RDONLY | os.O_NOFOLLOW), "rb") as src:
                        require(stat.S_ISREG(os.fstat(src.fileno()).st_mode), "Bundle files must be regular.")
                        with (private / name).open("xb") as out:
                            shutil.copyfileobj(src, out)
                verify_bundle(private, revision)
                require(shutil.disk_usage(self.root).free >= max(2 * 1024**3, 3 * (private / "images.tar.gz").stat().st_size), "Insufficient free disk; production is unchanged.")
                self.release = self.releases / f"{revision}-{stamp}"
                self.release.mkdir(mode=0o700)
                extract_source(private / "source.tar.gz", self.release)
                write_environment(self.old / "deploy/aws/.env", self.release / "deploy/aws/.env", revision)
                new_config_text = self.compose(self.release, "config", "--format", "json", capture=True)
                new_config = json.loads(new_config_text)
                validate_transition(old_config, new_config, revision)
                self.run(["python3", self.release / "deploy/aws/preflight.py"], input_text=new_config_text)
                self.run(["docker", "image", "load", "--input", private / "images.tar.gz"])
                for image in ("sporthub-backend", "sporthub-ai"):
                    label = self.run(["docker", "image", "inspect", "--format", '{{ index .Config.Labels "org.opencontainers.image.revision" }}', f"{image}:{revision}"], capture=True)
                    require(label.strip() == revision, "Image revision label mismatch.")
                print("RELEASE_AND_IMAGES_VERIFIED", flush=True)
                try:
                    self.phase = "backup"
                    self.compose(self.old, "stop", "caddy", "backend")
                    self.backups.mkdir(mode=0o700, exist_ok=True)
                    backup_root = self.backups / f"cd-{stamp}-{revision}"
                    backup_root.mkdir(mode=0o700)
                    shutil.copyfile(self.old / "deploy/aws/.env", backup_root / "production.env")
                    (backup_root / "production.env").chmod(0o600)
                    self.run(["bash", self.old / "deploy/aws/backup.sh"], extra_env={"BACKUP_DIR": str(backup_root)})
                    print(f"BACKUP_COMPLETE {backup_root}", flush=True)
                    self.phase = "migration"
                    self.compose(self.release, "run", "--rm", "--no-deps", "-T", "--entrypoint", "/app/migrate", "backend")
                    print("MIGRATION_COMPLETE", flush=True)
                    self.phase = "start"
                    self.compose(self.release, "up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "180", "backend", "ai-service", "caddy")
                    self.phase = "health"
                    check_https(new_config)
                    (self.release / ".sporthub-release").write_text(revision + "\n")
                    # Keep the original Git checkout/private env recoverable on first CD.
                    pointer = self.root / f".app-{stamp}"
                    pointer.symlink_to(self.release)
                    if not self.app.is_symlink():
                        legacy = self.releases / f"legacy-{stamp}"
                        self.app.rename(legacy)
                        try:
                            os.replace(pointer, self.app)
                        except Exception:
                            legacy.rename(self.app)
                            raise
                    else:
                        os.replace(pointer, self.app)
                    self.phase = "complete"
                    print(f"DEPLOYMENT_SUCCEEDED {revision}", flush=True)
                except Exception:
                    self.recover_failure()
                    raise


def main():
    os.umask(0o077)
    require(os.geteuid() == 0, "Use the installed sudo deployment wrapper.")
    require(len(sys.argv) == 3, "Usage: sporthub-cd FULL_COMMIT_SHA BUNDLE_DIRECTORY")
    try:
        Deployer().deploy(sys.argv[1], Path(sys.argv[2]))
    except Exception as error:
        # Commands/configuration may contain credentials. Never print the exception.
        logs = Path("/opt/sporthub/cd-logs")
        logs.mkdir(mode=0o700, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        with (logs / f"failure-{stamp}.log").open("w") as private_log:
            traceback.print_exc(file=private_log)
        if isinstance(error, DeploymentError):
            print(str(error), file=sys.stderr)
        print(f"DEPLOYMENT_FAILED ({type(error).__name__}). Inspect /opt/sporthub/cd-logs as root.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
