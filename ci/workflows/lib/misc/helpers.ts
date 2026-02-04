import { deindent } from "@gustavnikolaj/string-utils";
import _ from "lodash";
import { Job, Jobs } from "@elastio/ci";
import { defaultRunner, infraShellImage } from "../constants";

export const waitAllChecksScript = deindent`
  #!/bin/bash

  # Set error handling
  set -euo pipefail

  json_file="needs.json"

  # Store dependent job results
  cat <<EOF > "$json_file"
  \${{ toJson(needs) }}
  EOF

  # Colors for output
  RED='\\033[0;31m'
  GREEN='\\033[0;32m'
  YELLOW='\\033[1;33m'
  GRAY='\\033[0;90m'
  NC='\\033[0m' # No Color
  BOLD='\\033[1m'

  # Function to print status with color
  print_status() {
    local status=$1
    case $status in
      "success")
        echo -e "\${GREEN}✓ SUCCESS\${NC}"
        ;;
      "failure")
        echo -e "\${RED}✗ FAILURE\${NC}"
        ;;
      "cancelled")
        echo -e "\${YELLOW}⊘ CANCELLED\${NC}"
        ;;
      "skipped")
        echo -e "\${GRAY}○ SKIPPED\${NC}"
        ;;
      *)
        echo -e "\${YELLOW}? UNKNOWN: \${status}\${NC}"
        ;;
    esac
  }

  # Check if file exists
  if [ ! -f "$json_file" ]; then
    echo "Error: File $json_file does not exist"
    exit 1
  fi

  # Get counts for different statuses
  total_jobs=$(jq -r 'length' "$json_file")
  failed_jobs=$(jq -r 'to_entries | map(select(.value.result == "failure")) | length' "$json_file")
  cancelled_jobs=$(jq -r 'to_entries | map(select(.value.result == "cancelled")) | length' "$json_file")
  skipped_jobs=$(jq -r 'to_entries | map(select(.value.result == "skipped")) | length' "$json_file")
  successful_jobs=$(jq -r 'to_entries | map(select(.value.result == "success")) | length' "$json_file")

  # Print job results
  jq -r 'to_entries | .[] | "\\(.key) \\(.value.result)"' "$json_file" | while read -r job result; do
    printf "%-20s" "$job"  # Pad job name to 20 characters for alignment
    print_status "$result"
  done

  echo
  echo -e "\${BOLD}Summary:\${NC}"
  echo -e "Total jobs: $total_jobs"
  echo -e "  \${GREEN}Successful: $successful_jobs\${NC}"
  [ $skipped_jobs -gt 0 ] && echo -e "  \${GRAY}Skipped: $skipped_jobs\${NC}"
  [ $cancelled_jobs -gt 0 ] && echo -e "  \${YELLOW}Cancelled: $cancelled_jobs\${NC}"
  [ $failed_jobs -gt 0 ] && echo -e "  \${RED}Failed: $failed_jobs\${NC}"

  # Determine exit status
  if [ "$failed_jobs" -gt 0 ] || [ "$cancelled_jobs" -gt 0 ]; then
    echo
    if [ "$failed_jobs" -gt 0 ] && [ "$cancelled_jobs" -gt 0 ]; then
      echo -e "\${RED}\${BOLD}Pipeline failed: Found $failed_jobs failed and $cancelled_jobs cancelled jobs!\${NC}"
    elif [ "$failed_jobs" -gt 0 ]; then
      echo -e "\${RED}\${BOLD}Pipeline failed: Found $failed_jobs failed jobs!\${NC}"
    else
      echo -e "\${YELLOW}\${BOLD}Pipeline cancelled: Found $cancelled_jobs cancelled jobs!\${NC}"
    fi
    exit 1
  fi
`;

export const waitAllChecksJob: Job = {
  "runs-on": defaultRunner,
  container: {
    image: infraShellImage,
    options: "--user elastio",
  },
  if: "${{ always() }}",
  steps: [
    {
      name: "Check all dependent jobs",
      run: waitAllChecksScript,
    },
  ],
};

export function withWaitForAllChecks(jobs: Jobs): Jobs {
  return {
    ...jobs,
    "wait-all-checks": {
      needs: _.keys(jobs) as any,
      ...waitAllChecksJob,
    },
  };
}
