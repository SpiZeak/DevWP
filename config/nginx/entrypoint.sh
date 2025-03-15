#!/bin/sh
set -e

# Fix permissions for bind-mounted volumes
if [ -d /etc/nginx/sites-enabled ]; then
	echo "Fixing permissions for sites-enabled directory"
	chown -R appuser:appuser /etc/nginx/sites-enabled
fi

if [ -d /src/www ]; then
	echo "Fixing permissions for www directory"
	chown -R appuser:appuser /src/www
fi

# Switch to appuser before executing nginx
exec su-exec appuser "$@"
