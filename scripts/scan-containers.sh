#!/bin/bash
# Scan docker containers and output registry JSON
# Save to /root/.vps-projects/scan.json

REGISTRY_FILE="/root/.vps-projects/registry.json"
SCAN_FILE="/root/.vps-projects/scan.json"
PROJECTS_DIR="/root/.vps-projects"

mkdir -p "$PROJECTS_DIR"

# Get all containers with docker ps
CONTAINERS=$(docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}' 2>/dev/null)

# Load registry if exists
REGISTRY_NAMES='{}'
REGISTRY_URLS='{}'
if [ -f "$REGISTRY_FILE" ]; then
  REGISTRY_NAMES=$(jq -r 'to_entries | map({key: .key, value: .value.name}) | from_entries' "$REGISTRY_FILE" 2>/dev/null || echo '{}')
  REGISTRY_URLS=$(jq -r 'to_entries | map({key: .key, value: .value.url}) | from_entries' "$REGISTRY_FILE" 2>/dev/null || echo '{}')
fi

# Build JSON output
echo "{"

# Count containers
TOTAL=$(echo "$CONTAINERS" | grep -c '^' || echo 0)
COUNT=0

while IFS='|' read -r name status ports; do
  COUNT=$((COUNT + 1))
  
  # Get name from registry or use container name
  NICE_NAME=$(echo "$REGISTRY_NAMES" | jq -r ".\"$name\" // null" 2>/dev/null)
  [ "$NICE_NAME" = "null" ] && NICE_NAME="$name"
  
  URL=$(echo "$REGISTRY_URLS" | jq -r ".\"$name\" // null" 2>/dev/null)
  [ "$URL" = "null" ] && URL="null"
  
  # Determine type based on ports
  HAS_WEB=false
  if [[ "$ports" == *"80"* || "$ports" == *"300"* || "$ports" == *"8080"* || "$ports" == *"5678"* || "$ports" == *"7130"* ]]; then
    HAS_WEB=true
  fi
  
  if [ "$URL" = "null" ]; then
    URL="null"
  else
    URL="\"$URL\""
  fi
  
  echo "  \"$name\": {"
  echo "    \"container\": \"$name\","
  echo "    \"niceName\": \"$NICE_NAME\","
  echo "    \"status\": \"running\","
  echo "    \"ports\": \"$ports\","
  echo "    \"url\": $URL,"
  echo "    \"hasWeb\": $HAS_WEB"
  echo -n "  }"
  [ "$COUNT" -lt "$TOTAL" ] && echo "," || true
  
done <<< "$CONTAINERS"

echo ""
echo "}"