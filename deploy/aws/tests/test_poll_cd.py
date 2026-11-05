import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sporthub_poll", Path(__file__).parents[1] / "poll-cd.py")
poll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poll)
SHA = "b" * 40


class PollTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.poller = poll.Poller(self.root)
        self.run = {"id": 10, "run_attempt": 1, "head_sha": SHA, "head_branch": "main", "event": "push", "conclusion": "success"}
        self.release = {"draft": False, "tag_name": "aws-" + SHA, "target_commitish": SHA,
                        "author": {"login": "github-actions[bot]"},
                        "assets": [{"name": name, "size": 1} for name in poll.ASSETS]}
        self.branch_reads = 0
        self.advanced = False
        self.fetch = patch.object(poll, "get_json", side_effect=self.get_json).start()
        self.download = patch.object(poll, "download_asset", side_effect=lambda asset, path: path.write_bytes(b"x")).start()
        self.process = patch.object(poll.subprocess, "run", return_value=SimpleNamespace(returncode=0)).start()
        patch.object(poll.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * 1024**3)).start()
        self.addCleanup(patch.stopall)

    def get_json(self, url):
        if url.endswith("/branches/main"):
            self.branch_reads += 1
            return {"commit": {"sha": "c" * 40 if self.advanced and self.branch_reads > 1 else SHA}}
        if "/actions/workflows/" in url:
            return {"workflow_runs": [self.run]}
        return self.release

    def check(self):
        with redirect_stdout(io.StringIO()):
            self.poller.check()

    def test_success_downloads_verified_release_and_invokes_exact_sha(self):
        self.check()
        self.assertEqual(self.download.call_count, 4)
        args = self.process.call_args.args[0]
        self.assertEqual(args[:3], ["/usr/bin/python3", "/usr/local/lib/sporthub-cd/cd.py", SHA])
        self.assertTrue(Path(args[3]).is_relative_to(self.root / "cd-incoming"))
        self.assertFalse(Path(args[3]).exists())
        self.assertFalse((self.root / "cd-blocked.json").exists())

    def test_pending_or_failed_main_ci_never_deploys(self):
        for conclusion in (None, "failure", "cancelled"):
            self.run["conclusion"] = conclusion
            self.check()
        self.download.assert_not_called()
        self.process.assert_not_called()

    def test_pull_request_run_cannot_authorize_deployment(self):
        self.run["event"] = "pull_request"
        self.check()
        self.process.assert_not_called()

    def test_manual_release_cannot_authorize_deployment(self):
        self.release["author"]["login"] = "another-user"
        with self.assertRaises(RuntimeError):
            self.check()
        self.download.assert_not_called()
        self.process.assert_not_called()

    def test_main_advanced_during_download_does_not_deploy_old_commit(self):
        self.advanced = True
        self.check()
        self.process.assert_not_called()

    def test_deploy_failure_blocks_even_a_newer_main_until_inspection(self):
        self.process.return_value = SimpleNamespace(returncode=1)
        with self.assertRaises(RuntimeError):
            self.check()
        self.assertEqual(json.loads((self.root / "cd-blocked.json").read_text())["revision"], SHA)
        self.fetch.reset_mock()
        self.process.reset_mock()
        self.check()
        self.fetch.assert_not_called()
        self.process.assert_not_called()

    def test_current_revision_uses_only_one_api_request(self):
        (self.root / "app").mkdir()
        (self.root / "app/.sporthub-release").write_text(SHA + "\n")
        self.check()
        self.assertEqual(self.fetch.call_count, 1)
        self.process.assert_not_called()

    def test_interrupted_deployer_leaves_a_persistent_block(self):
        self.process.side_effect = OSError("interrupted")
        with self.assertRaises(OSError):
            self.check()
        self.assertEqual(json.loads((self.root / "cd-blocked.json").read_text())["reason"], "deployment_in_progress")


class DownloadTests(unittest.TestCase):
    def test_download_requires_github_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            asset = {"name": "REVISION", "digest": None}
            with self.assertRaises(RuntimeError):
                poll.download_asset(asset, Path(tmp) / "REVISION")

    def test_corrupt_download_is_rejected(self):
        asset = {"name": "REVISION", "digest": "sha256:" + hashlib.sha256(b"good").hexdigest(),
                 "size": 4, "browser_download_url": f"https://github.com/{poll.REPO}/releases/download/aws-test/REVISION"}
        with tempfile.TemporaryDirectory() as tmp, patch.object(poll, "urlopen", return_value=io.BytesIO(b"evil")):
            with self.assertRaises(RuntimeError):
                poll.download_asset(asset, Path(tmp) / "REVISION")


if __name__ == "__main__":
    unittest.main()
