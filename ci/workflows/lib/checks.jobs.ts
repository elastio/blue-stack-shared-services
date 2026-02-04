import { deindent } from "@gustavnikolaj/string-utils";
import { version as ci_version } from "@elastio/ci/package.json";
import { job, Jobs, step } from "@elastio/ci";
import { aws_bs_resources, ciImage, defaultRunner } from "./constants";
import { awsCredsStep, cache, exportVersionStep } from "./helper.steps";

export const jobs: Jobs = job.prefixed("🅲 ", {
  typos: {
    "runs-on": "ubuntu-latest",
    steps: [
      step.checkout(),
      { uses: "crate-ci/typos@v1.39.0" },
    ],
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
      {
        run: "gofmt -w .",
      },
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
    steps: [
      step.checkout(),
      {
        uses: "golangci/golangci-lint-action@v8",
      },
    ],
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

  "check-image-version": {
    if: "github.base_ref == 'master' || github.ref == 'refs/heads/master'",
    "runs-on": defaultRunner,
    permissions: {
      contents: "read",
      "pull-requests": "read",
      "id-token": "write",
    },
    outputs: {
      has_source_changes: "${{ steps.changed.outputs.verdict }}",
    },
    steps: [
      step.checkout(),
      exportVersionStep(),
      awsCredsStep(aws_bs_resources.ro_role_arn, aws_bs_resources.region),
      {
        name: "Check source changes",
        uses: "dorny/paths-filter@v3",
        id: "changed",

        with: {
          filters: deindent`
            verdict: [config/**, internal/**, logger/**, scripts/**, main.go, go.mod, go.sum, .semver.yaml, Dockerfile]
          `,
        },
      },
      {
        name: "Check whether image version already exists",
        if: "steps.changed.outputs.verdict == 'true'",
        run: deindent`
          if \
            aws ecr describe-images \
              --repository-name development/blues/shared-services/service \
              --image-ids imageTag=\${{ env.VERSION }} \
              --region ${aws_bs_resources.region}; \
          then \
            echo "Image with tag \${{ env.VERSION }} already exists. Please update version in .semver.yaml."; \
            exit 1; \
          fi
        `,
      },
    ],
  },
});
