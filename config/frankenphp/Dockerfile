# FrankenPHP replaces the previous devwp_php (php-fpm) + devwp_nginx
# containers with a single Caddy-based server that embeds the PHP interpreter.
#
# Pinned base tag: 1.13.1 was the latest stable FrankenPHP release at
# 2026-10-20 (check https://hub.docker.com/r/dunglas/frankenphp/tags when
# bumping). Debian bookworm, not Alpine: musl builds lack GLOB_BRACE and are
# slower under ZTS — see https://frankenphp.dev/docs/performance/
ARG FRANKENPHP_IMAGE=dunglas/frankenphp:1.13.1-php8.5-bookworm

FROM ${FRANKENPHP_IMAGE}

# Same UID/GID mapping as the previous php/nginx images, so bind-mounted
# files in ~/www keep their host owner.
ARG USER_ID=1000
ARG GROUP_ID=1000

# curl: healthcheck + admin API calls (worker restarts) from inside the
# container. msmtp: sendmail for mail() (php.ini points at it; the Debian
# image has no sendmail binary). git + openssh-client: composer source
# installs and git@ remotes.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        msmtp \
        openssh-client && \
    rm -rf /var/lib/apt/lists/*

# PHP extension set of the old php-fpm image (gd with webp, intl, soap,
# bcmath, sodium, exif, zip, redis, imagick, xdebug) plus composer.
# install-php-extensions ships with the base image; it has no @wp-cli
# special package, so WP-CLI is installed from its phar below.
# imagick's OpenMP threads crash FrankenPHP — see MAGICK_THREAD_LIMIT below.
RUN install-php-extensions \
        mysqli \
        pdo_mysql \
        gd \
        exif \
        zip \
        intl \
        mbstring \
        xml \
        soap \
        bcmath \
        sodium \
        opcache \
        redis \
        imagick \
        xdebug \
        @composer

# WP-CLI, at the path DevWP execs (/usr/local/bin/wp).
RUN curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
        -o /usr/local/bin/wp && \
    chmod 0755 /usr/local/bin/wp

# Non-root user matching the host UID/GID, permission to bind 80/443, and
# writable runtime dirs. /data and /config are mounted as tmpfs by compose
# (they exist as image dirs for the no-tmpfs case); the global Caddyfile
# moves Caddy storage to /tmp/caddy so nothing writes to /data or /config.
RUN groupadd -g ${GROUP_ID} appuser && \
    useradd -u ${USER_ID} -g appuser -m -s /bin/bash appuser && \
    setcap 'cap_net_bind_service=+eip' /usr/local/bin/frankenphp && \
    mkdir -p /data/caddy /config/caddy \
        /etc/frankenphp/Caddyfile.d /etc/frankenphp/workers \
        /usr/local/etc/php/cli-extra /tmp/opcache && \
    chown -R appuser:appuser \
        /data /config /etc/frankenphp /usr/local/etc/php/cli-extra \
        /tmp/opcache /home/appuser

# https://frankenphp.dev/docs/known-issues/ — ImageMagick's OpenMP threads
# conflict with FrankenPHP's threads and crash the process.
ENV MAGICK_THREAD_LIMIT=1

COPY php.ini /usr/local/etc/php/php.ini
COPY conf.d/opcache.ini /usr/local/etc/php/conf.d/zz-devwp-opcache.ini
COPY conf.d/xdebug.ini /usr/local/etc/php/conf.d/zz-devwp-xdebug.ini
COPY cli-extra/wp-cli.ini /usr/local/etc/php/cli-extra/wp-cli.ini

# Documented FrankenPHP workaround (known-issues.md, "Composer scripts
# referencing @php"): `frankenphp php-cli` rejects the -d flag, so the shim
# strips -d pairs; their values travel via the cli-extra ini scan dir
# instead. WP-CLI/composer invocations from DevWP then work unchanged.
COPY php-shim.sh /usr/local/bin/php
RUN chmod 0755 /usr/local/bin/php

USER appuser
WORKDIR /src/www
