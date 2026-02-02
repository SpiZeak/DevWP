FROM dunglas/frankenphp:latest

WORKDIR /src/www

# Add arguments for user and group IDs
ARG USER_ID=1000
ARG GROUP_ID=1000

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user with same ID as host user
RUN groupadd -g ${GROUP_ID} appuser && \
    useradd -u ${USER_ID} -g appuser -m -s /bin/bash appuser

# Install PHP extensions via mlocati installer
ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions && \
    install-php-extensions \
    bcmath \
    exif \
    gd \
    imagick \
    intl \
    mbstring \
    mysqli \
    opcache \
    pdo_mysql \
    redis \
    soap \
    sodium \
    xml \
    zip \
    xdebug

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI
RUN curl -sS https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    -o /usr/local/bin/wp && \
    chmod +x /usr/local/bin/wp

