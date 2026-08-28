#!/bin/sh
set -eu

[ "${CI:-}" = "true" ] && exit 0
git config core.hooksPath .githooks
