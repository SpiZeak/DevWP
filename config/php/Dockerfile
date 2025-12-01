FROM php:fpm-alpine

WORKDIR /src/www

# Add arguments for user and group IDs
ARG USER_ID=1000
ARG GROUP_ID=1000

RUN apk update && \
    apk add --no-cache \
    linux-headers \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev \
    libavif-dev \
    freetype-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    libxml2-dev \
    libsodium-dev \
    imagemagick-dev \
    imagemagick \
    shadow \
    git \
    $PHPIZE_DEPS

# Create a non-root user with same ID as host user
RUN addgroup -g ${GROUP_ID} appuser && \
    adduser -u ${USER_ID} -G appuser -s /bin/sh -D appuser

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp --with-avif && \
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
    docker-php-ext-enable xdebug

# Install Redis
RUN pecl install redis && \
    docker-php-ext-enable redis

# Install Imagick
RUN pecl install imagick && \
    docker-php-ext-enable imagick

# Use the default production configuration
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

# Fix permissions for FPM directories
RUN mkdir -p /var/www/html && \
    chown -R appuser:appuser /var/www/html && \
    chown -R appuser:appuser /home/appuser && \
    chown -R appuser:appuser $PHP_INI_DIR

# Update PHP-FPM configuration to run as appuser
RUN sed -i "s/user = www-data/user = appuser/g" /usr/local/etc/php-fpm.d/www.conf && \
    sed -i "s/group = www-data/group = appuser/g" /usr/local/etc/php-fpm.d/www.conf

# Switch to the non-root user
USER appuser

CMD ["php-fpm"]
