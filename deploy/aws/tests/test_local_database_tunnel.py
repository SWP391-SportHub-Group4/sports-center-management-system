"""Exercise the PowerShell tunnel with a fake SSH executable; no AWS access."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

PWSH = os.environ.get("SPORTHUB_PWSH") or shutil.which("pwsh")
SCRIPT = Path(__file__).resolve().parents[3] / "scripts/Open-AwsDatabaseTunnel.ps1"


@unittest.skipUnless(PWSH and os.name != "nt", "PowerShell and a POSIX fake SSH executable are required")
class LocalDatabaseTunnelTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.log = self.root / "ssh.jsonl"
        fake = self.root / "ssh"
        fake.write_text(f"#!{sys.executable}\n" + '''
import json, os, sys
with open(os.environ["TUNNEL_TEST_LOG"], "a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
if "-N" not in sys.argv:
    if os.environ.get("TUNNEL_TEST_FAILURE"):
        sys.exit(255)
    print(os.environ.get("TUNNEL_TEST_ADDRESSES", "172.18.0.2"))
''')
        fake.chmod(0o755)
        self.environment = os.environ | {
            "PATH": str(self.root) + os.pathsep + os.environ["PATH"],
            "TUNNEL_TEST_LOG": str(self.log),
        }

    def run_script(self, *args, script=SCRIPT):
        return subprocess.run([PWSH, "-NoLogo", "-NoProfile", "-File", str(script), *args],
                              env=self.environment, capture_output=True, text=True, timeout=20)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_resolves_current_container_and_binds_only_local_loopback(self):
        key = self.root / "key with spaces.pem"
        key.touch()
        result = self.run_script("-IdentityFile", str(key), "-LocalPort", "15433")
        self.assertEqual(result.returncode, 0, result.stderr)
        lookup, tunnel = self.calls()
        self.assertIn("compose.sh ps -q postgres", lookup[-1])
        self.assertIn("docker inspect", lookup[-1])
        self.assertIn(str(key), lookup)
        self.assertEqual(tunnel[tunnel.index("-L") + 1], "127.0.0.1:15433:172.18.0.2:5432")
        self.assertIn("ExitOnForwardFailure=yes", tunnel)
        self.assertIn("ubuntu@18.136.116.60", tunnel)

    def test_failed_ssh_lookup_never_opens_forward(self):
        self.environment["TUNNEL_TEST_FAILURE"] = "1"
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.calls()), 1)

    def test_ambiguous_or_invalid_container_addresses_never_open_forward(self):
        for addresses in ("172.18.0.2\n172.19.0.2", "not-an-ip"):
            with self.subTest(addresses=addresses):
                self.log.unlink(missing_ok=True)
                self.environment["TUNNEL_TEST_ADDRESSES"] = addresses
                result = self.run_script()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.calls()), 1)

    def test_windows_line_endings_are_not_sent_to_remote_linux_shell(self):
        windows_script = self.root / "tunnel.ps1"
        windows_script.write_bytes(SCRIPT.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        result = self.run_script(script=windows_script)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("\r", self.calls()[0][-1])


if __name__ == "__main__":
    unittest.main()
