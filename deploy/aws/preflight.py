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
for service in ['postgres', 'backend', 'ai-service']:
    require(not config['services'][service].get('ports'), f'{service} must not publish a host port.')
if errors:
    sys.exit('\n'.join(errors))
print('Deployment configuration validated; credentials were not displayed.')
