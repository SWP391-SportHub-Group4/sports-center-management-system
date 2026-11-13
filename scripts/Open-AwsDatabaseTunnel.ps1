# Opens an SSH tunnel to the existing Docker database; changes no server settings.
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9.-]+$')]
    [string]$Server = '18.136.116.60',
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')]
    [string]$SshUser = 'ubuntu',
    [string]$IdentityFile,
    [ValidateRange(1024, 65535)]
    [int]$LocalPort = 15432
)

$ErrorActionPreference = 'Stop'
$ssh = (Get-Command ssh -ErrorAction Stop).Source
$sshOptions = @('-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3')
if ($IdentityFile) {
    $sshOptions += @('-i', (Resolve-Path -LiteralPath $IdentityFile).Path)
}
$destination = "${SshUser}@${Server}"

# The database has no host port. Resolve its current address on the Docker
# network, which is reachable by the SSH server. Do not cache container IPs.
$lookup = @'
set -eu
container_id=$(sudo -n bash /opt/sporthub/app/deploy/aws/compose.sh ps -q postgres)
test -n "$container_id"
sudo -n docker inspect --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$container_id"
'@
$lookup = $lookup.Replace("`r", '')
$output = @(& $ssh @sshOptions $destination $lookup)
if ($LASTEXITCODE -ne 0) {
    throw 'Database lookup failed. Verify SSH access and permission to inspect the deployed Docker service.'
}
$addresses = @($output | ForEach-Object {
    $parsed = $null
    if ([System.Net.IPAddress]::TryParse("$_".Trim(), [ref]$parsed) -and
        $parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
        $parsed.ToString()
    }
})
if ($addresses.Count -ne 1) {
    throw 'Expected one PostgreSQL Docker IPv4 address. Ask the server operator to check its networks.'
}

Write-Host "Database tunnel: 127.0.0.1:$LocalPort. Keep this terminal open; Ctrl+C closes it."
$forward = '127.0.0.1:{0}:{1}:5432' -f $LocalPort, $addresses[0]
& $ssh @sshOptions -N -T -L $forward $destination
if ($LASTEXITCODE -ne 0) { throw 'SSH tunnel stopped with an error.' }
