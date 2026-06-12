#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/assistant-xavier"
APP_USER="${APP_USER:-ubuntu}"

echo "Mise a jour du serveur..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "Installation des outils serveur..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates \
  curl \
  git \
  unzip \
  ufw

echo "Installation Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo usermod -aG docker "$APP_USER"

echo "Preparation du dossier application..."
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "Activation pare-feu..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "Installation terminee."
echo "Deconnecte-toi puis reconnecte-toi pour activer le groupe docker."
