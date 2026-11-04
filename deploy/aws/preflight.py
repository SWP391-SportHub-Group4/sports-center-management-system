"""Validate resolved Compose settings without printing their secret values."""
import json
import re
import sys
from urllib.parse import urlsplit

config = json.load(sys.stdin)
backend = config['services']['backend']['environment']
postgres = config['services']['postgres']['environment']
caddy = config['services']['caddy']['environment']
errors = []
def require(condition, message):
    if not condition:
        errors.append(message)

require(backend['ASPNETCORE_ENVIRONMENT'] == 'Production', 'Backend must use Production.')
require(len(backend['JwtOptions__SecretKey']) >= 32, 'JWT_SECRET needs at least 32 characters.')
require(bool(re.fullmatch(r'[A-Za-z0-9]{24,}', postgres['POSTGRES_PASSWORD'])),
        'Destination POSTGRES_PASSWORD must be at least 24 random alphanumeric characters.')
for name in ['POSTGRES_USER', 'POSTGRES_DB']:
    require(bool(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', postgres[name])),
            f'{name} must be a simple SQL identifier.')
origin = backend['Frontend__BaseUrl']
parsed = urlsplit(origin)
require(parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.path
        and not parsed.query and not parsed.fragment and not parsed.username,
        'FRONTEND_ORIGIN must be an HTTPS origin without a trailing slash or path.')
require(bool(re.fullmatch(r'(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}', caddy['API_DOMAIN'])),
        'API_DOMAIN must be a DNS hostname without scheme/path.')
require('@' in caddy['ACME_EMAIL'], 'ACME_EMAIL must be an email address.')
require('@' in backend['Email__Brevo__FromAddress'], 'BREVO_FROM_ADDRESS must be a verified sender email.')
require(backend['CLOUDINARY_URL'].startswith('cloudinary://'), 'CLOUDINARY_URL must use cloudinary:// credentials.')
for name in ['VnPay__PaymentUrl', 'VnPay__QueryUrl']:
    require(urlsplit(backend[name]).scheme == 'https', f'{name} must use HTTPS.')
for service in ['backend', 'ai-service']:
    require(not config['services'][service].get('ports'), f'{service} must not publish a host port.')
database = config['services']['postgres']
ports = database.get('ports', [])
if ports:
    require(len(ports) == 1 and ports[0].get('target') == 5432
            and ports[0].get('host_ip') == '0.0.0.0' and ports[0].get('protocol') == 'tcp'
            and str(ports[0].get('published', '')).isdigit()
            and 1024 <= int(ports[0]['published']) <= 65535,
            'Public PostgreSQL requires one explicit IPv4 TCP port targeting 5432.')
    expected = ['postgres']
    for setting in ('ssl=on', 'ssl_cert_file=/run/sporthub-db/server.crt',
                    'ssl_key_file=/run/sporthub-db/server.key',
                    'hba_file=/run/sporthub-db/pg_hba.conf',
                    'ssl_min_protocol_version=TLSv1.2', 'password_encryption=scram-sha-256'):
        expected.extend(['-c', setting])
    require(database.get('command') == expected,
            'Public PostgreSQL must use the TLS-only authentication configuration.')
    require(any(m.get('type') == 'bind' and m.get('source') == '/opt/sporthub/postgres-public'
                and m.get('target') == '/run/sporthub-db' and m.get('read_only') is True
                for m in database.get('volumes', [])),
            'Public PostgreSQL requires its prepared TLS directory mounted read-only.')
if errors:
    sys.exit('\n'.join(errors))
print('Deployment configuration validated; credentials were not displayed.')
