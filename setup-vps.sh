#!/bin/bash
# Scaliyo VPS Setup Script
# Run on: administrator@108.181.203.196
set -e

echo "=== Scaliyo VPS Setup ==="

# Update system
sudo apt update && sudo apt upgrade -y

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Create deployment directory structure (symlink-based zero-downtime)
sudo mkdir -p /var/www/scaliyo/releases
sudo chown -R administrator:administrator /var/www/scaliyo

# Remove default nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Copy nginx config
sudo cp nginx/aurafunnel.conf /etc/nginx/sites-available/scaliyo
sudo ln -sf /etc/nginx/sites-available/scaliyo /etc/nginx/sites-enabled/

# Test and reload nginx
sudo nginx -t && sudo systemctl reload nginx

# Enable and start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Open firewall ports
if command -v ufw &> /dev/null && sudo ufw status | grep -q "active"; then
    sudo ufw allow 'Nginx Full'
    sudo ufw allow OpenSSH
    echo "Firewall rules updated"
fi

# SSL cert (run after DNS is pointed)
# sudo certbot --nginx -d scaliyo.com -d www.scaliyo.com

echo ""
echo "=== VPS is ready! ==="
echo "Next steps:"
echo "  1. Point DNS A record to this server IP"
echo "  2. Run: sudo certbot --nginx -d scaliyo.com -d www.scaliyo.com"
echo "  3. Push to master to trigger auto-deploy"
echo ""
echo "Deploy dir: /var/www/scaliyo/current (symlink to latest release)"
echo "Rollback:   ls /var/www/scaliyo/releases/ then: ln -sfn /var/www/scaliyo/releases/<release> /var/www/scaliyo/current"
