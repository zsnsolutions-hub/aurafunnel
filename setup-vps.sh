#!/bin/bash
# AuraFunnel VPS Setup Script
# Run this on: administrator@108.181.203.196

set -e

echo "=== AuraFunnel VPS Setup ==="

# Update system
sudo apt update && sudo apt upgrade -y

# Install Nginx
sudo apt install -y nginx

# Create web root
sudo mkdir -p /var/www/aurafunnel
sudo chown -R administrator:administrator /var/www/aurafunnel

# Remove default nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Install Certbot for SSL (optional — run later when you have a domain)
# sudo apt install -y certbot python3-certbot-nginx

# Enable and start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Open firewall ports (if ufw is active)
if command -v ufw &> /dev/null && sudo ufw status | grep -q "active"; then
    sudo ufw allow 'Nginx Full'
    sudo ufw allow OpenSSH
    echo "Firewall rules updated"
fi

echo ""
echo "=== VPS is ready! ==="
echo "Next steps:"
echo "  1. Set GitHub secrets (see below)"
echo "  2. Push to master to trigger auto-deploy"
echo ""
echo "Test: curl http://108.181.203.196"
