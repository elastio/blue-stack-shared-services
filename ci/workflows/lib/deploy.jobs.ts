import { collapse, deindent } from "@gustavnikolaj/string-utils";
import { Job, step } from "@elastio/ci";
import {
  awsCredsStep,
  CellEnvName,
  getCellConfigStep,
  getDynamicCellConfigStep,
  configureEnvStep,
} from "./helper.steps";
import {
  cells_config_file,
  defaultRunner,
  infraShellImage,
  isDeployableBranch,
} from "./constants";

export function generateSBOM(): Job {
  return {
    "runs-on": defaultRunner,
    steps: [
      step.checkout(),
      {
        uses: "elastio/actions/install@v1",
        with: {
          tool: "trivy",
        },
      },
      {
        name: "Generate SBOM",
        run: "trivy repo go.mod --format cyclonedx --output result.cdx.json",
      },
      {
        uses: "DependencyTrack/gh-upload-sbom@v3",
        with: {
          serverHostname: "deps-track.elastio.dev",
          apiKey: "${{ secrets.DEPENDENCY_TRACK_API_KEY }}",
          autoCreate: "true",
          bomFilename: "result.cdx.json",
          projectName: "blue-stack-shared-services",
          projectVersion: "${{ github.ref_name }}",
          projectTags: "blue-stack,golang",
        },
      },
    ],
  };
}

export function deployToK8S(
  service = "shared-services",
  aws_role_arn: string,
  aws_region: string,
): Job {
  return {
    "runs-on": defaultRunner,
    env: {
      HOME: "/home/elastio", // Required for helm to work
    },
    steps: [
      step.checkout(),
      {
        name: "Add Helm repo",
        run: collapse`
          helm repo add elastio-private
            'https://dl.cloudsmith.io/basic/elastio/private/helm/charts/'
            --username '\${{ secrets.CLOUDSMITH_HELM_REPO_USERNAME }}'
            --password '\${{ secrets.CLOUDSMITH_HELM_REPO_PASSWORD }}' || true
        `,
      },
      awsCredsStep(aws_role_arn, aws_region),
      { run: "helm dep build ./.helm" },
      getCellConfigStep(CellEnvName.dev, cells_config_file),
      {
        name: "Update kube configuration",
        run: "aws eks update-kubeconfig --name $CELL_ENV_TYPE-$CELL_NAME",
      },
      {
        name: "Deploy to Kubernetes",
        run: deindent`
          helm secrets upgrade \
            --install \
            --namespace blues \
            --wait ${service} \
            --timeout 600s \
            --set "global.awsRegion=$CELL_REGION" \
            --set "global.mskClusterName=kafka-msk-$CELL_REGION-$CELL_ENV_TYPE-$CELL_NAME" \
            --set "global.environment=$CELL_ENV_TYPE" \
            --set "global.commit=\${{ github.sha }}" \
            --set "global.branch=\${{ github.ref_name }}" \
            --set "global.buildID=\${{ github.run_id }}" \
            --set "global.cellDnsName=$CELL_ACCOUNT_ID-$CELL_REGION-$CELL_ENV_TYPE-$CELL_NAME.$CELL_HOSTED_ZONE_NAME" \
            --set "global.dnsName=$CELL_DNS_NAME" \
            -f ./.helm/secrets.$CELL_ENV_TYPE.yaml \
            -f ./.helm/values.$CELL_ENV_TYPE.yaml \
            ./.helm
          `,
      },
      {
        name: "Patch Deployment with ServiceAccount",
        run: deindent`
          kubectl patch deployment ${service} -n blues \
            --type='strategic' \
            -p '{"spec":{"template":{"spec":{"serviceAccountName":"${service}-service-account"}}}}'
        `,
      },
    ],
  };
}

const configureDeploymentStep = deindent`
  set -euo pipefail

  case "\${{ github.ref }}" in
    "refs/heads/master")
      echo "AWS_ROLE_ARN=\${{ secrets.CI_BLUE_STACK_STAGING_AWS_ROLE_ARN }}" >> $GITHUB_ENV
      echo "AWS_REGION=\${{ env.CI_BLUE_STACK_STAGING_AWS_DEFAULT_REGION }}" >> $GITHUB_ENV
      ;;
    "refs/heads/staging")
      echo "AWS_ROLE_ARN=\${{ secrets.CI_BLUE_STACK_STAGING_AWS_ROLE_ARN }}" >> $GITHUB_ENV
      echo "AWS_REGION=\${{ env.CI_BLUE_STACK_STAGING_AWS_DEFAULT_REGION }}" >> $GITHUB_ENV
      ;;
    "refs/heads/production")
      echo "AWS_ROLE_ARN=\${{ secrets.CI_BLUE_STACK_PRODUCTION_AWS_ROLE_ARN }}" >> $GITHUB_ENV
      echo "AWS_REGION=\${{ env.CI_BLUE_STACK_PRODUCTION_AWS_DEFAULT_REGION }}" >> $GITHUB_ENV
      ;;
    *)
      echo "Unknown environment, exiting."
      exit 1
      ;;
  esac
`;

export function releaseDeployToK8S(service = "shared-services"): Job {
  return {
    name: `Deploy ${service} to Kubernetes`,
    if: isDeployableBranch,
    "runs-on": defaultRunner,
    container: {
      image: infraShellImage,
      options: "--user elastio",
    },
    env: {
      HOME: "/home/elastio",
    },
    steps: [
      step.checkout(),
      {
        name: "Add Helm repo",
        run: collapse`
          helm repo add elastio-private
            'https://dl.cloudsmith.io/basic/elastio/private/helm/charts/'
            --username '\${{ secrets.CLOUDSMITH_HELM_REPO_USERNAME }}'
            --password '\${{ secrets.CLOUDSMITH_HELM_REPO_PASSWORD }}' || true
        `,
      },
      configureEnvStep(),
      configureDeploymentStep,
      awsCredsStep("${{ env.AWS_ROLE_ARN }}", "${{ env.AWS_REGION }}"),
      { run: "helm dep build ./.helm" },
      getDynamicCellConfigStep(cells_config_file),
      {
        name: "Update kube configuration",
        run: "aws eks update-kubeconfig --name $CELL_ENV_TYPE-$CELL_NAME",
      },
      {
        name: "Deploy to Kubernetes",
        run: deindent`
          helm secrets upgrade \
            --install \
            --namespace blues \
            --wait ${service} \
            --timeout 600s \
            --set "global.awsRegion=$CELL_REGION" \
            --set "global.mskClusterName=kafka-msk-$CELL_REGION-$CELL_ENV_TYPE-$CELL_NAME" \
            --set "global.environment=$CELL_ENV_TYPE" \
            --set "global.commit=\${{ github.sha }}" \
            --set "global.branch=\${{ github.ref_name }}" \
            --set "global.buildID=\${{ github.run_id }}" \
            --set "global.cellDnsName=$CELL_ACCOUNT_ID-$CELL_REGION-$CELL_ENV_TYPE-$CELL_NAME.$CELL_HOSTED_ZONE_NAME" \
            --set "global.dnsName=$CELL_DNS_NAME" \
            -f ./.helm/secrets.$CELL_ENV_TYPE.yaml \
            -f ./.helm/values.$CELL_ENV_TYPE.yaml \
            ./.helm
          `,
      },
      {
        name: "Patch Deployment with ServiceAccount",
        run: deindent`
          kubectl patch deployment ${service} -n blues \
            --type='strategic' \
            -p '{"spec":{"template":{"spec":{"serviceAccountName":"${service}-service-account"}}}}'
        `,
      },
    ],
  };
}
