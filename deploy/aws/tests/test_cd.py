"""Exercise deployment ordering and failure recovery without production/Docker."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("sporthub_cd", Path(__file__).parents[1] / "cd.py")
cd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cd)
SHA = "a" * 40


def configuration(tag):
    return {
        "name": "sporthub-aws",
        "volumes": {k: {"name": "sporthub-aws_" + k} for k in ("postgres_data", "backend_data")},
        "services": {
            "postgres": {"image": "postgres:18-bookworm", "environment": {"POSTGRES_DB": "railway"},
                         "volumes": [{"source": "postgres_data", "target": "/var/lib/postgresql"}]},
            "backend": {"image": "sporthub-backend:" + tag,
                        "volumes": [{"source": "backend_data", "target": "/var/lib/sporthub"}],
                        "environment": {"DataProtection__KeysPath": "/var/lib/sporthub/dataprotection-keys",
                                        "Reports__StorageRoot": "/var/lib/sporthub/reports",
                                        "ConnectionStrings__Default": "Host=postgres;Database=railway",
                                        "Frontend__BaseUrl": "https://frontend.example.com"}},
            "ai-service": {"image": "sporthub-ai:" + tag},
            "caddy": {"image": "caddy:2-alpine", "environment": {"API_DOMAIN": "api.example.com"}},
        },
    }


def source_archive(path, name="deploy/aws/compose.sh", kind=tarfile.REGTYPE):
    with tarfile.open(path, "w:gz") as archive:
        member = tarfile.TarInfo(name)
        member.type = kind
        if kind == tarfile.REGTYPE:
            data = b"#!/bin/sh\n"
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
        else:
            member.linkname = "/tmp/outside"
            archive.addfile(member)


class FakeDeployer(cd.Deployer):
    def __init__(self, root, backups, inbox, fail=None):
        super().__init__(root, backups, inbox)
        self.fail = fail
        self.calls = []

    def run(self, args, capture=False, input_text=None, extra_env=None):
        args = [str(a) for a in args]
        self.calls.append(args)
        if args[0] == "bash" and args[1].endswith("compose.sh"):
            if args[2:5] == ["config", "--format", "json"]:
                tag = "old" if Path(args[1]).is_relative_to(self.old) else SHA
                return json.dumps(configuration(tag))
            if "/app/migrate" in args and self.fail == "migration":
                raise subprocess.CalledProcessError(1, args)
            if "up" in args and self.phase == "start" and self.fail == "start":
                raise subprocess.CalledProcessError(1, args)
        if args[0] == "bash" and args[1].endswith("backup.sh"):
            if self.fail == "backup":
                raise subprocess.CalledProcessError(1, args)
            (Path(extra_env["BACKUP_DIR"]) / "backup-proof").write_text("database and runtime")
        if args[:3] == ["docker", "image", "inspect"]:
            return SHA + "\n"
        return "" if capture else None


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "production"
        self.app = self.root / "app"
        self.env = self.app / "deploy/aws/.env"
        self.env.parent.mkdir(parents=True)
        self.env.write_text("POSTGRES_PASSWORD=private-test-value\nIMAGE_TAG=old\n")
        self.env.chmod(0o600)
        self.inbox = self.base / "runner/_work"
        self.bundle = self.inbox / "_temp/release"
        self.bundle.mkdir(parents=True)
        (self.bundle / "images.tar.gz").write_bytes(b"mock Docker save archive")
        source_archive(self.bundle / "source.tar.gz")
        (self.bundle / "REVISION").write_text(SHA + "\n")
        self.checksums()
        self.deployer = FakeDeployer(self.root, self.base / "backups", self.inbox)
        self.addCleanup(patch.stopall)
        patch.object(cd.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * 1024**3)).start()
        self.https = patch.object(cd, "check_https").start()

    def checksums(self):
        text = "".join(f"{hashlib.sha256((self.bundle / n).read_bytes()).hexdigest()}  {n}\n" for n in cd.FILES)
        (self.bundle / "SHA256SUMS").write_text(text)

    def deploy(self):
        with redirect_stdout(io.StringIO()):
            self.deployer.deploy(SHA, self.bundle)

    def test_success_backs_up_before_migration_and_preserves_old_config(self):
        self.deploy()
        self.assertTrue(self.app.is_symlink())
        self.assertEqual((self.app / ".sporthub-release").read_text().strip(), SHA)
        self.assertIn("IMAGE_TAG=" + SHA, self.env.read_text())
        self.assertIn("POSTGRES_PASSWORD=private-test-value", self.env.read_text())
        backup = next((self.base / "backups").glob("cd-*"))
        self.assertTrue((backup / "backup-proof").exists())
        self.assertEqual((backup / "production.env").stat().st_mode & 0o777, 0o600)
        calls = self.deployer.calls
        backup_index = next(i for i, c in enumerate(calls) if c[1].endswith("backup.sh"))
        migration_index = next(i for i, c in enumerate(calls) if "/app/migrate" in c)
        self.assertLess(backup_index, migration_index)
        self.assertTrue(any(self.deployer.releases.glob("legacy-*/deploy/aws/.env")))
        self.assertFalse(any("build" in c or "down" in c or "pg_restore" in c for c in calls))

    def test_backup_failure_resumes_old_release_without_migration(self):
        self.deployer.fail = "backup"
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertFalse(self.app.is_symlink())
        self.assertIn("IMAGE_TAG=old", self.env.read_text())
        self.assertFalse(any("/app/migrate" in c for c in self.deployer.calls))
        self.assertIn("up", self.deployer.calls[-1])
        self.assertIn(str(self.app / "deploy/aws/compose.sh"), self.deployer.calls[-1])

    def test_migration_failure_stops_api_without_database_rollback(self):
        self.deployer.fail = "migration"
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertEqual(self.deployer.calls[-1][-3:], ["stop", "caddy", "backend"])
        self.assertFalse(any("pg_restore" in c or "down" in c for c in self.deployer.calls))
        self.assertFalse(self.app.is_symlink())

    def test_failed_https_does_not_publish_release(self):
        self.https.side_effect = cd.DeploymentError("HTTPS failed")
        with self.assertRaises(cd.DeploymentError):
            self.deploy()
        self.assertFalse(self.app.is_symlink())
        self.assertEqual(self.deployer.calls[-1][-3:], ["stop", "caddy", "backend"])

    def test_bad_checksum_does_not_stop_production(self):
        (self.bundle / "images.tar.gz").write_bytes(b"changed")
        with self.assertRaises(cd.DeploymentError):
            self.deploy()
        self.assertFalse(any("stop" in c for c in self.deployer.calls))

    def test_untrusted_workspace_is_rejected(self):
        with self.assertRaises(cd.DeploymentError):
            self.deployer.deploy(SHA, self.base)
        self.assertEqual(self.deployer.calls, [])

    def test_low_disk_does_not_stop_production(self):
        cd.shutil.disk_usage.return_value = SimpleNamespace(free=1024)
        with self.assertRaises(cd.DeploymentError):
            self.deploy()
        self.assertFalse(any("stop" in c for c in self.deployer.calls))

    def test_already_deployed_revision_checks_health_without_second_migration(self):
        self.deploy()
        self.deployer.calls.clear()
        self.deploy()
        self.assertFalse(any("stop" in c or "/app/migrate" in c for c in self.deployer.calls))
        self.assertEqual(self.https.call_count, 2)

    def test_linked_artifact_is_rejected(self):
        image = self.bundle / "images.tar.gz"
        image.unlink()
        image.symlink_to(self.bundle / "REVISION")
        with self.assertRaises(OSError):
            self.deploy()
        self.assertFalse(any("stop" in c for c in self.deployer.calls))

    def test_first_pointer_update_failure_keeps_original_installation_accessible(self):
        with patch.object(cd.os, "replace", side_effect=OSError("pointer failed")):
            with self.assertRaises(OSError):
                self.deploy()
        self.assertTrue(self.app.is_dir())
        self.assertFalse(self.app.is_symlink())
        self.assertIn("IMAGE_TAG=old", self.env.read_text())


class ValidationTests(unittest.TestCase):
    def test_database_and_runtime_changes_are_rejected(self):
        before, after = configuration("old"), configuration(SHA)
        cd.validate_transition(before, after, SHA)
        for mutate in (
            lambda c: c["volumes"]["postgres_data"].update(name="empty-new-volume"),
            lambda c: c["services"]["postgres"].update(image="postgres:19"),
            lambda c: c["services"]["postgres"].update(ports=[{"target": 5432, "published": "15432"}]),
            lambda c: c["services"]["postgres"].update(command=["postgres", "-c", "ssl=off"]),
            lambda c: c["services"]["backend"]["environment"].update(ConnectionStrings__Default="Host=somewhere-else"),
            lambda c: c["services"]["backend"]["environment"].update(DataProtection__KeysPath="/new-path"),
        ):
            changed = copy.deepcopy(after)
            mutate(changed)
            with self.assertRaises(cd.DeploymentError):
                cd.validate_transition(before, changed, SHA)

    def test_source_links_traversal_and_env_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, kind in (("../outside", tarfile.REGTYPE), ("deploy/aws/.env", tarfile.REGTYPE), ("linked", tarfile.SYMTYPE)):
                source_archive(root / "source.tar.gz", name, kind)
                with self.assertRaises(cd.DeploymentError):
                    cd.extract_source(root / "source.tar.gz", root / "extract")


if __name__ == "__main__":
    unittest.main()
