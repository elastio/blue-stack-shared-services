import { workflow } from "@elastio/ci";
import {
  infraShellImage,
  isDeployableBranch,
  aws_bs_staging,
} from "./lib/constants";

import * as checks from "./lib/checks.jobs";
import { imageBuild } from "./lib/image.jobs";
import { deployToK8S, generateSBOM } from "./lib/deploy.jobs";

export const workflowFile = workflow.file({
  name: "ci",
  on: {
    pull_request: {
      branches: ["master", "staging", "production"],
    },
    push: {
      branches: ["master"],
    },
    workflow_dispatch: {},
  },
  jobs: {
    ...checks.jobs,
    "build-image": {
      name: "Build shared-services image",
      if: "needs.check-image-version.outputs.has_source_changes != 'false'",
      needs: [
        "typos",
        "ci-checks",
        "check-golang-fmt",
        "check-golang-lint",
        "check-build",
        "check-image-version",
      ],
      ...imageBuild(),
    },
    "generate-sbom": {
      name: `Generate SBOM`,
      if: isDeployableBranch,
      needs: [
        "typos",
        "ci-checks",
        "check-golang-fmt",
        "check-golang-lint",
        "check-build",
        "check-image-version",
      ],
      ...generateSBOM(),
    },
    "deploy-to-k8s": {
      name: "Deploy to Kubernetes",
      if: isDeployableBranch,
      needs: ["build-image"],
      container: {
        image: infraShellImage,
        options: "--user elastio",
      },
      ...deployToK8S(
        "shared-services",
        aws_bs_staging.rw_role_arn,
        aws_bs_staging.region,
      ),
    },
  },
  concurrency: {
    group: `\${{ ( ${isDeployableBranch} ) && 'release' || github.ref }}`,
    "cancel-in-progress": `\${{ ! ( ${isDeployableBranch} ) }}`,
  },
});
