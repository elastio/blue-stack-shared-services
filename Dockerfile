# syntax=docker/dockerfile:1 check=error=true
# Dockerfile for Blue Stack Go Shared Services

# Use a multi-stage build to keep the final image small
# Use the Golang CI image from the elastio/dockerfiles repository
FROM elastio/golang_ci:sha-2dee071 AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN --mount=type=cache,target=$GOPATH/pkg/mod \
    go mod download

COPY . .

# Build optimized binary and compress it with UPX
RUN --mount=type=cache,target=$GOPATH/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -v -o blue-stack-shared-services \
    . \
    && upx --best blue-stack-shared-services

# Use a more complete base image instead of scratch
FROM alpine:latest

ARG VERSION=dev
ENV VERSION=${VERSION}

# Install CA certificates
RUN set -x \
    && apk --no-cache add ca-certificates \
    && adduser -D -u 1000 -g 1000 elastio

# Copy the binary from the builder stage
COPY --from=builder /build/blue-stack-shared-services /

USER elastio

# We need to use the absolute path in alpine image
ENTRYPOINT ["/blue-stack-shared-services"]
