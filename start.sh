#!/bin/bash

LAN_IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')

if [ -z "$LAN_IP" ]; then
  LAN_IP=$(hostname -I | awk '{print $1}')
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         CACAOTIQUE  🍫               ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║  Display : http://localhost:3000/server.html  ║"
echo "  ║  Mobile  : http://$LAN_IP:3000"
echo "  ╚══════════════════════════════════════╝"
echo ""

node server.js
