FROM nginx:alpine AS builder

# For latest build deps, see https://github.com/nginxinc/docker-nginx/blob/master/mainline/alpine/Dockerfile
RUN apk add --no-cache --virtual .build-deps \
	gcc \
	libc-dev \
	make \
	openssl-dev \
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
	git

# Create required directory
RUN mkdir -p /usr/src

# Download sources
RUN wget "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -O nginx.tar.gz && \
	tar -zxC /usr/src -f nginx.tar.gz && \
	cd /usr/src && \
	git clone --recurse-submodules -j$(nproc) https://github.com/google/ngx_brotli.git

# Use a simplified configure approach with hardcoded core options
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
	--add-dynamic-module=../ngx_brotli && \
	make && make install

FROM nginx:alpine

COPY --from=builder /usr/lib/nginx/modules/*.so /usr/lib/nginx/modules/

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

COPY ./dhparam2048.pem /etc/nginx/dhparam2048.pem

CMD ["nginx", "-g", "daemon off;"]
