FROM php:8.4-fpm-alpine

RUN apk update && \
    apk add --no-cache \
    linux-headers \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev \
    freetype-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    libxml2-dev \
    libsodium-dev \
    $PHPIZE_DEPS

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp && \
    docker-php-ext-install -j$(nproc) \
    mysqli \
    pdo_mysql \
    gd \
    opcache \
    exif \
    zip \
    intl \
    mbstring \
    xml \
    soap \
    bcmath \
    sodium

# Install Xdebug
RUN pecl install xdebug && \
    docker-php-ext-enable xdebug && \
    { \
    echo 'xdebug.mode=develop,debug'; \
    echo 'xdebug.client_host=172.17.0.1'; \
    echo 'xdebug.start_with_request=yes'; \
    } > /usr/local/etc/php/conf.d/xdebug.ini

# Configure opcache
RUN { \
    echo 'opcache.memory_consumption=128'; \
    echo 'opcache.interned_strings_buffer=8'; \
    echo 'opcache.max_accelerated_files=4000'; \
    echo 'opcache.revalidate_freq=2'; \
    echo 'opcache.fast_shutdown=1'; \
    echo 'opcache.enable_cli=1'; \
    } > /usr/local/etc/php/conf.d/opcache-recommended.ini

# Install Redis
RUN pecl install redis && \
    docker-php-ext-enable redis

# Set recommended PHP settings
RUN { \
    echo 'upload_max_filesize = 64M'; \
    echo 'post_max_size = 64M'; \
    echo 'memory_limit = 256M'; \
    } > /usr/local/etc/php/conf.d/wordpress.ini

# Use the default production configuration
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
