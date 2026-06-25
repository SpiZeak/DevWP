FROM nginx:alpine-slim AS builder

ARG LIBRESSL_VERSION=4.3.2

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

WORKDIR /usr/src

RUN curl -sSL "https://cdn.openbsd.org/pub/OpenBSD/LibreSSL/libressl-${LIBRESSL_VERSION}.tar.gz" \
	-o libressl-${LIBRESSL_VERSION}.tar.gz && \
	tar -zxf libressl-${LIBRESSL_VERSION}.tar.gz && \
	rm libressl-${LIBRESSL_VERSION}.tar.gz && \
	cmake -S libressl-${LIBRESSL_VERSION} -B libressl-${LIBRESSL_VERSION}/build \
	-DCMAKE_INSTALL_PREFIX=/usr/local/libressl-${LIBRESSL_VERSION} \
	-DCMAKE_BUILD_TYPE=Release && \
	cmake --build libressl-${LIBRESSL_VERSION}/build -j"$(nproc)" && \
	cmake --install libressl-${LIBRESSL_VERSION}/build

RUN curl -sSL "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o nginx.tar.gz && \
	tar -zxf nginx.tar.gz && \
	rm nginx.tar.gz

RUN cd nginx-${NGINX_VERSION} && \
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
	--with-http_gzip_static_module \
	--with-compat \
	--with-openssl=/usr/src/libressl-${LIBRESSL_VERSION} \
	--with-openssl-opt=enable-tls1_3 && \
	make -j"$(nproc)" && \
	make install

FROM nginx:stable-alpine-slim

ARG LIBRESSL_VERSION=4.3.2
ARG USER_ID=1000
ARG GROUP_ID=1000

RUN apk add --no-cache su-exec && \
	addgroup -g ${GROUP_ID} -S appuser && \
	adduser -u ${USER_ID} -S -G appuser -s /bin/sh appuser

COPY --from=builder /usr/local/libressl-${LIBRESSL_VERSION} /usr/local/libressl-${LIBRESSL_VERSION}
COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx

ENV LD_LIBRARY_PATH=/usr/local/libressl-${LIBRESSL_VERSION}/lib \
	PATH=/usr/local/libressl-${LIBRESSL_VERSION}/bin:$PATH

COPY nginx.conf /etc/nginx/nginx.conf
COPY ./dhparam2048.pem /etc/nginx/dhparam2048.pem

RUN rm /etc/nginx/conf.d/default.conf && \
	mkdir -p \
	/var/cache/nginx/client_temp \
	/var/cache/nginx/proxy_temp \
	/var/cache/nginx/fastcgi_temp \
	/var/cache/nginx/uwsgi_temp \
	/var/cache/nginx/scgi_temp \
	/etc/nginx/client_body_temp \
	/etc/nginx/proxy_temp \
	/etc/nginx/fastcgi_temp \
	/etc/nginx/uwsgi_temp \
	/etc/nginx/scgi_temp \
	/var/log/nginx && \
	chmod 755 /var/cache && \
	chmod 777 \
	/etc/nginx/client_body_temp \
	/etc/nginx/proxy_temp \
	/etc/nginx/fastcgi_temp \
	/etc/nginx/uwsgi_temp \
	/etc/nginx/scgi_temp && \
	chmod -R 770 /var/cache/nginx && \
	chown -R appuser:appuser /var/cache/nginx /var/log/nginx && \
	touch /var/run/nginx.pid && \
	chown appuser:appuser /var/run/nginx.pid

USER appuser

CMD ["nginx", "-g", "daemon off;"]
