"""Validate public DB profiles and real TLS material without accessing AWS."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

AWS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_db', AWS / 'prepare-public-db.py')
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)


def resolved(profile):
    environment = os.environ | {
        'POSTGRES_ACCESS': profile, 'POSTGRES_PUBLIC_PORT': '15432',
        'POSTGRES_DB': 'sporthub', 'POSTGRES_USER': 'sporthub', 'POSTGRES_PASSWORD': 'a' * 32,
        'JWT_SECRET': 'b' * 64, 'FRONTEND_ORIGIN': 'https://frontend.example.com',
        'BREVO_API_KEY': 'test-key', 'BREVO_FROM_ADDRESS': 'sender@example.com',
        'VNPAY_TMN_CODE': 'test', 'VNPAY_HASH_SECRET': 'test-secret',
        'CLOUDINARY_URL': 'cloudinary://test:test@example', 'GEMINI_API_KEY': 'test-key',
        'API_DOMAIN': 'api.example.com', 'ACME_EMAIL': 'operator@example.com',
    }
    for key in list(environment):
        if key.startswith('COMPOSE_'):
            environment.pop(key)
    return json.loads(subprocess.check_output(
        ['docker', 'compose', '--env-file', os.devnull, '-f', str(AWS / 'compose.yml'),
         'config', '--format', 'json'], env=environment, stderr=subprocess.PIPE))


@unittest.skipUnless(shutil.which('docker'), 'Docker Compose is required to resolve deployment profiles')
class PublicDatabaseProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private = resolved('private')
        cls.public = resolved('public')

    def preflight(self, config):
        return subprocess.run([sys.executable, str(AWS / 'preflight.py')], input=json.dumps(config),
                              text=True, capture_output=True)

    def test_private_profile_keeps_original_database_and_no_public_ports(self):
        self.assertFalse(self.private['services']['postgres'].get('ports'))
        self.assertEqual(self.preflight(self.private).returncode, 0)
        for field in ('image', 'environment'):
            self.assertEqual(self.private['services']['postgres'][field], self.public['services']['postgres'][field])
        self.assertEqual(self.private['volumes']['postgres_data'], self.public['volumes']['postgres_data'])
        self.assertTrue(all(m in self.public['services']['postgres']['volumes']
                            for m in self.private['services']['postgres']['volumes']))

    def test_public_profile_resolves_a_single_tls_port_and_private_read_only_mount(self):
        postgres = self.public['services']['postgres']
        self.assertEqual(len(postgres['ports']), 1)
        self.assertEqual(postgres['ports'][0]['published'], '15432')
        self.assertEqual(postgres['ports'][0]['target'], 5432)
        self.assertEqual(postgres['ports'][0]['host_ip'], '0.0.0.0')
        self.assertEqual(self.preflight(self.public).returncode, 0)

    def test_public_preflight_rejects_tls_downgrade_missing_mount_or_extra_ports(self):
        for change in (
            lambda p: p.update(command=['postgres', '-c', 'ssl=off']),
            lambda p: p.update(volumes=[]),
            lambda p: next(m for m in p['volumes'] if m['target'] == '/run/sporthub-db').update(read_only=False),
            lambda p: p['ports'].append(dict(p['ports'][0])),
            lambda p: p['ports'][0].update(target=5433),
        ):
            with self.subTest(change=change):
                config = copy.deepcopy(self.public)
                change(config['services']['postgres'])
                self.assertNotEqual(self.preflight(config).returncode, 0)


@unittest.skipUnless(shutil.which('openssl') and os.name != 'nt', 'OpenSSL and POSIX file permissions are required')
class PublicDatabaseCertificateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.destination = self.root / 'mounted'
        self.authority = self.root / 'private-ca'

    def prepare(self, endpoint='db.example.com', renew=False):
        tls.prepare(endpoint, self.destination, self.authority, os.getuid(), os.getgid(), renew)

    def test_certificate_verifies_correct_hostname_and_rejects_another_hostname(self):
        self.prepare()
        tls.openssl('verify', '-CAfile', self.destination / 'ca.crt', '-verify_hostname',
                    'db.example.com', self.destination / 'server.crt')
        with self.assertRaises(subprocess.CalledProcessError):
            tls.openssl('verify', '-CAfile', self.destination / 'ca.crt', '-verify_hostname',
                        'another.example.com', self.destination / 'server.crt')
        self.assertEqual((self.destination / 'server.key').stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.destination / 'ca.key').exists())
        self.assertEqual((self.authority / 'ca.key').stat().st_mode & 0o777, 0o600)

    def test_ip_endpoint_uses_ip_subject_alternative_name(self):
        self.prepare('127.0.0.1')
        tls.openssl('verify', '-CAfile', self.destination / 'ca.crt', '-verify_ip',
                    '127.0.0.1', self.destination / 'server.crt')

    def test_reissue_preserves_client_ca_and_requires_explicit_renewal(self):
        self.prepare()
        ca, key = (self.destination / 'ca.crt').read_bytes(), (self.authority / 'ca.key').read_bytes()
        cert = (self.destination / 'server.crt').read_bytes()
        with self.assertRaises(RuntimeError):
            self.prepare()
        self.prepare(renew=True)
        self.assertEqual(ca, (self.destination / 'ca.crt').read_bytes())
        self.assertEqual(key, (self.authority / 'ca.key').read_bytes())
        self.assertNotEqual(cert, (self.destination / 'server.crt').read_bytes())

    def test_missing_original_ca_does_not_silently_replace_it(self):
        self.destination.mkdir()
        (self.destination / 'server.key').write_text('existing-server-key')
        with self.assertRaises(RuntimeError):
            self.prepare(renew=True)
        self.assertFalse((self.authority / 'ca.key').exists())

    def test_invalid_endpoint_is_rejected_before_creating_files(self):
        for endpoint in ('https://db.example.com', 'db.example.com:15432', 'db;touch /tmp/unsafe', ''):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                self.prepare(endpoint)
        self.assertFalse(self.authority.exists())


if __name__ == '__main__':
    unittest.main()
