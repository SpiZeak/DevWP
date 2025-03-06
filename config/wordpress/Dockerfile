FROM wordpress:php8.3

RUN a2enmod headers && \
	a2dismod -f deflate && \
	a2dismod -f brotli && \
	a2dismod -f ssl && \
	a2dismod -f http2
