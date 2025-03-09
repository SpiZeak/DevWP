#!/bin/bash

# Create directories and config files for each domain
IFS=',' read -ra DOMAINS_ARRAY <<<"$DOMAINS"
for domain in "${DOMAINS_ARRAY[@]}"; do
	# Trim whitespace
	domain=$(echo "$domain" | xargs)

	# Create site directory if it doesn't exist
	echo "Creating directory for $domain"
	mkdir -p /src/www/$domain

	# Generate example files if directory is empty
	if [ ! "$(ls -A /src/www/$domain)" ]; then
		echo "<?php phpinfo();" >/src/www/$domain/phpinfo.php
		echo "<?php echo '<h1>Hello World from $domain</h1>';" >/src/www/$domain/index.php
	fi

	# Generate nginx config
	echo "Creating nginx config for $domain"
	cat >/etc/nginx/sites-enabled/$domain.conf <<EOF
server {
    listen 443 quic;
    listen 443 ssl;

    server_name $domain;
    root /src/www/$domain;

    ssl_certificate /certs/cert.pem;
    ssl_certificate_key /certs/key.pem;
    ssl_trusted_certificate /certs/ca.pem;

    include global/restrictions.conf;

    # Additional rules go here.

    # Only include one of the files below.
    include global/wordpress.conf;
    # include global/wordpress-ms-subdir.conf;
    # include global/wordpress-ms-subdomain.conf;
}
EOF
done

# Remove the default configuration if present
if [ -f "/etc/nginx/sites-enabled/default.conf" ]; then
	rm /etc/nginx/sites-enabled/default.conf
fi

echo "Configuration files generated for ${DOMAINS_ARRAY[@]}"
