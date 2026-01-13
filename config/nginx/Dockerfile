FROM nginx:mainline-alpine AS builder

# For latest build deps, see https://github.com/nginxinc/docker-nginx/blob/master/mainline/alpine/Dockerfile
RUN apk add --no-cache --virtual .build-deps \
	gcc \
	libc-dev \
	make \
	pcre2-dev \
	zlib-dev \
	linux-headers \
	libxslt-dev \
	gd-dev \
	geoip-dev \
	libedit-dev \
	bash \
	alpine-sdk \
	findutils \
	curl \
	git \
	cmake

# Create required directory
RUN mkdir -p /usr/src

# Download and compile LibreSSL 4.2.1 from Swedish FTP mirror
RUN cd /usr/src && \
	curl -sSL https://cdn.openbsd.org/pub/OpenBSD/LibreSSL/libressl-4.2.1.tar.gz -o libressl-4.2.1.tar.gz && \
	tar -zxf libressl-4.2.1.tar.gz && \
	cd libressl-4.2.1 && \
	mkdir build && \
	cd build && \
	cmake .. \
	-DCMAKE_INSTALL_PREFIX=/usr/local/libressl-4.2.1 \
	-DCMAKE_BUILD_TYPE=Release && \
	make -j$(nproc) && \
	make install

# Download sources
RUN wget "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -O nginx.tar.gz && \
	tar -zxC /usr/src -f nginx.tar.gz && \
	cd /usr/src && \
	git clone --recurse-submodules -j$(nproc) https://github.com/google/ngx_brotli.git

# Use a simplified configure approach with hardcoded core options and LibreSSL
RUN cd /usr/src/nginx-$NGINX_VERSION && \
	./configure \
	--prefix=/etc/nginx \
	--sbin-path=/usr/sbin/nginx \
	--modules-path=/usr/lib/nginx/modules \
	--conf-path=/etc/nginx/nginx.conf \
	--error-log-path=/var/log/nginx/error.log \
	--http-log-path=/var/log/nginx/access.log \
	--pid-path=/var/run/nginx.pid \
	--lock-path=/var/run/nginx.lock \
	--with-threads \
	--with-http_ssl_module \
	--with-http_v2_module \
	--with-http_v3_module \
	--with-http_realip_module \
	--with-http_addition_module \
	--with-http_sub_module \
	--with-http_gunzip_module \
	--with-http_gzip_static_module \
	--with-compat \
	--add-dynamic-module=../ngx_brotli \
	--with-openssl=/usr/src/libressl-4.2.1 \
	--with-openssl-opt=enable-tls1_3 && \
	make && make install

FROM nginx:alpine

# Add arguments for user and group IDs
ARG USER_ID=1000
ARG GROUP_ID=1000

# Install su-exec for user switching in entrypoint
RUN apk add --no-cache su-exec

# Use Alpine-native commands for user creation
RUN addgroup -g ${GROUP_ID} -S appuser && \
	adduser -u ${USER_ID} -S -G appuser -s /bin/sh appuser

# Copy modules and LibreSSL from builder
COPY --from=builder /usr/lib/nginx/modules/*.so /usr/lib/nginx/modules/
COPY --from=builder /usr/local/libressl-4.2.1 /usr/local/libressl-4.2.1
COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx

# Set up environment for LibreSSL
ENV LD_LIBRARY_PATH=/usr/local/libressl-4.2.1/lib:$LD_LIBRARY_PATH
ENV PATH=/usr/local/libressl-4.2.1/bin:$PATH

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

COPY ./dhparam2048.pem /etc/nginx/dhparam2048.pem

# Create all required directories with proper permissions
RUN mkdir -p /var/cache/nginx/client_temp && \
	mkdir -p /var/cache/nginx/proxy_temp && \
	mkdir -p /var/cache/nginx/fastcgi_temp && \
	mkdir -p /var/cache/nginx/uwsgi_temp && \
	mkdir -p /var/cache/nginx/scgi_temp && \
	chmod 755 /var/cache && \
	mkdir -p /etc/nginx/client_body_temp && \
	chmod 777 /etc/nginx/client_body_temp && \
	mkdir -p /etc/nginx/proxy_temp && \
	chmod 777 /etc/nginx/proxy_temp && \
	mkdir -p /etc/nginx/fastcgi_temp && \
	chmod 777 /etc/nginx/fastcgi_temp && \
	mkdir -p /etc/nginx/uwsgi_temp && \
	chmod 777 /etc/nginx/uwsgi_temp && \
	mkdir -p /etc/nginx/scgi_temp && \
	chmod 777 /etc/nginx/scgi_temp && \
	chmod -R 770 /var/cache/nginx && \
	chown -R appuser:appuser /var/cache/nginx && \
	touch /var/run/nginx.pid && \
	chown appuser:appuser /var/run/nginx.pid && \
	# Ensure log directory exists with correct permissions
	mkdir -p /var/log/nginx && \
	chown -R appuser:appuser /var/log/nginx

USER appuser

CMD ["nginx", "-g", "daemon off;"]
