#!/bin/sh
set -e

chown -R 1000:1000 /src/www
chown 1000:1000 /usr/bin/docker-entrypoint.sh
chmod +x /usr/bin/docker-entrypoint.sh

# Execute the original entrypoint script with passed arguments
exec /usr/bin/docker-entrypoint.sh "$@"
