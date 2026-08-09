#!/bin/sh
# goWMS container entrypoint.
#
# Named volumes are initialized root-owned by Docker (an empty dir's ownership
# is not preserved by the copy-up). We must fix /app/uploads before the app
# (which runs as the unprivileged `gowms` user) can write files there.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads
  chown -R gowms:gowms /app/uploads
  # Drop privileges and exec the server as the gowms user.
  exec su-exec gowms:gowms "$@"
fi

exec "$@"
