#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
    echo "Migration applies the latest bundled schema only; arguments are not accepted." >&2
    exit 1
fi

if [ -z "${ConnectionStrings__Default:-}" ]; then
    echo "Migration requires ConnectionStrings__Default in the deployment environment." >&2
    exit 1
fi

# The design-time factory reads the connection from the environment, without
# starting API jobs or exposing credentials in command-line arguments.
cd /app
echo "Applying pending SportHub database migrations..."
exec /app/efbundle
