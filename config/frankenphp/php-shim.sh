#!/usr/bin/env bash
# /usr/local/bin/php — documented FrankenPHP workaround
# (https://frankenphp.dev/docs/known-issues/#composer-scripts-referencing-php).
#
# `frankenphp php-cli` does not support the -d flag, so -d pairs are stripped
# and their values must come from ini files instead: PHP_INI_SCAN_DIR gets a
# leading colon (keeping the default scan dir) plus cli-extra/, which carries
# the WP-CLI error_reporting value that DevWP used to pass via -d.
args=()
skip_next=0
for arg in "$@"; do
    if [[ "$skip_next" == 1 ]]; then
        skip_next=0
    elif [[ "$arg" == "-d" ]]; then
        skip_next=1
    elif [[ "$arg" == -d* ]]; then
        :
    else
        args+=("$arg")
    fi
done
export PHP_INI_SCAN_DIR=":/usr/local/etc/php/cli-extra"
exec /usr/local/bin/frankenphp php-cli "${args[@]}"
