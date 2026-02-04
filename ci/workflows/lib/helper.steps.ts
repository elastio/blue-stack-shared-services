import { Step } from "@elastio/ci";
import { deindent } from "@gustavnikolaj/string-utils";

export function cache(key: string, path: string, restoreKeys?: string): Step {
  return {
    uses: "actions/cache@v4",
    with: {
      key,
      path,
      "restore-keys": restoreKeys,
    },
  };
}

export function awsCredsStep(
  roleArn: string,
  region: string,
  duration = 3600,
): Step {
  return {
    name: "Configure AWS credentials",
    uses: "elastio/actions/aws-creds@v1",
    with: {
      role_to_assume: roleArn,
      region,
      role_duration_seconds: duration,
    },
  };
}

export function loginECRStep(registry_type = "private"): Step {
  return {
    id: "login-ecr",
    name: "Login to Amazon ECR",
    uses: "aws-actions/amazon-ecr-login@v2",
    with: {
      "mask-password": true,
      "skip-logout": true,
      "registry-type": registry_type,
    },
  };
}

export function exportVersionStep(): Step {
  return {
    name: "Read semantic version",
    uses: "mikefarah/yq@v4.48.1",
    with: {
      cmd: "echo VERSION=$(yq '.release' .semver.yaml) >> $GITHUB_ENV",
    },
  };
}

export enum CellEnvName {
  dev = "master",
  stage = "staging",
  prod = "production",
}

export function getCellConfigStep(
  cell_env_name: CellEnvName,
  config_file_path: string,
): Step {
  return {
    name: "Get cell configuration",
    run: deindent`\
      CFG=$(jq '."${cell_env_name}"' < ${config_file_path})

      echo "CELL_REGION=$(echo $CFG | jq -r '.region')" >> $GITHUB_ENV
      echo "CELL_ENV_TYPE=$(echo $CFG | jq -r '.env_type')" >> $GITHUB_ENV
      echo "CELL_NAME=$(echo $CFG | jq -r '.name')" >> $GITHUB_ENV
      echo "CELL_ACCOUNT_ID=$(echo $CFG | jq -r '.aws_account_id')" >> $GITHUB_ENV
      echo "CELL_HOSTED_ZONE_NAME=$(echo $CFG | jq -r '.cell_hosted_zone_name')" >> $GITHUB_ENV
      echo "CELL_DNS_NAME=$(echo $CFG | jq -r '.dns_name')" >> $GITHUB_ENV
    `,
  };
}

export function getDynamicCellConfigStep(config_file_path: string): Step {
  return {
    name: "Get cell configuration",
    run: deindent`\
      CFG=$(jq ".\\"\${CELL_ENV_NAME}\\"" < ${config_file_path})

      echo "CELL_REGION=$(echo $CFG | jq -r '.region')" >> $GITHUB_ENV
      echo "CELL_ENV_TYPE=$(echo $CFG | jq -r '.env_type')" >> $GITHUB_ENV
      echo "CELL_NAME=$(echo $CFG | jq -r '.name')" >> $GITHUB_ENV
      echo "CELL_ACCOUNT_ID=$(echo $CFG | jq -r '.aws_account_id')" >> $GITHUB_ENV
      echo "CELL_HOSTED_ZONE_NAME=$(echo $CFG | jq -r '.cell_hosted_zone_name')" >> $GITHUB_ENV
      echo "CELL_DNS_NAME=$(echo $CFG | jq -r '.dns_name')" >> $GITHUB_ENV
    `,
  };
}

export function configureEnvStep(): Step {
  return {
    name: "Configure environment",
    run: deindent`
      set -eu

      declare -A env_map=(
        ["refs/heads/master"]="development master"
        ["refs/heads/staging"]="staging staging"
        ["refs/heads/production"]="production production"
      )

      git_ref="\${{ github.ref }}"

      if [[ -v env_map[$git_ref] ]]; then
        IFS=' ' read -r environment cell_env_name <<< "\${env_map[$git_ref]}"
      else
        printf "Error: Unexpected branch '%s'\\n" "$git_ref"
        exit 1
      fi

      echo "ENVIRONMENT=\${environment}" >> $GITHUB_ENV
      echo "CELL_ENV_NAME=\${cell_env_name}" >> $GITHUB_ENV
    `,
  };
}

export function configurePromoteEnvStep(): Step {
  return {
    name: "Configure promotion environment",
    run: deindent`
      set -euxo pipefail

      declare -A env_map=(
        ["refs/heads/staging"]="development master"
        ["refs/heads/production"]="staging staging"
      )

      git_ref="\${{ github.ref }}"

      if [[ -v env_map[$git_ref] ]]; then
        IFS=' ' read -r environment branch <<< "\${env_map[$git_ref]}"
      else
        printf "Error: Unexpected branch '%s'\\n" "$git_ref"
        exit 1
      fi

      echo "ENVIRONMENT_TO_PROMOTE=\${environment}" >> $GITHUB_ENV
      echo "BRANCH_TO_PROMOTE=\${branch}" >> $GITHUB_ENV
    `,
  };
}

export function configureRegistryStep(service = "shared-services"): Step {
  return {
    name: "Configure registry environment",
    run: deindent`
      set -eu
      echo "REPOSITORY=\${ENVIRONMENT}/blues/${service}/service" >> "$GITHUB_ENV"
      echo "REGISTRY=\${{ steps.login-ecr.outputs.registry }}" >> "$GITHUB_ENV"
    `,
  };
}

export function loginECRWithRegistriesStep(registries: string): Step {
  return {
    id: "login-ecr",
    name: "Login to Amazon ECR",
    uses: "aws-actions/amazon-ecr-login@v2",
    with: {
      registries,
      "mask-password": "true",
      "skip-logout": "true",
    },
  };
}
