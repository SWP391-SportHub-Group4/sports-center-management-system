"""Import trusted runtime backup into an empty destination volume only."""
import os
from pathlib import Path, PurePosixPath
import sys
import tarfile

root = Path('/data')
if any(root.iterdir()):
    sys.exit('Destination runtime volume must be empty. Existing files were not changed.')

# Stage the archive before extracting: reject traversal, symlinks and devices.
# SpooledTemporaryFile avoids keeping a large reports archive entirely in RAM.
import tempfile
with tempfile.TemporaryFile() as spool:
    import shutil
    shutil.copyfileobj(sys.stdin.buffer, spool)
    spool.seek(0)
    with tarfile.open(fileobj=spool) as archive:
        members = archive.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if (path.is_absolute() or '..' in path.parts or not path.parts
                    or path.parts[0] not in {'dataprotection-keys', 'reports'}
                    or not (member.isfile() or member.isdir())):
                sys.exit('Unsafe or unexpected runtime archive entry; nothing extracted.')
        if not any(m.isfile() and PurePosixPath(m.name).parts[0] == 'dataprotection-keys'
                   and m.name.endswith('.xml') for m in members):
            sys.exit('Runtime archive has no Data Protection XML keys.')
        archive.extractall(root, members=members, filter='data')
for directory, folders, files in os.walk(root):
    os.chown(directory, 1654, 1654)
    os.chmod(directory, 0o700)
    for filename in files:
        path = Path(directory, filename)
        os.chown(path, 1654, 1654)
        os.chmod(path, 0o600)
print('Runtime files restored; key contents were not displayed.')
