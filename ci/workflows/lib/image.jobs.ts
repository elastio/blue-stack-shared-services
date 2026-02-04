import { deindent } from "@gustavnikolaj/string-utils";
import { Job, step } from "@elastio/ci";
import {
  awsCredsStep,
  loginECRStep,
  exportVersionStep,
  configureEnvStep,
  configurePromoteEnvStep,
  configureRegistryStep,
  loginECRWithRegistriesStep,
} from "./helper.steps";
import {
  isDeployableBranch,
  isMasterBranch,
  aws_bs_resources,
  defaultRunner,
} from "./constants";

export function imageBuild(
  service = "shared-services",
  environment = "development",
): Job {
  const labelPrefix = "org.opencontainers.image";
  const imageBase = `\${{ steps.login-ecr.outputs.registry }}/${environment}/blues/${service}/service`;

  return {
    "runs-on": defaultRunner,
    steps: [
      step.checkout(),
      awsCredsStep(
        // Check if the branch is deployable to decide which role to use
        // This statement acts kind of like a ternary operator
        `\${{ (${isDeployableBranch}) && '${aws_bs_resources.rw_role_arn}' || '${aws_bs_resources.ro_role_arn}' }}`,
        aws_bs_resources.region,
      ),
      loginECRStep(),
      exportVersionStep(),
      {
        uses: "docker/build-push-action@v6",
        with: {
          pull: true,
          push: `\${{ ${isMasterBranch} }}`,
          tags: deindent`
            ${imageBase}:latest
            ${imageBase}:\${{ env.VERSION }}
            ${imageBase}:\${{ github.sha }}
          `,
          labels: deindent`
            ${labelPrefix}.version=\${{ env.VERSION }}
            ${labelPrefix}.ref.name=\${{ github.ref_name }}
            ${labelPrefix}.ref.sha=\${{ github.sha }}
          `,
          secrets: "DEPS_TOKEN=${{ secrets.TSAR_FERRIS_GITHUB_TOKEN }}",
          "build-args": "VERSION=\${{ github.sha }}",
        },
      },
    ],
  };
}

export function configurePromotionJob(): Job {
  return {
    if: isDeployableBranch,
    "runs-on": defaultRunner,
    outputs: {
      environment: "${{ steps.get-output.outputs.environment }}",
      environment_to_promote:
        "${{ steps.get-output.outputs.environment_to_promote }}",
      branch_to_promote: "${{ steps.get-output.outputs.branch_to_promote }}",
      commit_to_promote:
        "${{ steps.get-commit-to-promote.outputs.commit_sha }}",
    },
    steps: [
      step.checkout(),
      {
        name: "Unshallow the repository",
        run: "git fetch --unshallow || git fetch --all",
      },
      configureEnvStep(),
      configurePromoteEnvStep(),
      {
        id: "get-output",
        name: "Configure environment output",
        run: deindent`
          set -euo pipefail

          echo "environment=\${ENVIRONMENT}" >> \${GITHUB_OUTPUT}
          echo "environment_to_promote=\${ENVIRONMENT_TO_PROMOTE}" >> \${GITHUB_OUTPUT}
          echo "branch_to_promote=\${BRANCH_TO_PROMOTE}" >> \${GITHUB_OUTPUT}
        `,
      },
      {
        id: "get-commit-to-promote",
        name: "Get the commit to promote",
        run: deindent`
          set -euo pipefail

          echo "Promotion from branch: $ENVIRONMENT_TO_PROMOTE"
          echo "Promotion to branch: $ENVIRONMENT"
          echo "Current commit: \${{ github.sha }}"

          found_commit=""
          while read commit; do
            if git branch --remote --contains "$commit" | grep -q "origin/$BRANCH_TO_PROMOTE\$"; then
              echo "Selected commit $commit"
              echo "commit_sha=\${commit}" >> \${GITHUB_OUTPUT}
              found_commit="$commit"
              break
            fi
            echo "Skipping commit $commit"
          done < <(git rev-list -n 300 HEAD)

          if [[ -z "$found_commit" ]]; then
            echo "Commit to promote not found" >&2
            exit 1
          fi
        `,
      },
    ],
  };
}

export function hotfixImageBuild(service = "shared-services"): Job {
  return {
    name: `Build ${service} image`,
    "runs-on": defaultRunner,
    steps: [
      step.checkout(),
      awsCredsStep(aws_bs_resources.rw_role_arn, aws_bs_resources.region),
      loginECRWithRegistriesStep("${{ secrets.BS_RESOURCES_AWS_ACCOUNT_ID }}"),
      configureEnvStep(),
      configureRegistryStep(service),
      {
        uses: "docker/build-push-action@v6",
        with: {
          pull: true,
          push: true,
          tags: deindent`
            \${{ env.REGISTRY }}/\${{ env.REPOSITORY }}:latest
            \${{ env.REGISTRY }}/\${{ env.REPOSITORY }}:\${{ github.sha }}
          `,
          labels: deindent`
            github.sha=\${{ github.sha }}
            github.ref=\${{ github.ref }}
          `,
          secrets: "DEPS_TOKEN=${{ secrets.TSAR_FERRIS_GITHUB_TOKEN }}",
          "build-args": "VERSION=\${{ github.sha }}",
        },
      },
    ],
  };
}

export function imagePromote(service = "shared-services"): Job {
  return {
    name: `Promote ${service} image`,
    if: isDeployableBranch,
    "runs-on": defaultRunner,
    steps: [
      step.checkout(),
      step.install.tool("crane"),
      awsCredsStep(aws_bs_resources.rw_role_arn, aws_bs_resources.region),
      loginECRWithRegistriesStep("${{ secrets.BS_RESOURCES_AWS_ACCOUNT_ID }}"),
      configureEnvStep(),
      configureRegistryStep(service),
      configurePromoteEnvStep(),
      {
        name: "Promote image",
        run: deindent`
          set -eu

          IMAGE_TAG_TO_PROMOTE="\${{ needs.configure-promotion.outputs.commit_to_promote }}"
          IMAGE_TAG="\${{ github.sha }}"

          echo "Moving image from $ENVIRONMENT_TO_PROMOTE to $ENVIRONMENT"
          echo "Source tag: $IMAGE_TAG_TO_PROMOTE"
          echo "Destination tag: $IMAGE_TAG"

          IMAGE_PATH=$REGISTRY/$REPOSITORY

          IMAGE_URL=$IMAGE_PATH:$IMAGE_TAG
          IMAGE_URL_TO_PROMOTE=\${IMAGE_PATH/$ENVIRONMENT/$ENVIRONMENT_TO_PROMOTE}:$IMAGE_TAG_TO_PROMOTE

          crane cp "\${IMAGE_URL_TO_PROMOTE}" "\${IMAGE_URL}"
        `,
      },
    ],
  };
}
