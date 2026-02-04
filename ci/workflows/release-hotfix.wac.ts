import { workflow, job, Jobs, step } from "@elastio/ci";
import { version as ci_version } from "@elastio/ci/package.json";
import { deindent } from "@gustavnikolaj/string-utils";
import {
  isDeployableBranch,
  defaultWorkflowEnv,
  ciImage,
  defaultRunner,
} from "./lib/constants";
import { withWaitForAllChecks } from "./lib/misc/helpers";
import { cache } from "./lib/helper.steps";
import { hotfixImageBuild } from "./lib/image.jobs";
import { releaseDeployToK8S } from "./lib/deploy.jobs";

// Check jobs for hotfix (without check-image-version)
const hotfixChecks: Jobs = job.prefixed("🅲 ", {
  typos: {
    "runs-on": "ubuntu-latest",
    steps: [step.checkout(), { uses: "crate-ci/typos@v1.39.0" }],
  },

  "ci-checks": {
    uses: `elastio/ci-lib/.github/workflows/ci-checks.yml@v${ci_version}`,
  },

  "check-golang-fmt": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [
      step.checkout(),
      { run: "gofmt -w ." },
      {
        run: deindent`
          git diff --exit-code --color=always \
            || (echo -e "\n\nRun gofmt and commit the changes" && exit 1)
        `,
      },
    ],
  },

  "check-golang-lint": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [step.checkout(), { uses: "golangci/golangci-lint-action@v8" }],
  },

  "check-build": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [
      step.checkout(),
      cache(
        "${{ runner.os }}-go-build-${{ hashFiles('go.mod') }}",
        "/go/pkg/mod",
      ),
      {
        name: "Build",
        run: deindent`
          go mod download
          go build ./...
        `,
      },
    ],
  },
});

export const workflowFile = workflow.file({
  on: {
    workflow_dispatch: {},
  },
  jobs: {
    ...withWaitForAllChecks(hotfixChecks),
    "build-image": {
      if: isDeployableBranch,
      needs: ["wait-all-checks"],
      ...hotfixImageBuild(),
    },
    "deploy-to-k8s": {
      if: isDeployableBranch,
      needs: ["build-image"],
      ...releaseDeployToK8S(),
    },
  },
  concurrency: {
    group: `\${{ ( ${isDeployableBranch} ) && 'release' || github.ref }}`,
    "cancel-in-progress": `\${{ ! ( ${isDeployableBranch} ) }}`,
  },
  env: defaultWorkflowEnv,
});
