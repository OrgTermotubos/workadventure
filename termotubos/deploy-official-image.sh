#!/usr/bin/env bash
# Deploy one official WorkAdventure release onto the app server.
# Images come from thecodingmachine/workadventure-*: the fork is not built.
# The server .env is updated in place. This script never prints it.
#
# Usage:
#   deploy-official-image.sh --check v1.34.5
#   sudo deploy-official-image.sh v1.34.5
#
# --check only confirms that the upstream tag publishes a production Compose file.
# A real run is meant for /opt/workadventure on the app droplet (override with DEPLOY_DIR).

set -euo pipefail

DEFAULT_DIR="/opt/workadventure"
DEPLOY_DIR="${DEPLOY_DIR:-$DEFAULT_DIR}"
UPSTREAM_REPO="workadventure/workadventure"

usage() {
  echo "Usage: deploy-official-image.sh [--check] vX.Y.Z" >&2
  exit 2
}

validate_version() {
  local version="$1"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9]+)*$ ]]; then
    echo "Version must be an official tag such as v1.34.5." >&2
    exit 2
  fi
}

download_compose() {
  local version="$1"
  local dest="$2"
  local url="https://raw.githubusercontent.com/${UPSTREAM_REPO}/${version}/contrib/docker/docker-compose.prod.yaml"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --retry 3 --retry-delay 2 \
      --output "$dest" \
      "$url"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$dest" --timeout=30 --tries=3 "$url"
    return
  fi
  echo "Install curl or wget on the app server before deploying." >&2
  return 1
}

require_official_compose() {
  local file="$1"
  local image
  local -a images=(
    "thecodingmachine/workadventure-play:\${VERSION}"
    "thecodingmachine/workadventure-back:\${VERSION}"
    "thecodingmachine/workadventure-uploader:\${VERSION}"
    "thecodingmachine/workadventure-map-storage:\${VERSION}"
  )

  if [[ ! -s "$file" ]]; then
    echo "The downloaded Compose file is empty." >&2
    exit 1
  fi

  for image in "${images[@]}"; do
    if ! grep -qF "$image" "$file"; then
      echo "The downloaded file is not the official production Compose file (missing ${image})." >&2
      exit 1
    fi
  done
}

current_version() {
  local line
  line="$(grep -E '^[[:space:]]*VERSION=' .env | tail -n 1 || true)"
  line="${line#*=}"
  line="${line//\"/}"
  line="${line//\'/}"
  line="${line//$'\r'/}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  printf '%s' "$line"
}

set_version() {
  local version="$1"
  local tmp
  tmp="$(mktemp "${DEPLOY_DIR}/.env.XXXXXX")"
  awk -v version="$version" '
    BEGIN { found = 0 }
    /^[[:space:]]*VERSION=/ {
      print "VERSION=" version
      found = 1
      next
    }
    { print }
    END {
      if (found == 0) {
        print "VERSION=" version
      }
    }
  ' .env >"$tmp"
  chmod --reference=.env "$tmp"
  chown --reference=.env "$tmp"
  mv "$tmp" .env
}

select_compose() {
  if docker compose version >/dev/null 2>&1; then
    compose=(docker compose)
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    compose=(docker-compose)
    return
  fi
  echo "Docker Compose is not installed on this server." >&2
  exit 1
}

check=0
if [[ "${1:-}" == "--check" ]]; then
  check=1
  shift
fi
if [[ $# -ne 1 ]]; then
  usage
fi

VERSION="$1"
validate_version "$VERSION"

compose_tmp="$(mktemp)"
trap 'rm -f "$compose_tmp"' EXIT
if ! download_compose "$VERSION" "$compose_tmp"; then
  echo "Could not download the production Compose file for ${VERSION} from ${UPSTREAM_REPO}." >&2
  exit 1
fi
require_official_compose "$compose_tmp"

if [[ "$check" -eq 1 ]]; then
  echo "Official production Compose file for ${VERSION} is available."
  exit 0
fi

if [[ ! -d "$DEPLOY_DIR" || ! -f "${DEPLOY_DIR}/.env" || ! -f "${DEPLOY_DIR}/docker-compose.yaml" ]]; then
  echo "Expected ${DEPLOY_DIR}/.env and ${DEPLOY_DIR}/docker-compose.yaml." >&2
  exit 1
fi
if [[ ! -w "${DEPLOY_DIR}/.env" || ! -w "${DEPLOY_DIR}/docker-compose.yaml" ]]; then
  echo "Cannot write ${DEPLOY_DIR}. On the app server run: sudo bash deploy-official-image.sh ${VERSION}" >&2
  exit 1
fi

cd "$DEPLOY_DIR"
exec 9>"${DEPLOY_DIR}/.deploy.lock"
if ! flock -n 9; then
  echo "Another deploy is already running in ${DEPLOY_DIR}." >&2
  exit 1
fi

previous_version="$(current_version)"
echo "Deploying official WorkAdventure ${VERSION}."
echo "Release notes: https://github.com/${UPSTREAM_REPO}/releases/tag/${VERSION}"
if [[ -n "$previous_version" ]]; then
  echo "Current VERSION is ${previous_version}."
fi

select_compose
compose_files=(-f docker-compose.yaml)
if [[ -f docker-compose.override.yml ]]; then
  compose_files+=(-f docker-compose.override.yml)
  echo "Keeping docker-compose.override.yml."
fi
if [[ -f docker-compose.override.yaml ]]; then
  compose_files+=(-f docker-compose.override.yaml)
  echo "Keeping docker-compose.override.yaml."
fi

cp -a docker-compose.yaml docker-compose.yaml.previous
install -m 644 "$compose_tmp" docker-compose.yaml
set_version "$VERSION"

restore_previous() {
  echo "Restoring VERSION and docker-compose.yaml from before this deploy." >&2
  cp -a docker-compose.yaml.previous docker-compose.yaml
  if [[ -n "$previous_version" ]]; then
    set_version "$previous_version"
  fi
}

if ! "${compose[@]}" "${compose_files[@]}" pull; then
  restore_previous
  echo "Image pull failed. The previous Compose file and VERSION are restored. Running containers were left as they were." >&2
  exit 1
fi

if ! "${compose[@]}" "${compose_files[@]}" up -d --force-recreate; then
  restore_previous
  echo "The new release did not start. Starting the previous release again." >&2
  "${compose[@]}" "${compose_files[@]}" up -d --force-recreate || true
  exit 1
fi

printf '%s\n' "$VERSION" >deployed-version
echo "Deployed official images for ${VERSION}."
echo "Confirm https://workadventure.termotubos.com.br/ loads."
"${compose[@]}" "${compose_files[@]}" ps
