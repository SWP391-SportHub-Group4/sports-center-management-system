"""Prepare TLS for the existing PostgreSQL service. Does not open a port or restart it."""
import argparse
import ipaddress
import os
from pathlib import Path
import re
import subprocess
import tempfile


HBA = """# Unix socket administration stays inside the existing container.
local all all trust
# Every TCP client, including the API, must negotiate TLS and authenticate.
hostnossl all all 0.0.0.0/0 reject
hostnossl all all ::/0 reject
hostssl all all 0.0.0.0/0 scram-sha-256
hostssl all all ::/0 scram-sha-256
"""


def endpoint_san(endpoint):
    try:
        return 'IP:' + str(ipaddress.ip_address(endpoint))
    except ValueError:
        if not re.fullmatch(r'(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}', endpoint):
            raise ValueError('Use the actual public DNS hostname or IP address, without scheme or port.') from None
        return 'DNS:' + endpoint


def openssl(*args):
    return subprocess.check_output(['openssl', *map(str, args)], stderr=subprocess.DEVNULL)


def prepare(endpoint, destination, authority, uid, gid, renew=False):
    san = endpoint_san(endpoint)
    authority.mkdir(mode=0o700, parents=True, exist_ok=True)
    authority.chmod(0o700)
    ca_key, ca_cert = authority / 'ca.key', authority / 'ca.crt'
    key, cert = destination / 'server.key', destination / 'server.crt'
    if ca_key.exists() != ca_cert.exists():
        raise RuntimeError('Incomplete CA material. Inspect the existing CA; never replace it silently.')
    if (key.exists() or cert.exists()) and not ca_key.exists():
        raise RuntimeError('Existing server material has no CA. Recover the original CA before renewing.')
    if not renew and (key.exists() or cert.exists()):
        raise RuntimeError('Server TLS material already exists. Use --renew to reissue with the same CA.')
    if not ca_key.exists():
        openssl('req', '-x509', '-newkey', 'rsa:3072', '-noenc', '-days', '3650',
                '-keyout', ca_key, '-out', ca_cert, '-subj', '/CN=SportHub Database CA',
                '-addext', 'basicConstraints=critical,CA:TRUE',
                '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
    ca_key.chmod(0o600)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.postgres-tls-', dir=destination.parent) as temporary:
        work = Path(temporary)
        openssl('req', '-new', '-newkey', 'rsa:3072', '-noenc', '-keyout', work / 'server.key',
                '-out', work / 'server.csr', '-subj', '/CN=SportHub PostgreSQL')
        (work / 'extensions').write_text(
            'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n'
            'extendedKeyUsage=serverAuth\nsubjectAltName=' + san + '\n')
        openssl('x509', '-req', '-in', work / 'server.csr', '-CA', ca_cert, '-CAkey', ca_key,
                '-CAserial', authority / 'ca.srl', '-CAcreateserial', '-days', '365',
                '-extfile', work / 'extensions', '-out', work / 'server.crt')
        openssl('verify', '-CAfile', ca_cert, work / 'server.crt')
        (work / 'pg_hba.conf').write_text(HBA)
        (work / 'ca.crt').write_bytes(ca_cert.read_bytes())
        destination.mkdir(mode=0o700, exist_ok=True)
        destination.chmod(0o700)
        os.chown(destination, uid, gid)
        for name in ('server.key', 'server.crt', 'pg_hba.conf', 'ca.crt'):
            path = work / name
            path.chmod(0o600 if name == 'server.key' else 0o644)
            os.chown(path, uid, gid)
            os.replace(path, destination / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--renew', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run on the AWS host with sudo.')
    os.umask(0o077)
    environment = {k: v for k, v in os.environ.items()
                   if not k.startswith('COMPOSE_') and k not in
                   ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')}
    environment['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    compose = ['bash', '/opt/sporthub/app/deploy/aws/compose.sh']
    try:
        endpoint_san(args.endpoint)
        subprocess.run(['openssl', 'version'], check=True, stdout=subprocess.DEVNULL)
        # Non-SCRAM passwords cannot authenticate once TLS-only SCRAM is enabled.
        subprocess.run([*compose, 'exec', '-T', 'postgres', 'sh', '-ec',
                        '''psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT rolpassword LIKE 'SCRAM-SHA-256%' FROM pg_authid WHERE rolname=current_user" | grep -qx t'''],
                       env=environment, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        uid = int(subprocess.check_output([*compose, 'exec', '-T', 'postgres', 'id', '-u', 'postgres'], env=environment))
        gid = int(subprocess.check_output([*compose, 'exec', '-T', 'postgres', 'id', '-g', 'postgres'], env=environment))
        prepare(args.endpoint, Path('/opt/sporthub/postgres-public'),
                Path('/opt/sporthub/postgres-public-ca'), uid, gid, args.renew)
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        if isinstance(error, (RuntimeError, ValueError)):
            print(str(error))
        else:
            print('TLS preparation failed. Verify PostgreSQL access, SCRAM password storage, and OpenSSL.')
        return 1
    print('TLS material prepared. PostgreSQL, firewall, and deployment settings have not been changed.')
    print('Distribute only /opt/sporthub/postgres-public/ca.crt to team clients.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
